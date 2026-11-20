"""Integration checks against real HA HTTP/auth/Store APIs and exported synthetic fixtures.
Run with the documented temporary HA Python environment; never points at an owner's installation.
"""

import asyncio
import copy
import hashlib
import io
import json
import os
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aiohttp import ContentTypeError, web
from aiohttp.test_utils import TestClient, TestServer
from homeassistant import auth, config_entries, loader
from homeassistant.auth.const import GROUP_ID_ADMIN
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import frame
from homeassistant.helpers.service_info.hassio import HassioServiceInfo
from homeassistant.setup import async_setup_component

from custom_components.homeplan import (
    async_setup_entry,
    async_unload_entry,
    config_flow,
)
from custom_components.homeplan.artifacts import inventory, verify
from custom_components.homeplan.const import DOMAIN
from custom_components.homeplan.diagnostics import async_get_config_entry_diagnostics
from custom_components.homeplan.errors import HomeplanError
from custom_components.homeplan.runtime import HomeplanRuntime
from custom_components.homeplan.storage import (
    EMPTY_BINDINGS,
    ConfigurationStore,
    defaults,
    migrate_seed,
)
from custom_components.homeplan.validation import (
    identity,
    inside,
    integer,
    parse_json,
    record,
    text,
    validate,
)

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "dist/ha-check-fixtures"
CHECKS = 0


def check(value: object, label: str) -> None:
    global CHECKS
    if not value:
        raise AssertionError(label)
    CHECKS += 1


async def pure_checks() -> None:
    persisted: dict[str, object] | None = None
    fail_save = False

    async def load() -> object:
        return copy.deepcopy(persisted)

    async def save(value: dict[str, object]) -> None:
        nonlocal persisted
        if fail_save:
            raise OSError("injected disk failure")
        persisted = copy.deepcopy(value)

    legacy = defaults()
    legacy["dashboard"] = {
        "urlPath": None,
        "areaTabs": {},
        "areaViews": {},
        "panelColumns": 2,
    }

    async def load_legacy() -> object:
        return copy.deepcopy(legacy)

    legacy_store = ConfigurationStore(load_legacy, save)
    await legacy_store.load()
    check(
        record(legacy_store.snapshot()["dashboard"]).get("panelColumns") is None
        and record(legacy_store.snapshot()["dashboard"])["areaColumns"] == {},
        "stored house-wide panel width migrates to per-room columns",
    )
    old_dashboard = {
        "urlPath": None,
        "areaTabs": {},
        "areaViews": {},
        "panelColumns": 2,
    }
    validate("SnapshotDashboard", old_dashboard)
    validate("SnapshotDashboard", record(defaults()["dashboard"]))
    check(True, "snapshots copied before per-room columns still validate")
    store = ConfigurationStore(load, save)
    await store.load()
    await store.mutate(
        lambda value: value.update(
            connection={
                "builderUrl": "http://fixture/",
                "devMode": False,
                "generation": 1,
                "origin": "manual",
                "servers": [],
            }
        ),
        0,
    )
    try:
        await store.mutate(
            lambda value: value.update(
                viewer={"houseId": "h_fixture1", "testEntityId": None}
            ),
            0,
        )
    except HomeplanError as err:
        check(err.code == "staleRevision", "stale config writes are refused")
    else:
        raise AssertionError("stale write accepted")
    before = store.snapshot()
    fail_save = True
    try:
        await store.mutate(
            lambda value: value.update(
                viewer={"houseId": "h_fixture1", "testEntityId": None}
            ),
            1,
        )
    except OSError:
        pass
    check(
        store.snapshot() == before and persisted == before,
        "failed disk save cannot publish a new state",
    )
    fail_save = False
    configuration = defaults()
    migration = {
        "dashboard": {
            "urlPath": "fixture",
            "areaTabs": {},
            "areaViews": {},
            "areaColumns": {},
        }
    }
    seed = {
        "bindings": {
            "lights": {"l_fixture1": {"stateEntityId": "light.fixture"}},
            "objects": {},
            "effects": {},
            "areas": {},
            "bubbles": {"rooms": {}, "placed": {}},
        }
    }
    migrate_seed(configuration, "h_fixture1", migration, seed)
    configuration["bindings"] = {
        "h_fixture1": {
            "lights": {},
            "objects": {},
            "effects": {},
            "areas": {},
            "bubbles": {"rooms": {}, "placed": {}},
        }
    }
    configuration["dashboard"] = {**record(configuration["dashboard"]), "urlPath": None}
    migrate_seed(configuration, "h_fixture1", migration, seed)
    check(
        not record(record(record(configuration["bindings"])["h_fixture1"])["lights"]),
        "intentionally empty bindings never reimport",
    )
    check(
        record(configuration["dashboard"])["urlPath"] is None,
        "cleared dashboard never reimports",
    )
    main_views = defaults()
    migrate_seed(
        main_views,
        "h_fixture1",
        {
            "dashboard": {
                "urlPath": None,
                "areaTabs": {},
                "areaViews": {},
                "mainViews": {"h_fixture1": "f_fixture1", "h_other": "f_other"},
            }
        },
        seed,
    )
    validate("IntegrationConfiguration", main_views)
    check(
        record(main_views["dashboard"])["mainViews"] == {"h_fixture1": "f_fixture1"},
        "a house's main view (16.1) imports with it, other houses' do not",
    )
    for path in ("../private", "/etc/passwd", "a//b", "a/%2e%2e/secret", "a/./b"):
        try:
            inside(ROOT, path)
        except HomeplanError:
            check(True, "unsafe artifact path refused")
        else:
            raise AssertionError("unsafe path accepted: " + path)
    try:
        parse_json('{"a":1,"a":2}')
    except HomeplanError:
        check(True, "duplicate JSON keys refused")
    meta = record(parse_json((FIXTURES / "fixture.json").read_bytes()))
    for snapshot in (text(meta["previousSnapshotId"]), text(meta["snapshotId"])):
        path = (
            Path(text(meta["storage"])) / "transfers" / text(meta["houseId"]) / snapshot
        )
        manifest = verify(path)
        check(
            identity(manifest, "snapshotId") == snapshot,
            "TS/Python canonical identities agree, including fractional dashboard coordinates",
        )
        check(manifest["houseSchemaVersion"] == 6, "a current (v6) snapshot imports")
    # Phase 16.14: a copy made before house schema version 5 (staircase areas) still imports and validates.
    legacy_path = (
        Path(text(meta["storage"]))
        / "transfers"
        / text(meta["houseId"])
        / text(meta["legacySnapshotId"])
    )
    legacy = verify(legacy_path)
    check(legacy["houseSchemaVersion"] == 4, "a version-4 snapshot imports")
    legacy_doc = validate(
        "House", parse_json(inside(legacy_path, "house.json").read_bytes())
    )
    check(
        legacy_doc["schemaVersion"] == 4
        and validate(
            "HouseDocumentEnvelope",
            {"revision": legacy_doc["revision"], "document": legacy_doc},
        )["document"]["schemaVersion"]
        == 4,
        "a stored version-4 copy validates as House and as its document response",
    )
    too_new = copy.deepcopy(legacy_doc)
    too_new["schemaVersion"] = 6
    try:
        validate("House", too_new)
    except HomeplanError:
        check(True, "an unknown house schema version is refused")
    else:
        raise AssertionError("schema version 6 accepted")
    bad = copy.deepcopy(manifest)
    bad["snapshotId"] = "0" * 64
    try:
        inventory(bad)
    except HomeplanError as err:
        check(
            err.code == "checksumMismatch",
            "tampered manifest rejected before files are loaded",
        )

    frontend = record(
        parse_json(
            (ROOT / "custom_components/homeplan/frontend/manifest.json").read_bytes()
        )
    )
    for field, value, expected in (
        ("minimumIntegrationVersion", "99.0.0", "integrationUpdateRequired"),
        ("loaderProtocol", 2, "invalidDocument"),
        ("formatVersion", 2, "invalidDocument"),
        # A panel older than this integration's responses (MIN_VIEWER_VERSION) is never used.
        ("version", "0.1.1", "incompatibleFrontend"),
    ):
        incompatible = {**frontend, field: value}
        incompatible["bundleId"] = identity(incompatible, "bundleId")
        try:
            inventory(incompatible, True)
        except HomeplanError as err:
            check(
                err.code == expected,
                "incompatible frontend is rejected before any file transfer",
            )
        else:
            raise AssertionError("incompatible frontend accepted")
    compatible = {**frontend, "minimumIntegrationVersion": "0.0.9"}
    compatible["bundleId"] = identity(compatible, "bundleId")
    check(
        bool(inventory(compatible, True)),
        "a compatible earlier minimum version remains usable",
    )


