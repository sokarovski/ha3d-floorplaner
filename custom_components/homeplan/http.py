"""Authenticated data views and a separate public executable-only artifact view."""

import ipaddress
import json
import re
from pathlib import Path
from urllib.parse import quote

from aiohttp import web
from homeassistant.auth.models import User
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN, MAX_ASSET, MAX_CONFIG
from .errors import HomeplanError
from .runtime import HomeplanRuntime, now
from .validation import (
    checked_id,
    inside,
    integer,
    items,
    parse_json,
    parse_validated,
    record,
    safe_path,
    text,
    validate,
)

# Fixed response types for proxied remote content; never let a browser sniff them as HTML.
_PRIVATE_HEADERS = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
}


def runtime(hass: HomeAssistant) -> HomeplanRuntime:
    result = hass.data.get(DOMAIN)
    if not isinstance(result, HomeplanRuntime):
        raise HomeplanError(
            503, "integrationUnavailable", "Homeplan is currently unloaded."
        )
    return result


def response(value: object, status: int = 200) -> web.Response:
    return web.Response(
        text=json.dumps(value, ensure_ascii=False),
        status=status,
        content_type="application/json",
        headers=_PRIVATE_HEADERS,
    )


async def body(hass: HomeAssistant, request: web.Request) -> dict[str, object]:
    chunks = bytearray()
    async for chunk in request.content.iter_chunked(131072):
        chunks.extend(chunk)
        if len(chunks) > MAX_CONFIG:
            raise HomeplanError(
                413, "tooLarge", "The request exceeds the settings size limit."
            )
    # Settings envelopes may reach 16 MiB; parse them off the event loop.
    return record(await hass.async_add_executor_job(parse_json, bytes(chunks)))


def _read_house(directory: Path) -> dict[str, object]:
    """Read and validate a copied house document (blocking; run it in an executor)."""
    return parse_validated("House", inside(directory, "house.json").read_bytes())


