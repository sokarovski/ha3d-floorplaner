"""Immutable, manifest-allowlisted artifacts outside www and the installed component."""

import asyncio
import hashlib
import io
import json
import logging
import os
import re
import shutil
import time
import uuid
import zipfile
from collections.abc import Callable
from pathlib import Path
from urllib.parse import quote

from .const import (
    GRACE_SECONDS,
    MAX_FRONTEND_TOTAL,
    MAX_HOUSE_TOTAL,
    MAX_MANIFEST,
    MIN_VIEWER_VERSION,
    VERSION,
)
from .errors import HomeplanError
from .source_client import SourceClient
from .validation import (
    checked_id,
    expected_media_type,
    identity,
    inside,
    integer,
    items,
    parse_json,
    record,
    safe_path,
    text,
    validate,
)

_LOGGER = logging.getLogger(__name__)


def _supports_version(required: str) -> bool:
    if re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", required) is None:
        return False
    return tuple(map(int, VERSION.split("."))) >= tuple(map(int, required.split(".")))


def _viewer_supported(version: str) -> bool:
    """Whether a viewer of this version reads this integration's responses."""
    if re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version) is None:
        return False
    return tuple(map(int, version.split("."))) >= tuple(
        map(int, MIN_VIEWER_VERSION.split("."))
    )


def inventory(
    manifest: dict[str, object], frontend: bool = False
) -> dict[str, dict[str, object]]:
    schema = "FrontendManifest" if frontend else "SnapshotManifest"
    validate(schema, manifest)
    key = "bundleId" if frontend else "snapshotId"
    if identity(manifest, key) != text(manifest[key]):
        raise HomeplanError(
            422, "checksumMismatch", "The artifact manifest identity is invalid."
        )
    files: dict[str, dict[str, object]] = {}
    total = 0
    for raw in items(manifest["files"]):
        entry = record(raw)
        path = safe_path(text(entry["path"]))
        if text(entry["mediaType"]) != expected_media_type(path):
            raise HomeplanError(
                422,
                "invalidDocument",
                "A manifest file declares an unsupported media type.",
            )
        if path == "manifest.json" or path in files:
            raise HomeplanError(
                422, "invalidDocument", "Duplicate or reserved manifest path."
            )
        size = integer(entry["byteSize"])
        if frontend and size > 33554432:
            raise HomeplanError(413, "tooLarge", "A frontend file exceeds its limit.")
        total += size
        files[path] = entry
    if total > (MAX_FRONTEND_TOTAL if frontend else MAX_HOUSE_TOTAL):
        raise HomeplanError(
            413, "tooLarge", "The artifact exceeds its total byte limit."
        )
    if frontend:
        if manifest["entry"] not in files or not _supports_version(
            text(manifest["minimumIntegrationVersion"])
        ):
            raise HomeplanError(
                422,
                "integrationUpdateRequired",
                "This frontend requires a different integration version; update the integration first.",
            )
        if not _viewer_supported(text(manifest["version"])):
            raise HomeplanError(
                422,
                "incompatibleFrontend",
                f"This panel ({text(manifest['version'])}) is older than this integration supports; "
                f"use a panel of {MIN_VIEWER_VERSION} or later.",
            )
        # Production builds deliberately emit one complete ES module, avoiding mutable chunk graphs.
        if len(files) != 1 or not text(manifest["entry"]).endswith(".js"):
            raise HomeplanError(
                422,
                "incompatibleFrontend",
                "Unsupported frontend graph; rebuild the production single-module artifact.",
            )
    else:
        if "house.json" not in files or "bindings.json" not in files:
            raise HomeplanError(
                422,
                "missingAsset",
                "The snapshot is missing its house or migration seed.",
            )
        resources = record(manifest["resources"])
        seen: set[str] = set()
        for kind in ("images", "templates"):
            for raw in items(resources[kind]):
                resource = record(raw)
                key_value = text(resource["id"]) + (
                    "@" + str(resource["version"]) if kind == "templates" else ""
                )
                if key_value in seen or resource["path"] not in files:
                    raise HomeplanError(
                        422, "missingAsset", "Duplicate or missing artifact resource."
                    )
                seen.add(key_value)
                for dependency in items(resource.get("dependencies", [])):
                    if dependency not in files:
                        raise HomeplanError(
                            422,
                            "missingAsset",
                            "A template dependency is not in the manifest.",
                        )
    return files


