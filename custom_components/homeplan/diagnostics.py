"""HA-native redacted diagnostics: no house names, entity/action data, URLs or tokens."""

import asyncio

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import VERSION
from .errors import HomeplanError
from .http import runtime
from .validation import parse_json, record, text


def _ids(value: object) -> set[str]:
    result: set[str] = set()
    if isinstance(value, list):
        for child in value:
            result.update(_ids(child))
    elif isinstance(value, dict):
        obj = record(value)
        if isinstance(obj.get("id"), str):
            result.add(text(obj["id"]))
        for child in obj.values():
            result.update(_ids(child))
    return result


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, object]:
    app = runtime(hass)
    config = app.configuration.snapshot()
    copies: list[dict[str, object]] = []
    for house_id, raw in record(config["houses"]).items():
        metadata = record(raw)
        orphans = 0
        try:
            path = app.house_path(house_id, text(metadata["snapshotId"])) / "house.json"
            document = parse_json(await asyncio.to_thread(path.read_bytes))
            ids = _ids(document)
            bindings = record(record(config["bindings"]).get(house_id, {}))
            orphans = sum(
                1
                for kind in ("lights", "objects", "effects", "areas")
                for target in record(bindings.get(kind, {}))
                if target not in ids
            )
        except (OSError, HomeplanError):
            # Availability status is enough here; diagnostics must not leak an OS path/error payload.
            orphans = -1
        copies.append(
            {
                key: metadata[key]
                for key in (
                    "snapshotId",
                    "sourceRevisionId",
                    "documentRevision",
                    "savedAt",
                    "importedAt",
                    "producerVersion",
                    "fileCount",
                    "byteSize",
                )
            }
        )
        copies[-1]["orphanCount"] = orphans
    frontend = record(config["frontend"])
    active = frontend["active"]
    return {
        "integrationVersion": VERSION,
        "loaderProtocol": 1,
        "apiProtocol": 1,
        "devMode": record(config["connection"])["devMode"],
        # How the (redacted) Floor Builder URL was set: "manual", "discovered" or null.
        "connectionOrigin": record(config["connection"])["origin"],
        "discoveredAppOffered": app.discovery_offer() is not None,
        "configurationRevision": config["revision"],
        "frontend": {
            "shippedBundle": app.shipped["bundleId"],
            "activeBundle": None if active is None else record(active)["bundleId"],
        },
        "copies": copies,
        "jobs": [
            {
                "kind": job["kind"],
                "status": job["status"],
                "stage": job["stage"],
                "filesDone": job["filesDone"],
                "bytesDone": job["bytesDone"],
                "updatedAt": job["updatedAt"],
                "errorCode": None
                if job["error"] is None
                else record(job["error"])["code"],
            }
            for job in app.jobs
        ],
    }