class HomeplanView(HomeAssistantView):
    url = "/api/homeplan/{tail:.*}"
    name = "api:homeplan"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request, tail: str) -> web.StreamResponse:
        return await self._handle(request)

    async def post(self, request: web.Request, tail: str) -> web.StreamResponse:
        return await self._handle(request)

    async def patch(self, request: web.Request, tail: str) -> web.StreamResponse:
        return await self._handle(request)

    async def delete(self, request: web.Request, tail: str) -> web.StreamResponse:
        return await self._handle(request)

    async def _handle(self, request: web.Request) -> web.StreamResponse:
        try:
            app = runtime(self.hass)
            tail = request.match_info["tail"]
            parts = tail.split("/")
            read_only = request.method == "GET" and (
                parts[0] in ("bootstrap", "config", "houses", "remote", "frontend")
            )
            user = request.get("hass_user")
            if not read_only and (not isinstance(user, User) or not user.is_admin):
                raise HomeplanError(
                    403,
                    "forbidden",
                    "An HA administrator is required to change Homeplan settings.",
                )
            payload = (
                await body(self.hass, request)
                if request.method in ("POST", "PATCH")
                else {}
            )
            return await self._dispatch(app, request, parts, payload)
        except HomeplanError as err:
            return response(err.envelope(), err.status)
        except (OSError, ValueError, KeyError):
            return response(
                HomeplanError(
                    422,
                    "invalidDocument",
                    "The requested data is missing or invalid; open House setup or native integration recovery.",
                ).envelope(),
                422,
            )

    async def _dispatch(
        self,
        app: HomeplanRuntime,
        request: web.Request,
        parts: list[str],
        payload: dict[str, object],
    ) -> web.StreamResponse:
        method = request.method
        config = app.configuration.snapshot()
        if parts == ["bootstrap"] and method == "GET":
            return response(
                {
                    "revision": config["revision"],
                    "recovery": app.recovery,
                    "connection": config["connection"],
                    "viewer": config["viewer"],
                    "frontend": {"shipped": app.shipped, **record(config["frontend"])},
                    "protocols": {"loader": 1, "api": 1},
                }
            )
        if parts == ["client-address"] and method == "GET":
            return response({"address": _client_address(request)})
        if parts == ["connection"]:
            if method == "GET":
                return response(
                    {"revision": config["revision"], "connection": config["connection"]}
                )
            if method == "PATCH":
                return response(await app.connection_patch(payload))
        if parts == ["config"]:
            if method == "GET":
                return response(
                    {"revision": config["revision"], "configuration": config}
                )
            if method == "PATCH":
                return response(await app.config_patch(payload))
        if parts == ["source", "connect"] and method == "POST":
            return response(await app.connect(payload))
        if len(parts) >= 3 and parts[:2] == ["source", "houses"]:
            house_id = checked_id(parts[2])
            if len(parts) == 4 and parts[3] == "use" and method == "POST":
                status, result = await app.use_house(house_id, payload)
                return response(result, status)
            if len(parts) == 3 and method == "GET":
                local = record(config["houses"]).get(house_id)
                base = (
                    ""
                    if local is None
                    else "?baseRevisionId=" + text(record(local)["sourceRevisionId"])
                )
                metadata = await app.source().json(
                    f"houses/{house_id}/snapshot-source{base}", "SnapshotSource"
                )
                if (
                    local is not None
                    and record(local)["sourceUrl"]
                    != record(config["connection"])["builderUrl"]
                ):
                    metadata["relation"] = "different"
                return response({"checkedAt": now(), **metadata})
        if parts == ["frontend"] and method == "GET":
            return response({"shipped": app.shipped, **record(config["frontend"])})
        if parts == ["frontend", "upgrade"] and method == "POST":
            validate("UpgradeRequest", payload)
            return response(
                {"job": await app.start_job("panelUpgrade", None, payload)}, 202
            )
        if parts == ["frontend", "restore-packaged"] and method == "POST":
            validate("RevisionRequest", payload)

            def restore(value: dict[str, object]) -> None:
                current = record(value["frontend"])
                value["frontend"] = {"active": None, "previous": current["active"]}

            updated = await app.configuration.mutate(
                restore, integer(payload["expectedRevision"])
            )
            return response(
                {
                    "revision": updated["revision"],
                    "frontend": updated["frontend"],
                    "reloadRequired": True,
                }
            )
        if parts == ["jobs"] and method == "GET":
            return response({"jobs": app.jobs})
        if len(parts) == 2 and parts[0] == "jobs":
            checked_id(parts[1])
            if method == "DELETE":
                return response({"job": await app.cancel(parts[1])})
            if method == "GET":
                job = next((item for item in app.jobs if item["id"] == parts[1]), None)
                if job is None:
                    raise HomeplanError(404, "notFound", "The job was not found.")
                return response({"job": job})
        if parts == ["houses"] and method == "GET":
            houses: list[dict[str, object]] = []
            for house_id, raw in record(config["houses"]).items():
                metadata = record(raw)
                try:
                    directory = app.house_path(house_id, text(metadata["snapshotId"]))
                    document = await self.hass.async_add_executor_job(
                        _read_house, directory
                    )
                    houses.append(
                        {
                            "status": "ok",
                            "id": house_id,
                            "name": document["name"],
                            "floorCount": len(items(document["floors"])),
                            "revision": document["revision"],
                            "modifiedAt": metadata["importedAt"],
                        }
                    )
                except (HomeplanError, OSError):
                    houses.append(
                        {
                            "status": "invalid",
                            "id": house_id,
                            "modifiedAt": metadata["importedAt"],
                            "problem": {
                                "code": "invalidDocument",
                                "message": "The local copy needs repair/Upgrade.",
                            },
                        }
                    )
            return response({"houses": houses})
        if parts[0] == "houses" and len(parts) >= 2:
            house_id = checked_id(parts[1])
            if len(parts) == 3 and parts[2] == "upgrade" and method == "POST":
                validate("UpgradeRequest", payload)
                return response(
                    {"job": await app.start_job("houseUpgrade", house_id, payload)}, 202
                )
            if len(parts) == 2 and method == "GET":
                local_metadata = record(config["houses"]).get(house_id)
                if local_metadata is None:
                    raise HomeplanError(
                        404, "notFound", "No local copy exists for this house."
                    )
                return response(local_metadata)
            if len(parts) >= 5 and parts[2] == "snapshots" and method == "GET":
                directory = app.house_path(house_id, checked_id(parts[3], True))
                manifest, files = await app.verified_inventory(directory)
                if parts[4:] == ["manifest"]:
                    await self.hass.async_add_executor_job(
                        _served_file, directory, "manifest.json", None
                    )
                    return response(manifest)
                if parts[4:] == ["document"]:
                    document = await self.hass.async_add_executor_job(
                        _read_house, directory
                    )
                    return response(
                        {"revision": document["revision"], "document": document}
                    )
                if parts[4] == "files" and len(parts) >= 6:
                    path = "/".join(parts[5:])
                    entry = _listed(files, path)
                    target = await self.hass.async_add_executor_job(
                        _served_file, directory, path, entry
                    )
                    return _file(target, entry, False)
        if parts[:2] == ["remote", "houses"] and len(parts) >= 4 and method == "GET":
            return await _remote(app, request, parts, config)
        raise HomeplanError(404, "notFound", "This Homeplan route does not exist.")