def read_inventory(
    directory: Path, frontend: bool = False
) -> tuple[dict[str, object], dict[str, dict[str, object]]]:
    """The checked manifest and its file inventory (blocking; run it in an executor)."""
    path = inside(directory, "manifest.json")
    if not path.is_file() or path.stat().st_size > MAX_MANIFEST:
        raise HomeplanError(404, "notFound", "No complete local artifact is available.")
    manifest = record(parse_json(path.read_bytes()))
    return manifest, inventory(manifest, frontend)


def read_manifest(directory: Path, frontend: bool = False) -> dict[str, object]:
    return read_inventory(directory, frontend)[0]


def verify(directory: Path, frontend: bool = False) -> dict[str, object]:
    manifest = read_manifest(directory, frontend)
    files = inventory(manifest, frontend)
    for name, entry in files.items():
        path = inside(directory, name)
        if not path.is_file() or path.stat().st_size != entry["byteSize"]:
            raise HomeplanError(
                422,
                "missingAsset",
                "A local artifact file is missing or has changed size.",
            )
        hasher = hashlib.sha256()
        with path.open("rb") as stream:
            while chunk := stream.read(131072):
                hasher.update(chunk)
        if hasher.hexdigest() != entry["sha256"]:
            raise HomeplanError(
                422,
                "checksumMismatch",
                "A local artifact file failed checksum verification.",
            )
    if not frontend:
        document = validate(
            "House", parse_json(inside(directory, "house.json").read_bytes())
        )
        if (
            document["id"] != manifest["houseId"]
            or document["schemaVersion"] != manifest["houseSchemaVersion"]
            or document["revision"] != manifest["documentRevision"]
        ):
            raise HomeplanError(
                422, "invalidDocument", "The copied house identity does not match."
            )
        validate(
            "BindingSeed", parse_json(inside(directory, "bindings.json").read_bytes())
        )
        for name in files:
            if name.endswith(".gltf"):
                gltf = record(parse_json(inside(directory, name).read_bytes()))
                _validate_uris(gltf, name, files)
    return manifest


def _validate_uris(
    value: object, path: str, files: dict[str, dict[str, object]]
) -> None:
    if isinstance(value, list):
        for item in value:
            _validate_uris(item, path, files)
    elif isinstance(value, dict):
        obj = record(value)
        uri = obj.get("uri")
        if isinstance(uri, str) and not uri.startswith("data:"):
            safe_path(uri)
            target = str(Path(path).parent / uri)
            if target not in files:
                raise HomeplanError(
                    422,
                    "missingAsset",
                    "A glTF dependency is outside the snapshot inventory.",
                )
        for item in obj.values():
            _validate_uris(item, path, files)


async def download_artifact(
    source: SourceClient,
    root: Path,
    manifest: dict[str, object],
    prefix: str,
    progress: Callable[[int, int], None],
    frontend: bool = False,
) -> Path:
    files = inventory(manifest, frontend)
    key = text(manifest["bundleId" if frontend else "snapshotId"])
    checked_id(key, True)
    await asyncio.to_thread(root.mkdir, parents=True, exist_ok=True)
    free = (await asyncio.to_thread(shutil.disk_usage, root)).free
    if free < sum(integer(entry["byteSize"]) for entry in files.values()) + 16777216:
        raise HomeplanError(
            507,
            "insufficientStorage",
            "Not enough disk space to preserve existing copies and stage this artifact.",
        )
    target = inside(root, key)
    if target.exists():
        try:
            await asyncio.to_thread(verify, target, frontend)
            return target
        except HomeplanError:
            # A broken same-ID copy must not be trusted or overwrite a protected active copy in place.
            raise HomeplanError(
                422,
                "checksumMismatch",
                "This artifact ID already exists but is damaged; restore a previous copy before retrying.",
            ) from None
    staging = inside(root, ".staging-" + uuid.uuid4().hex)
    await asyncio.to_thread(staging.mkdir)
    semaphore = asyncio.Semaphore(2)

    async def fetch(name: str, entry: dict[str, object]) -> None:
        async with semaphore:
            await source.download(
                prefix + "/files/" + quote(name, safe="/"),
                inside(staging, name),
                entry,
                lambda count: progress(0, count),
            )
            progress(1, 0)

    try:
        async with asyncio.timeout(600):
            async with asyncio.TaskGroup() as group:
                for name, entry in files.items():
                    group.create_task(fetch(name, entry))
        await asyncio.to_thread(_write_manifest, staging, manifest)
        await asyncio.to_thread(verify, staging, frontend)
        await asyncio.to_thread(os.replace, staging, target)
        return target
    finally:
        await asyncio.to_thread(shutil.rmtree, staging, True)


