"""Validate against generated TypeBox JSON Schema; never maintain a second house model."""

import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import jcs
from jsonschema import Draft7Validator, FormatChecker

from .errors import HomeplanError

SCHEMAS: dict[str, object] = json.loads(
    (Path(__file__).parent / "schemas.json").read_text()
)


def record(value: object) -> dict[str, object]:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise HomeplanError(422, "invalidDocument", "Expected a JSON object.")
    return {key: item for key, item in value.items() if isinstance(key, str)}


def text(value: object) -> str:
    if not isinstance(value, str):
        raise HomeplanError(422, "invalidDocument", "Expected a string.")
    return value


def integer(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise HomeplanError(422, "invalidDocument", "Expected a nonnegative integer.")
    return value


def items(value: object) -> list[object]:
    if not isinstance(value, list):
        raise HomeplanError(422, "invalidDocument", "Expected an array.")
    return list(value)


# One compiled validator per schema name; schemas are fixed for the process lifetime.
_VALIDATORS: dict[str, Draft7Validator] = {}


def _validator(name: str) -> Draft7Validator:
    cached = _VALIDATORS.get(name)
    if cached is not None:
        return cached
    schema = SCHEMAS.get(name)
    if schema is None:
        raise HomeplanError(
            500, "internal", "A required schema is missing; reinstall the component."
        )
    compiled = Draft7Validator(record(schema), format_checker=FormatChecker())
    _VALIDATORS[name] = compiled
    return compiled


def validate(name: str, value: object) -> dict[str, object]:
    errors = list(_validator(name).iter_errors(value))
    if errors:
        path = "/".join(str(part) for part in errors[0].absolute_path)
        raise HomeplanError(422, "invalidDocument", f"Invalid {name} at /{path}.")
    return record(value)


def _unique(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise HomeplanError(422, "invalidDocument", "Duplicate JSON key.")
        result[key] = value
    return result


def parse_json(data: bytes | str) -> object:
    try:
        return json.loads(data, object_pairs_hook=_unique, parse_constant=_bad_number)
    except (ValueError, UnicodeError) as err:
        raise HomeplanError(422, "invalidDocument", "Invalid JSON data.") from err


def parse_validated(name: str, data: bytes | str) -> dict[str, object]:
    """Parse and validate one document; blocking for large inputs, so run it in an executor."""
    return validate(name, parse_json(data))


def _bad_number(value: str) -> None:
    raise ValueError(f"Nonfinite number: {value}")


def identity(manifest: dict[str, object], key: str) -> str:
    payload = {
        name: value
        for name, value in manifest.items()
        if name not in (key, "createdAt")
    }
    return hashlib.sha256(jcs.canonicalize(payload)).hexdigest()


def safe_path(value: str) -> str:
    if (
        not value
        or len(value) > 512
        or not re.fullmatch(r"[a-zA-Z0-9_./-]+", value)
        or any(part in ("", ".", "..") for part in value.split("/"))
    ):
        raise HomeplanError(400, "validation", "Invalid resource path.")
    return value


# The only media types an artifact file may declare, by extension (the builder's
# server/snapshots/artifacts.ts mediaType()). A manifest that names any other type
# (for example text/html) is refused, so a builder cannot make HA serve active content.
_MEDIA_BY_EXTENSION = {
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".js": "text/javascript",
    ".css": "text/css",
}


def expected_media_type(path: str) -> str:
    """The media type an artifact file at this path must declare."""
    suffix = path[path.rfind(".") :].lower() if "." in path.rsplit("/", 1)[-1] else ""
    return _MEDIA_BY_EXTENSION.get(suffix, "application/octet-stream")


def inside(root: Path, relative: str) -> Path:
    target = root / safe_path(relative)
    resolved_root = root.resolve()
    if target.resolve() != target.absolute() or not target.resolve().is_relative_to(
        resolved_root
    ):
        raise HomeplanError(
            400, "validation", "Resource path escapes its directory or uses a symlink."
        )
    return target


def checked_id(value: str, artifact: bool = False) -> str:
    pattern = r"[a-f0-9]{64}" if artifact else r"[a-z]+_[a-z0-9]{6,}"
    if not re.fullmatch(pattern, value):
        raise HomeplanError(400, "validation", "Invalid resource ID.")
    return value


def normalize_url(value: object) -> str | None:
    if value is None or value == "":
        return None
    raw = text(value).strip()
    parsed = urlsplit(raw)
    if (
        len(raw) > 2048
        or parsed.scheme not in ("http", "https")
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or any(
            part in ("houses", "ha-viewer", "api") for part in parsed.path.split("/")
        )
        or any(c.isspace() or ord(c) < 32 for c in raw)
    ):
        raise HomeplanError(
            400,
            "validation",
            "Enter the Floor Builder HTTP(S) base URL, including its port/prefix, without a house path or credentials.",
        )
    try:
        _port = parsed.port
    except ValueError as err:
        raise HomeplanError(400, "validation", "Invalid server port.") from err
    return urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path.rstrip("/") + "/", "", "")
    )