def _client_address(request: web.Request) -> str | None:
    """The browser's IP as HA sees it (HA applies its trusted-proxy rules to `remote`); loopback is useless."""
    try:
        address = ipaddress.ip_address(request.remote or "")
    except ValueError:
        return None
    if address.is_loopback or address.is_unspecified:
        return None
    return str(address)


def _listed(files: dict[str, dict[str, object]], path: str) -> dict[str, object]:
    entry = files.get(path)
    if entry is None:
        raise HomeplanError(
            404, "notFound", "This file is not listed in the artifact manifest."
        )
    return entry


def _served_file(directory: Path, path: str, entry: dict[str, object] | None) -> Path:
    """Check a pinned file still exists at its listed size (blocking; run it in an executor)."""
    target = inside(directory, path)
    if not target.is_file() or (
        entry is not None and target.stat().st_size != entry["byteSize"]
    ):
        raise HomeplanError(
            410,
            "snapshotExpired",
            "This pinned resource is no longer available. Reload the panel.",
        )
    return target


def _file(target: Path, entry: dict[str, object], public: bool) -> web.FileResponse:
    return web.FileResponse(
        target,
        headers={
            "Content-Type": text(entry["mediaType"]),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "public, max-age=31536000, immutable"
            if public
            else "private, no-store",
        },
    )