async def integration_checks() -> None:
    meta = record(parse_json((FIXTURES / "fixture.json").read_bytes()))
    house_id = text(meta["houseId"])
    transfers = Path(text(meta["storage"])) / "transfers" / house_id
    current = text(meta["previousSnapshotId"])
    corrupt = False
    source_calls = 0
    source_offline = False
    preferences_doc = record(
        parse_json(
            (
                Path(text(meta["storage"])) / "config/application-preferences.json"
            ).read_bytes()
        )
    )
    source_app = web.Application()

    async def source_handler(request: web.Request) -> web.Response:
        nonlocal source_calls
        source_calls += 1
        if source_offline:
            return web.Response(status=503)
        path = request.match_info["tail"]
        if path == "ha-viewer/entry.ts":
            return web.Response(
                body=(ROOT / "dist/ha-viewer/viewer.js").read_bytes(),
                content_type="text/javascript",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-store",
                },
            )
        if path.startswith("templates/builtin/"):
            template_id = path.split("/")[2]
            return web.Response(
                body=(
                    ROOT / "server/builtin-templates" / template_id / "v1.glb"
                ).read_bytes(),
                content_type="model/gltf-binary",
            )
        if path.startswith(f"houses/{house_id}/images/"):
            manifest = record(
                parse_json((transfers / current / "manifest.json").read_bytes())
            )
            image = record(record(manifest["resources"])["images"][0])
            return web.Response(
                body=(transfers / current / text(image["path"])).read_bytes(),
                content_type="image/png",
            )
        if path.startswith(f"houses/{house_id}/templates/"):
            relative = path.removeprefix(f"houses/{house_id}/templates/").split("/")
            template_id, operation = relative[:2]
            origin = (
                Path(text(meta["storage"]))
                / "data"
                / house_id
                / "assets/templates"
                / template_id
            )
            if operation == "v":
                gltf = record(parse_json((origin / "v1.gltf").read_bytes()))
                for field in ("buffers", "images"):
                    for item in gltf.get(field, []):
                        item["uri"] = "../files/" + item["uri"]
                return web.json_response(gltf)
            target = origin / "/".join(relative[2:])
            return web.Response(
                body=target.read_bytes(),
                content_type="application/octet-stream"
                if target.suffix == ".bin"
                else "image/png",
            )
        if path == "capabilities":
            return web.json_response({"houseSnapshots": {"formatVersions": [1]}})
        if path == "houses":
            doc = record(parse_json((transfers / current / "house.json").read_bytes()))
            return web.json_response(
                {
                    "houses": [
                        {
                            "status": "ok",
                            "id": house_id,
                            "name": doc["name"],
                            "floorCount": 2,
                            "revision": doc["revision"],
                            "modifiedAt": "2026-11-17T12:00:00Z",
                        }
                    ]
                }
            )
        if path == "preferences":
            return web.json_response(
                {
                    "revision": preferences_doc["revision"],
                    "preferences": preferences_doc["preferences"],
                }
            )
        if path == f"houses/{house_id}/document":
            doc = record(parse_json((FIXTURES / "working.json").read_bytes()))
            return web.json_response({"revision": doc["revision"], "document": doc})
        if path == f"houses/{house_id}/snapshots" and request.method == "POST":
            manifest = record(
                parse_json((transfers / current / "manifest.json").read_bytes())
            )
            return web.json_response(
                {
                    "snapshotId": current,
                    "sourceRevisionId": manifest["sourceRevisionId"],
                    "expiresAt": "2099-01-01T00:00:00Z",
                },
                status=201,
            )
        prefix = f"houses/{house_id}/snapshots/"
        if path.startswith(prefix):
            relative = path.removeprefix(prefix)
            snapshot, action, *file = relative.split("/")
            target = (
                transfers
                / snapshot
                / ("manifest.json" if action == "manifest" else "/".join(file))
            )
            if not target.is_file():
                return web.Response(status=404)
            data = target.read_bytes()
            if corrupt and action == "files" and target.name == "house.json":
                data = data[:-1] + b"X"
            return web.Response(
                body=data,
                content_type="application/json"
                if target.suffix == ".json"
                else "application/octet-stream",
            )
        if path == "viewer/frontend":
            return web.Response(
                body=(ROOT / "dist/ha-viewer/manifest.json").read_bytes(),
                content_type="application/json",
            )
        if path.startswith("viewer/frontend/"):
            relative = path.removeprefix("viewer/frontend/")
            bundle, action, *file = relative.split("/")
            target = (
                ROOT
                / "dist/ha-artifacts"
                / bundle
                / ("manifest.json" if action == "manifest" else "/".join(file))
            )
            return web.Response(
                body=target.read_bytes(),
                content_type="text/javascript"
                if target.suffix == ".js"
                else "application/json",
            )
        return web.Response(status=404)

    async def source_handler_for_entry(request: web.Request) -> web.Response:
        if source_offline:
            return web.Response(
                status=503, headers={"Access-Control-Allow-Origin": "*"}
            )
        return web.Response(
            body=(ROOT / "dist/ha-viewer/viewer.js").read_bytes(),
            content_type="text/javascript",
            headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-store"},
        )

    source_app.router.add_route("*", "/api/{tail:.*}", source_handler)
    source_app.router.add_get(
        "/ha-viewer/entry.ts", lambda request: source_handler_for_entry(request)
    )
    async with TestClient(TestServer(source_app)) as source:
        with tempfile.TemporaryDirectory(prefix="homeplan-ha-check-") as temp:
            hass = HomeAssistant(temp)
            loader.async_setup(hass)
            hass.config_entries = config_entries.ConfigEntries(hass, {})
            hass.auth = await auth.auth_manager_from_config(
                hass, [{"type": "homeassistant"}], []
            )
            admin = await hass.auth.async_create_user(
                "Fixture admin", group_ids=[GROUP_ID_ADMIN]
            )
            viewer = await hass.auth.async_create_user("Fixture viewer")
            admin_refresh = await hass.auth.async_create_refresh_token(
                admin, client_id="http://localhost/homeplan-check"
            )
            viewer_refresh = await hass.auth.async_create_refresh_token(
                viewer, client_id="http://localhost/homeplan-check"
            )
            admin_token = hass.auth.async_create_access_token(admin_refresh)
            viewer_token = hass.auth.async_create_access_token(viewer_refresh)
            try:
                check(
                    await async_setup_component(
                        hass,
                        "http",
                        {"http": {"server_host": "127.0.0.1", "server_port": 8131}},
                    ),
                    "real HA HTTP component starts",
                )
                entry = ConfigEntry(
                    version=1,
                    minor_version=1,
                    domain=DOMAIN,
                    title="Homeplan",
                    data={},
                    options={},
                    source="user",
                    unique_id=DOMAIN,
                    discovery_keys={},
                    subentries_data=[],
                )
                check(
                    await async_setup_entry(hass, entry),
                    "real HA integration setup succeeds with no source",
                )
                app = hass.data[DOMAIN]
                if not isinstance(app, HomeplanRuntime):
                    raise TypeError("Missing entry runtime")
                calls_before = source_calls
                await app.setup()
                check(source_calls == calls_before, "startup never contacts source")

                async def browser_harness(request: web.Request) -> web.Response:
                    nonlocal source_offline
                    if request.query.get("offline") == "1":
                        source_offline = True
                    script = """import '/homeplan-static/loader.js';
const panel=document.createElement('homeplan-panel');
const hass={states:{},entities:{},devices:{},areas:{},user:{is_admin:true},themes:{darkMode:false},config:{latitude:51.5,longitude:0},
fetchWithAuth:(path,init={})=>{const headers=new Headers(init.headers); headers.set('Authorization','Bearer '+TOKEN);return fetch(path,{...init,headers});},
callWS:async()=>[],callService:async()=>({})};
panel.hass=hass;panel.narrow=false;document.body.append(panel);""".replace(
                        "TOKEN", json.dumps(admin_token)
                    )
                    return web.Response(
                        text="<!doctype html><html><head><meta charset='utf-8'><title>Isolated Homeplan check</title><style>body{margin:0}</style></head><body><script type='module'>"
                        + script
                        + "</script></body></html>",
                        content_type="text/html",
                    )

                hass.http.app.router.add_get("/homeplan-check", browser_harness)
                async with TestClient(TestServer(hass.http.app)) as client:

                    async def call(
                        method: str,
                        path: str,
                        payload: object = None,
                        user_token: str | None = admin_token,
                    ) -> tuple[int, object]:
                        headers = (
                            {}
                            if user_token is None
                            else {"Authorization": "Bearer " + user_token}
                        )
                        async with client.request(
                            method, path, json=payload, headers=headers
                        ) as result:
                            try:
                                value: object = await result.json()
                            except (ValueError, TypeError, ContentTypeError):
                                value = await result.read()
                            return result.status, value

                    status, _ = await call(
                        "GET", "/api/homeplan/bootstrap", user_token=None
                    )
                    check(
                        status == 401,
                        "anonymous bootstrap/data refused by HA auth middleware",
                    )
                    status, _ = await call(
                        "GET", "/homeplan-static/loader.js", user_token=None
                    )
                    check(status == 200, "packaged loader is public executable-only")
                    status, address = await call("GET", "/api/homeplan/client-address")
                    check(
                        status == 200 and address == {"address": None},
                        "client address for House setup: loopback browser gets no proposal",
                    )
                    status, _ = await call(
                        "GET", "/api/homeplan/client-address", user_token=viewer_token
                    )
                    check(status == 403, "client address is admin-only")
                    config = app.configuration.snapshot()
                    status, _ = await call(
                        "PATCH",
                        "/api/homeplan/connection",
                        {
                            "expectedRevision": config["revision"],
                            "patch": {"builderUrl": str(source.make_url("/"))},
                        },
                        viewer_token,
                    )
                    check(status == 403, "ordinary HA user cannot change connection")
                    status, state = await call(
                        "PATCH",
                        "/api/homeplan/connection",
                        {
                            "expectedRevision": config["revision"],
                            "patch": {"builderUrl": str(source.make_url("/"))},
                        },
                    )
                    check(status == 200, "admin saves single source URL")
                    status, connected = await call(
                        "POST",
                        "/api/homeplan/source/connect",
                        {"expectedRevision": record(state)["revision"]},
                    )
                    check(
                        status == 200 and len(record(connected)["houses"]) == 1,
                        "Connect presents the source house list",
                    )
                    config = app.configuration.snapshot()
                    status, used = await call(
                        "POST",
                        f"/api/homeplan/source/houses/{house_id}/use",
                        {
                            "expectedRevision": config["revision"],
                            "generation": record(config["connection"])["generation"],
                        },
                    )
                    check(status == 202, "Use starts first explicit-save import")
                    job_id = text(record(record(used)["job"])["id"])
                    await asyncio.gather(*app.tasks.values())
                    status, finished = await call("GET", f"/api/homeplan/jobs/{job_id}")
                    check(
                        status == 200
                        and record(record(finished)["job"])["status"] == "completed",
                        "real streamed transfer verifies and activates",
                    )
                    config = app.configuration.snapshot()
                    check(
                        record(config["viewer"])["houseId"] == house_id,
                        "first Use selects only after verified activation",
                    )
                    metadata = record(record(config["houses"])[house_id])
                    snapshot = text(metadata["snapshotId"])
                    status, envelope = await call(
                        "GET",
                        f"/api/homeplan/houses/{house_id}/snapshots/{snapshot}/document",
                        user_token=viewer_token,
                    )
                    check(
                        status == 200
                        and record(record(envelope)["document"])["name"] == "Saved A",
                        "non-admin can read committed local house",
                    )
                    manifest = await asyncio.to_thread(
                        verify, app.house_path(house_id, snapshot)
                    )
                    image = record(record(manifest["resources"])["images"][0])
                    status, _ = await call(
                        "GET",
                        f"/api/homeplan/houses/{house_id}/snapshots/{snapshot}/files/{text(image['path'])}",
                        user_token=None,
                    )
                    check(status == 401, "anonymous image bytes refused")
                    status, data = await call(
                        "GET",
                        f"/api/homeplan/houses/{house_id}/snapshots/{snapshot}/files/{text(image['path'])}",
                        user_token=viewer_token,
                    )
                    check(
                        status == 200
                        and isinstance(data, bytes)
                        and hashlib.sha256(data).hexdigest()
                        == record(inventory(manifest)[text(image["path"])])["sha256"],
                        "private image bytes load authenticated and match checksums",
                    )
                    # House archives (Phase 21, Settings -> Houses): download, upload, replace, refusals.
                    status, archive_bytes = await call(
                        "GET", f"/api/homeplan/houses/{house_id}/archive"
                    )
                    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive_zip:
                        archive_names = set(archive_zip.namelist())
                    check(
                        status == 200
                        and isinstance(archive_bytes, bytes)
                        and "manifest.json" in archive_names
                        and set(inventory(manifest)) <= archive_names,
                        "house archive: a local copy downloads as its manifest and files",
                    )
                    try:
                        await app.import_archive(archive_bytes, False)
                        refused = False
                    except HomeplanError as err:
                        refused = err.status == 409
                    check(
                        refused,
                        "house archive: an existing copy is not replaced unasked",
                    )
                    replaced = await app.import_archive(archive_bytes, True)
                    check(
                        replaced["houseId"] == house_id
                        and replaced["outcome"] == "unchanged",
                        "house archive: re-uploading the same copy changes nothing",
                    )

                    def rewritten(change: object) -> bytes:
                        buffer = io.BytesIO()
                        with (
                            zipfile.ZipFile(io.BytesIO(archive_bytes)) as source_zip,
                            zipfile.ZipFile(buffer, "w") as target_zip,
                        ):
                            for name in source_zip.namelist():
                                content = source_zip.read(name)
                                if change == "tamper" and name == text(image["path"]):
                                    content = content + b"x"
                                target_zip.writestr(name, content)
                            if change == "escape":
                                target_zip.writestr("../escape.txt", b"no")
                        return buffer.getvalue()

                    for change, label in (
                        ("tamper", "a changed file fails its checksum"),
                        ("escape", "a path leaving the archive is refused"),
                    ):
                        try:
                            await app.import_archive(rewritten(change), True)
                            refused = False
                        except HomeplanError as err:
                            refused = err.status in (400, 413, 422)
                        check(refused, f"house archive: {label}")
                    try:
                        await app.import_archive(b"not a zip", True)
                        refused = False
                    except HomeplanError as err:
                        refused = err.status == 422
                    check(refused, "house archive: a file that is not a zip is refused")
                    leftovers = [
                        path.name
                        for path in (app.root / "houses").iterdir()
                        if path.name.startswith(".import-")
                    ]
                    check(
                        not leftovers,
                        "house archive: refused uploads leave no staging folders",
                    )
                    status, _ = await call("DELETE", f"/api/homeplan/houses/{house_id}")
                    check(
                        status == 409, "remove copy: the shown house cannot be removed"
                    )
                    status, _ = await call("DELETE", "/api/homeplan/houses/h_nothere1")
                    check(
                        status == 404,
                        "remove copy: a house without a copy is not found",
                    )
                    check(
                        house_id in record(app.configuration.snapshot()["houses"]),
                        "remove copy: a refused removal keeps the copy",
                    )
                    status, _ = await call(
                        "PATCH",
                        "/api/homeplan/config",
                        {
                            "expectedRevision": config["revision"],
                            "patch": {"bindings": {house_id: {"objects": {}}}},
                        },
                    )
                    check(status == 200, "HA-owned binding changes persist")
                    current = text(meta["snapshotId"])
                    corrupt = True
                    config = app.configuration.snapshot()
                    status, started = await call(
                        "POST",
                        f"/api/homeplan/houses/{house_id}/upgrade",
                        {"generation": record(config["connection"])["generation"]},
                    )
                    check(
                        status == 202, "Upgrade starts without changing selected house"
                    )
                    await asyncio.gather(*app.tasks.values())
                    failed = next(
                        job
                        for job in app.jobs
                        if job["id"] == record(record(started)["job"])["id"]
                    )
                    check(
                        failed["status"] == "failed"
                        and record(failed["error"])["code"] == "checksumMismatch",
                        "corrupt streamed upgrade fails specifically",
                    )
                    check(
                        record(
                            record(app.configuration.snapshot()["houses"])[house_id]
                        )["snapshotId"]
                        == snapshot,
                        "failed upgrade keeps prior pointer",
                    )
                    corrupt = False
                    config = app.configuration.snapshot()
                    status, _ = await call(
                        "POST",
                        f"/api/homeplan/houses/{house_id}/upgrade",
                        {"generation": record(config["connection"])["generation"]},
                    )
                    await asyncio.gather(*app.tasks.values())
                    config = app.configuration.snapshot()
                    check(
                        record(record(config["houses"])[house_id])["snapshotId"]
                        == current,
                        "successful Upgrade activates B",
                    )
                    check(
                        not record(
                            record(record(config["bindings"])[house_id])["objects"]
                        ),
                        "Upgrade never overwrites intentionally cleared HA bindings",
                    )
                    status, _ = await call(
                        "POST",
                        "/api/homeplan/frontend/upgrade",
                        {"generation": record(config["connection"])["generation"]},
                    )
                    await asyncio.gather(*app.tasks.values())
                    config = app.configuration.snapshot()
                    active = record(record(config["frontend"])["active"])
                    check(
                        status == 202 and active["loaderProtocol"] == 1,
                        "Upgrade panel installs compatible complete UI locally",
                    )
                    status, _ = await call(
                        "GET",
                        f"/homeplan/frontend/{text(active['bundleId'])}/files/{text(active['entry'])}",
                        user_token=None,
                    )
                    check(status == 200, "downloaded frontend is public code-only")
                    status, _ = await call(
                        "GET",
                        f"/homeplan/frontend/{text(active['bundleId'])}/files/house.json",
                        user_token=None,
                    )
                    check(status == 404, "code route cannot expose house files")
                    # Panels (Phase 21): back to the shipped panel, then the previous (downloaded) one again.
                    config = app.configuration.snapshot()
                    status, _ = await call(
                        "POST",
                        "/api/homeplan/frontend/use-previous",
                        {"expectedRevision": config["revision"]},
                    )
                    check(
                        status == 404,
                        "use previous: refused while there is no previous panel",
                    )
                    status, _ = await call(
                        "POST",
                        "/api/homeplan/frontend/restore-packaged",
                        {"expectedRevision": config["revision"]},
                    )
                    config = app.configuration.snapshot()
                    status, _ = await call(
                        "POST",
                        "/api/homeplan/frontend/use-previous",
                        {"expectedRevision": config["revision"]},
                    )
                    swapped = record(app.configuration.snapshot()["frontend"])
                    check(
                        status == 200
                        and record(swapped["active"])["bundleId"] == active["bundleId"]
                        and swapped["previous"] is None,
                        "use previous: the downloaded panel is active again after the shipped one",
                    )
                    config = app.configuration.snapshot()
                    generation = record(config["connection"])["generation"]
                    status, _ = await call(
                        "PATCH",
                        "/api/homeplan/connection",
                        {
                            "expectedRevision": config["revision"],
                            "patch": {"devMode": True},
                        },
                    )
                    config = app.configuration.snapshot()
                    check(
                        status == 200
                        and record(config["connection"])["generation"] == generation,
                        "single DEV MODE retains source generation/list",
                    )
                    status, remote = await call(
                        "GET",
                        f"/api/homeplan/remote/houses/{house_id}/document?generation={generation}",
                        user_token=viewer_token,
                    )
                    check(
                        status == 200
                        and record(record(remote)["document"])["name"]
                        == "Remote working C",
                        "DEV MODE reads current working document without a Git Save",
                    )
                    original_url = record(config["connection"])["builderUrl"]
                    await app.connection_patch(
                        {
                            "expectedRevision": config["revision"],
                            "patch": {"builderUrl": "http://different.invalid/"},
                        }
                    )
                    changed_config = app.configuration.snapshot()
                    status, _ = await call(
                        "GET",
                        f"/api/homeplan/remote/houses/{house_id}/document?generation={record(changed_config['connection'])['generation']}",
                    )
                    check(
                        status == 409,
                        "changing source cannot reinterpret a selected house ID",
                    )
                    await app.connection_patch(
                        {
                            "expectedRevision": changed_config["revision"],
                            "patch": {"builderUrl": original_url, "devMode": False},
                        }
                    )
                    config = app.configuration.snapshot()
                    canceled = await app.start_job(
                        "panelUpgrade",
                        None,
                        {"generation": record(config["connection"])["generation"]},
                    )
                    canceled = await app.cancel(text(canceled["id"]))
                    check(
                        canceled["status"] == "canceled" and not app.tasks,
                        "cancellation before first coroutine step is durably terminal",
                    )
                    check(
                        app.configuration.snapshot() == config,
                        "canceled transfer cannot mutate active pointers",
                    )
                    diagnostics = await async_get_config_entry_diagnostics(hass, entry)
                    diagnostic_text = json.dumps(diagnostics)
                    check(
                        str(original_url) not in diagnostic_text
                        and "switch.fixture" not in diagnostic_text
                        and "Saved B" not in diagnostic_text,
                        "native diagnostics redact sources, entities and house contents",
                    )
                    # Simulate lost final job acknowledgement after its pointer committed, and a different uncommitted transfer.
                    committed_job = copy.deepcopy(app.jobs[-1])
                    committed_job.update(
                        id="job_recover1",
                        kind="houseUpgrade",
                        houseId=house_id,
                        snapshotId=current,
                        bundleId=None,
                        status="running",
                        stage="activating",
                    )
                    interrupted_job = copy.deepcopy(committed_job)
                    interrupted_job.update(
                        id="job_recover2", snapshotId="f" * 64, stage="downloading"
                    )
                    app.jobs.extend([committed_job, interrupted_job])
                    await app.save_jobs()
                    # No live coroutine owns these synthetic crash records. Entry unload leaves them to startup reconciliation.
                    await async_unload_entry(hass, entry)
                    calls_before = source_calls
                    check(
                        await async_setup_entry(hass, entry),
                        "unload/reload retains data without duplicate routes",
                    )
                    check(
                        source_calls == calls_before,
                        "reopening installed integration never needs builder",
                    )
                    restored = hass.data[DOMAIN]
                    if not isinstance(restored, HomeplanRuntime):
                        raise TypeError("Missing reloaded runtime")
                    check(
                        record(restored.configuration.snapshot()["viewer"])["houseId"]
                        == house_id,
                        "selected house survives HA Store reload",
                    )
                    recovered_jobs = {text(job["id"]): job for job in restored.jobs}
                    check(
                        recovered_jobs["job_recover1"]["status"] == "completed",
                        "restart reconciles a committed pointer with lost job acknowledgement",
                    )
                    check(
                        recovered_jobs["job_recover2"]["status"] == "failed"
                        and record(recovered_jobs["job_recover2"]["error"])["code"]
                        == "interrupted",
                        "restart never resumes an uncommitted transfer against a different source Save",
                    )
                    current_config = restored.configuration.snapshot()
                    active_meta = record(record(current_config["houses"])[house_id])
                    damaged = (
                        restored.house_path(house_id, text(active_meta["snapshotId"]))
                        / "house.json"
                    )
                    original_bytes = damaged.read_bytes()
                    damaged.write_bytes(b"injected damaged copy")
                    try:
                        await restored._recover_copies()
                        recovered_meta = record(
                            record(restored.configuration.snapshot()["houses"])[
                                house_id
                            ]
                        )
                        check(
                            recovered_meta["snapshotId"] == snapshot,
                            "damaged active house recovers a verified prior snapshot without source",
                        )
                        status, bootstrap = await call("GET", "/api/homeplan/bootstrap")
                        check(
                            status == 200
                            and "previous verified house"
                            in text(record(bootstrap)["recovery"]),
                            "bootstrap exposes a visible local recovery notice",
                        )
                    finally:
                        damaged.write_bytes(original_bytes)
                    # A stored panel that cannot run (here: its files are gone) is replaced at startup; the note
                    # about it is shown on the next page load only.
                    missing_panel = {**restored.shipped, "bundleId": "e" * 64}

                    def point_at_missing(value: dict[str, object]) -> None:
                        value["frontend"] = {"active": missing_panel, "previous": None}

                    await restored.configuration.mutate(point_at_missing)
                    await restored._recover_copies()
                    check(
                        record(restored.configuration.snapshot()["frontend"])["active"]
                        is None,
                        "an unusable stored panel is replaced by the shipped one at startup",
                    )
                    _, first = await call("GET", "/api/homeplan/bootstrap")
                    _, second = await call("GET", "/api/homeplan/bootstrap")
                    check(
                        "panel" in text(record(first)["recovery"])
                        and record(second)["recovery"] is None,
                        "the replaced-panel note is shown once, then not again",
                    )
                    if os.environ.get("HOMEPLAN_HA_BROWSER") == "1":
                        # Reset only this temporary test installation for first-use UI checks.
                        def reset(value: dict[str, object]) -> None:
                            value.update(defaults())

                        await restored.configuration.mutate(reset)
                        env = {
                            **os.environ,
                            "HOMEPLAN_CHECK_URL": str(
                                client.make_url("/homeplan-check")
                            ),
                            "HOMEPLAN_CHECK_SOURCE": str(source.make_url("/")),
                        }
                        browser = await asyncio.create_subprocess_exec(
                            "node",
                            "--experimental-websocket",
                            "scripts/check-ha-browser.mjs",
                            cwd=ROOT,
                            env=env,
                        )
                        if await browser.wait() != 0:
                            raise AssertionError("Browser check failed")
                    await async_unload_entry(hass, entry)
            finally:
                await hass.async_stop()