def _write_manifest(directory: Path, manifest: dict[str, object]) -> None:
    with inside(directory, "manifest.json").open("w") as stream:
        json.dump(manifest, stream, ensure_ascii=False, separators=(",", ":"))
        stream.flush()
        os.fsync(stream.fileno())


def cleanup(root: Path, protected: set[str]) -> None:
    """Best effort: one unreadable or undeletable directory never stops the rest (or setup)."""
    try:
        children = list(root.iterdir())
    except FileNotFoundError:
        return
    except OSError as err:
        _LOGGER.warning("Homeplan cleanup could not list %s: %s", root.name, err)
        return
    for path in children:
        try:
            if path.is_symlink() or not path.is_dir() or path.name in protected:
                continue
            # Completed copies use a deactivation marker so an old source date cannot shorten tab grace.
            marker = path / ".deactivated"
            stamp = marker.stat().st_mtime if marker.exists() else path.stat().st_mtime
            if time.time() - stamp > GRACE_SECONDS:
                shutil.rmtree(path)
        except OSError as err:
            _LOGGER.warning("Homeplan cleanup skipped %s: %s", path.name, err)


def cleanup_unconfigured(
    houses_root: Path, configured: set[str], busy: set[str]
) -> None:
    """Expire copies of houses with no configuration entry (failed first imports, removed houses).

    A house with an active job is skipped entirely; other copies get the same grace period as
    deactivated copies, and the emptied house directory itself is removed once it is also old.
    """
    try:
        children = list(houses_root.iterdir())
    except FileNotFoundError:
        return
    except OSError as err:
        _LOGGER.warning("Homeplan cleanup could not list houses: %s", err)
        return
    for path in children:
        if path.name in configured or path.name in busy:
            continue
        try:
            if path.is_symlink() or not path.is_dir():
                continue
            cleanup(path, set())
            if (
                not any(path.iterdir())
                and time.time() - path.stat().st_mtime > GRACE_SECONDS
            ):
                path.rmdir()
        except OSError as err:
            _LOGGER.warning("Homeplan cleanup skipped house %s: %s", path.name, err)


def deactivate(root: Path, old_id: object) -> None:
    if isinstance(old_id, str):
        path = inside(root, checked_id(old_id, True))
        if path.is_dir():
            (path / ".deactivated").touch()


def write_archive(directory: Path) -> bytes:
    """A house archive (Phase 21, Settings → Houses → Download): the verified copy's manifest and files, zipped as
    stored, so the same file uploads to Home Assistant or to a Floor Builder."""
    manifest = verify(directory)
    files = inventory(manifest)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.write(inside(directory, "manifest.json"), "manifest.json")
        for name in sorted(files):
            archive.write(inside(directory, name), name)
    return buffer.getvalue()


def extract_archive(data: bytes, root: Path) -> tuple[Path, dict[str, object]]:
    """Unpacks an uploaded house archive into a fresh staging folder under `root` and verifies every file against
    its manifest (sizes and hashes); the caller moves or removes the folder. Unsafe or oversized archives are
    refused before anything is trusted."""
    staging = inside(root, ".import-" + uuid.uuid4().hex)
    staging.mkdir(parents=True)
    try:
        try:
            archive = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile:
            raise HomeplanError(
                422, "invalidDocument", "This is not a house archive (.zip)."
            ) from None
        with archive:
            members = [member for member in archive.infolist() if not member.is_dir()]
            if len(members) > 10001:
                raise HomeplanError(413, "tooLarge", "The archive has too many files.")
            total = 0
            for member in members:
                total += member.file_size
                if total > MAX_HOUSE_TOTAL:
                    raise HomeplanError(
                        413, "tooLarge", "The archive exceeds the house size limit."
                    )
                target = inside(staging, safe_path(member.filename))
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as source, target.open("wb") as written:
                    shutil.copyfileobj(source, written)
        if not (staging / "manifest.json").is_file():
            raise HomeplanError(
                422, "invalidDocument", "The archive has no house manifest."
            )
        return staging, verify(staging)
    except BaseException:
        shutil.rmtree(staging, True)
        raise