async def _remote(
    app: HomeplanRuntime,
    request: web.Request,
    parts: list[str],
    config: dict[str, object],
) -> web.Response:
    house_id = checked_id(parts[2])
    connection = record(config["connection"])
    if not connection["devMode"] or record(config["viewer"])["houseId"] != house_id:
        raise HomeplanError(
            409,
            "remoteSelectionRequired",
            "The selected house is not in remote DEV MODE.",
        )
    app.generation(int(request.query.get("generation", "-1")))
    if record(config["houseSources"]).get(house_id) != connection["builderUrl"]:
        raise HomeplanError(
            409,
            "sourceChanged",
            "Connect and Use this house from the changed Floor Builder URL before remote viewing.",
        )
    source = app.source()
    prefix = f"houses/{house_id}"
    if parts[3:] == ["document"]:
        envelope = await source.house(house_id)
        return response({"generation": connection["generation"], **envelope})
    if len(parts) == 6 and parts[3] == "images" and parts[5] == "file":
        image_id = checked_id(parts[4])
        data = await source.data(f"{prefix}/images/{image_id}/file", MAX_ASSET)
        # Sniff known supported image encodings; no user-controlled response media type.
        media = (
            "image/png"
            if data.startswith(b"\x89PNG")
            else "image/jpeg"
            if data.startswith(b"\xff\xd8")
            else "image/webp"
        )
        return web.Response(
            body=data,
            content_type=media,
            headers=_PRIVATE_HEADERS,
        )
    if len(parts) >= 7 and parts[3] == "templates":
        template_id = parts[4]
        if not re.fullmatch(
            r"(?:t_[a-z0-9]{6,}|[a-z0-9]+(?:-[a-z0-9]+)*)", template_id
        ):
            raise HomeplanError(400, "validation", "Invalid template ID.")
        if parts[5] == "v" and len(parts) == 7:
            version = int(parts[6])
            if version <= 0:
                raise HomeplanError(400, "validation", "Invalid template version.")
            route = (
                f"{prefix}/templates/{template_id}/v/{version}"
                if template_id.startswith("t_")
                else f"templates/builtin/{template_id}/v/{version}"
            )
            data = await source.data(route, MAX_ASSET)
            if not template_id.startswith("t_"):
                return web.Response(
                    body=data,
                    content_type="model/gltf-binary",
                    headers=_PRIVATE_HEADERS,
                )
            document = record(await app.hass.async_add_executor_job(parse_json, data))
            _rewrite_uris(
                document,
                f"/api/homeplan/remote/houses/{house_id}/templates/{template_id}/files/",
                integer(connection["generation"]),
            )
            return web.Response(
                text=json.dumps(document),
                content_type="model/gltf+json",
                headers=_PRIVATE_HEADERS,
            )
        if parts[5] == "files" and template_id.startswith("t_"):
            path = safe_path("/".join(parts[6:]))
            if path != "geometry.bin" and not path.startswith("textures/"):
                raise HomeplanError(
                    400, "validation", "Unsupported template dependency."
                )
            data = await source.data(
                f"{prefix}/templates/{template_id}/files/{quote(path, safe='/')}",
                MAX_ASSET,
            )
            media = (
                "application/octet-stream"
                if path.endswith(".bin")
                else "image/png"
                if path.endswith(".png")
                else "image/jpeg"
                if path.endswith(".jpg")
                else "image/webp"
            )
            return web.Response(
                body=data,
                content_type=media,
                headers=_PRIVATE_HEADERS,
            )
    raise HomeplanError(404, "notFound", "This remote resource is not supported.")


def _rewrite_uris(value: object, prefix: str, generation: int) -> None:
    if isinstance(value, list):
        for item in value:
            _rewrite_uris(item, prefix, generation)
    elif isinstance(value, dict):
        uri = value.get("uri")
        if isinstance(uri, str) and not uri.startswith("data:"):
            if not uri.startswith("../files/"):
                raise HomeplanError(
                    422,
                    "invalidDocument",
                    "The source returned an unsupported template dependency URL.",
                )
            value["uri"] = (
                prefix
                + quote(safe_path(uri.removeprefix("../files/")), safe="/")
                + f"?generation={generation}"
            )
        for item in value.values():
            _rewrite_uris(item, prefix, generation)


class HomeplanFrontendView(HomeAssistantView):
    url = "/homeplan/frontend/{bundle_id}/files/{path:.*}"
    name = "homeplan:frontend"
    requires_auth = False

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(
        self, request: web.Request, bundle_id: str, path: str
    ) -> web.StreamResponse:
        try:
            app = runtime(self.hass)
            directory = inside(app.root / "frontend", checked_id(bundle_id, True))
            _manifest, files = await app.verified_inventory(directory, True)
            entry = _listed(files, path)
            target = await self.hass.async_add_executor_job(
                _served_file, directory, path, entry
            )
            return _file(target, entry, True)
        except HomeplanError as err:
            return response(err.envelope(), err.status)