async def discovery_checks() -> None:
    """Supervisor discovery through HA's real config-entry flow manager and Store.

    The only seam: entry setup calls this component's async_setup_entry directly instead of HA's
    integration loader (which would install requirements and set up the frontend).
    """
    for url, devmode, origin in (
        ("http://laptop.local:5173/", True, "manual"),
        (None, False, None),
    ):
        stored = defaults()
        stored["revision"] = 7
        stored["viewer"] = {"houseId": "h_kept1", "testEntityId": None}
        stored["connection"] = {"builderUrl": url, "devMode": devmode, "generation": 3}

        async def load_stored(value: dict[str, object] = stored) -> object:
            return copy.deepcopy(value)

        async def no_save(value: dict[str, object]) -> None:
            raise AssertionError("loading must not write")

        upgraded = ConfigurationStore(load_stored, no_save)
        await upgraded.load()
        snapshot = upgraded.snapshot()
        check(
            snapshot["connection"]
            == {
                "builderUrl": url,
                "devMode": devmode,
                "generation": 3,
                "origin": origin,
                "servers": [],
            }
            and snapshot["revision"] == 7
            and record(snapshot["viewer"])["houseId"] == "h_kept1",
            f"stored connection without origin upgrades in place to {origin} (URL, DEV MODE, house kept; no floor planners)",
        )
    probes = 0
    compatible = True
    app_server = web.Application()

    async def capabilities(request: web.Request) -> web.Response:
        nonlocal probes
        probes += 1
        return web.json_response(
            {"houseSnapshots": {"formatVersions": [1]}} if compatible else {}
        )

    app_server.router.add_get("/api/capabilities", capabilities)
    async with TestClient(TestServer(app_server)) as app_client:
        port = app_client.port
        if not isinstance(port, int):
            raise TypeError("Missing fake app port")
        app_url = f"http://127.0.0.1:{port}/"

        def announce(api: object = 1, host: str = "127.0.0.1") -> HassioServiceInfo:
            return HassioServiceInfo(
                config={"host": host, "port": port, "api": api, "addon": "Homeplan"},
                name="Homeplan",
                slug="local_homeplan",
                uuid="0" * 32,
            )

        with tempfile.TemporaryDirectory(prefix="homeplan-ha-discovery-") as temp:
            hass = HomeAssistant(temp)
            frame.async_setup(hass)
            loader.async_setup(hass)
            hass.data[loader.DATA_COMPONENTS][f"{DOMAIN}.config_flow"] = config_flow
            hass.config_entries = config_entries.ConfigEntries(hass, {})
            await hass.config_entries.async_initialize()
            hass.auth = await auth.auth_manager_from_config(
                hass, [{"type": "homeassistant"}], []
            )

            async def setup_entry(entry_id: str, **_: object) -> bool:
                entry = hass.config_entries.async_get_entry(entry_id)
                if entry is None:
                    return False
                return await async_setup_entry(hass, entry)

            hass.config_entries.async_setup = setup_entry
            flows = hass.config_entries.flow
            try:
                check(
                    await async_setup_component(
                        hass,
                        "http",
                        {"http": {"server_host": "127.0.0.1", "server_port": 8132}},
                    ),
                    "discovery: real HA HTTP component starts",
                )
                result = await flows.async_init(
                    DOMAIN, context={"source": "hassio"}, data=announce(api=2)
                )
                check(
                    result["type"] == FlowResultType.ABORT
                    and result["reason"] == "incompatible_app"
                    and probes == 0,
                    "discovery: an unsupported api version is refused before any request",
                )
                result = await flows.async_init(
                    DOMAIN,
                    context={"source": "hassio"},
                    data=announce(host="bad host"),
                )
                check(
                    result["type"] == FlowResultType.ABORT
                    and result["reason"] == "invalid_discovery",
                    "discovery: an invalid host is refused",
                )
                compatible = False
                result = await flows.async_init(
                    DOMAIN, context={"source": "hassio"}, data=announce()
                )
                check(
                    result["type"] == FlowResultType.ABORT
                    and result["reason"] == "incompatible_app"
                    and probes == 1,
                    "discovery: the app is probed and an incompatible one is refused",
                )
                compatible = True
                # (a) No entry yet: one confirmation creates the entry and stores the discovered URL.
                result = await flows.async_init(
                    DOMAIN, context={"source": "hassio"}, data=announce()
                )
                check(
                    result["type"] == FlowResultType.FORM
                    and result["step_id"] == "hassio_confirm"
                    and record(result["description_placeholders"])["url"] == app_url,
                    "discovery (a): no entry asks for confirmation with the app URL",
                )
                duplicate = await flows.async_init(
                    DOMAIN, context={"source": "hassio"}, data=announce()
                )
                check(
                    duplicate["type"] == FlowResultType.ABORT
                    and duplicate["reason"] == "already_in_progress",
                    "discovery: a re-announcement while the card is pending adds no second card",
                )
                result = await flows.async_configure(result["flow_id"], {})
                check(
                    result["type"] == FlowResultType.CREATE_ENTRY,
                    "discovery (a): confirming creates the single entry",
                )
                entries = hass.config_entries.async_entries(DOMAIN)
                app = hass.data[DOMAIN]
                if not isinstance(app, HomeplanRuntime):
                    raise TypeError("Missing discovery runtime")
                connection = record(app.configuration.snapshot()["connection"])
                check(
                    len(entries) == 1
                    and entries[0].unique_id == DOMAIN
                    and connection["builderUrl"] == app_url
                    and connection["origin"] == "discovered"
                    and connection["devMode"] is False
                    and dict(entries[0].data) == {},
                    "discovery (a): URL saved through the configuration store with origin discovered; hand-off consumed",
                )
                user = await flows.async_init(DOMAIN, context={"source": "user"})
                check(
                    user["type"] == FlowResultType.ABORT
                    and user["reason"] == "already_configured",
                    "discovery: manual Add integration still finds the single entry",
                )
                revision = integer(app.configuration.snapshot()["revision"])
                try:
                    await app.connection_patch(
                        {"expectedRevision": revision, "patch": {"devMode": True}}
                    )
                except HomeplanError as err:
                    check(
                        err.code == "validation",
                        "DEV MODE is refused while the source is the discovered app",
                    )
                else:
                    raise AssertionError("DEV MODE accepted for a discovered app")
                probes_before = probes
                result = await flows.async_init(
                    DOMAIN, context={"source": "hassio"}, data=announce()
                )
                check(
                    result["type"] == FlowResultType.ABORT
                    and result["reason"] == "already_configured"
                    and probes == probes_before
                    and integer(app.configuration.snapshot()["revision"]) == revision,
                    "discovery: a periodic re-announcement of the same app changes and probes nothing",
                )
                # (b) An entry without a URL adopts the app automatically, keeping selection/bindings.

                def clear(value: dict[str, object]) -> None:
                    value["connection"] = {
                        "builderUrl": None,
                        "devMode": False,
                        "generation": integer(
                            record(value["connection"])["generation"]
                        ),
                        "origin": None,
                        "servers": [],
                    }
                    value["viewer"] = {"houseId": "h_kept1", "testEntityId": None}
                    value["bindings"] = {"h_kept1": copy.deepcopy(EMPTY_BINDINGS)}

                await app.configuration.mutate(clear)
                result = await flows.async_init(
                    DOMAIN, context={"source": "hassio"}, data=announce()
                )
                after = app.configuration.snapshot()
                connection = record(after["connection"])
                check(
                    result["type"] == FlowResultType.ABORT
                    and result["reason"] == "discovered_applied"
                    and connection["builderUrl"] == app_url
                    and connection["origin"] == "discovered"
                    and record(after["viewer"])["houseId"] == "h_kept1"
                    and "h_kept1" in record(after["bindings"]),
                    "discovery (b): an entry with no URL adopts the app and keeps the selected house and bindings",
                )
                # (c) A manual URL is never overwritten; the app is offered in native Configure instead.
                revision = integer(after["revision"])
                await app.connection_patch(
                    {
                        "expectedRevision": revision,
                        "patch": {
                            "builderUrl": "http://laptop.local:5173/",
                            "devMode": True,
                        },
                    }
                )
                # The app was the default before, so the typed URL moved it into the list; clear the list so the
                # announcement below has to list it itself.
                await app.connection_patch(
                    {
                        "expectedRevision": integer(
                            app.configuration.snapshot()["revision"]
                        ),
                        "patch": {"servers": []},
                    }
                )
                manual = record(app.configuration.snapshot()["connection"])
                check(
                    manual["origin"] == "manual"
                    and manual["devMode"] is True
                    and manual["servers"] == [],
                    "a typed URL is manual and DEV MODE works with it as before",
                )
                probes_before = probes
                result = await flows.async_init(
                    DOMAIN, context={"source": "hassio"}, data=announce()
                )
                kept = app.configuration.snapshot()
                check(
                    result["type"] == FlowResultType.ABORT
                    and result["reason"] == "manual_source_kept"
                    and {
                        key: item
                        for key, item in record(kept["connection"]).items()
                        if key != "servers"
                    }
                    == {key: item for key, item in manual.items() if key != "servers"}
                    and probes == probes_before
                    and app.discovery_offer() == app_url,
                    "discovery (c): a manual URL and DEV MODE are kept; the app becomes an offer",
                )
                check(
                    record(kept["connection"])["servers"] == [app_url],
                    "floor planners: the found app is listed beside a kept manual URL",
                )
                options = await hass.config_entries.options.async_init(
                    entries[0].entry_id
                )
                check(
                    options["type"] == FlowResultType.FORM
                    and "use_discovered" in str(options["data_schema"].schema)
                    and record(options["description_placeholders"])["discovered"]
                    == app_url,
                    "discovery (c): native Configure offers the discovered app",
                )
                options = await hass.config_entries.options.async_configure(
                    options["flow_id"],
                    {
                        "builder_url": "http://laptop.local:5173/",
                        "dev_mode": True,
                        "restore_packaged": False,
                        "use_discovered": True,
                    },
                )
                switched = record(app.configuration.snapshot()["connection"])
                check(
                    options["type"] == FlowResultType.CREATE_ENTRY
                    and switched["builderUrl"] == app_url
                    and switched["origin"] == "discovered"
                    and switched["devMode"] is False
                    and switched["generation"] == integer(manual["generation"]) + 1,
                    "using the offered app switches the one URL to discovered and turns DEV MODE off",
                )
                check(
                    switched["servers"] == ["http://laptop.local:5173/"],
                    "floor planners: the previous default stays listed; the new default is not listed twice",
                )
                diagnostics = await async_get_config_entry_diagnostics(hass, entries[0])
                check(
                    diagnostics["connectionOrigin"] == "discovered"
                    and app_url not in json.dumps(diagnostics),
                    "diagnostics show the source origin without its address",
                )
                # Floor planners (Phase 21): the list is normalised, de-duplicated, never holds the default,
                # and making one the default moves the previous default into it without other changes.
                listed = await app.connection_patch(
                    {
                        "expectedRevision": integer(
                            app.configuration.snapshot()["revision"]
                        ),
                        "patch": {
                            "servers": [
                                "http://laptop.local:5173",
                                "http://laptop.local:5173/",
                                app_url,
                                "http://office.local:5173/",
                            ]
                        },
                    }
                )
                planners = record(listed["connection"])
                check(
                    planners["servers"]
                    == ["http://laptop.local:5173/", "http://office.local:5173/"]
                    and planners["builderUrl"] == app_url
                    and planners["generation"] == switched["generation"],
                    "floor planners: a list edit normalises, drops duplicates and the default, keeps the source",
                )
                promoted = record(
                    (
                        await app.connection_patch(
                            {
                                "expectedRevision": integer(
                                    app.configuration.snapshot()["revision"]
                                ),
                                "patch": {"builderUrl": "http://office.local:5173/"},
                            }
                        )
                    )["connection"]
                )
                check(
                    promoted["builderUrl"] == "http://office.local:5173/"
                    and promoted["servers"] == [app_url, "http://laptop.local:5173/"]
                    and promoted["origin"] == "manual"
                    and promoted["generation"] == integer(planners["generation"]) + 1,
                    "floor planners: making one the default lists the previous default first",
                )
                try:
                    await app.connection_patch(
                        {
                            "expectedRevision": integer(
                                app.configuration.snapshot()["revision"]
                            ),
                            "patch": {"servers": ["ftp://nope/"]},
                        }
                    )
                    rejected = False
                except HomeplanError:
                    rejected = True
                check(rejected, "floor planners: an invalid address is refused")
                deleted = record(
                    (
                        await app.connection_patch(
                            {
                                "expectedRevision": integer(
                                    app.configuration.snapshot()["revision"]
                                ),
                                "patch": {
                                    "builderUrl": app_url,
                                    "servers": ["http://laptop.local:5173/"],
                                },
                            }
                        )
                    )["connection"]
                )
                check(
                    deleted["builderUrl"] == app_url
                    and deleted["servers"] == ["http://laptop.local:5173/"],
                    "floor planners: deleting the default with an explicit list does not keep it",
                )
                check(
                    app.connection_state(app.configuration.snapshot())["discoveredUrl"]
                    == app_url,
                    "floor planners: the connection response names the found app (it cannot be deleted)",
                )
                await async_unload_entry(hass, entries[0])
            finally:
                await hass.async_stop()


async def main() -> None:
    await pure_checks()
    await integration_checks()
    # Last: each HomeAssistant instance owns HA's process-global frame helper while it runs.
    await discovery_checks()
    print(
        f"HA storage/HTTP checks: {CHECKS} passed against real HA 2025.7.4 APIs and isolated fixtures."
    )


if __name__ == "__main__":
    asyncio.run(main())
