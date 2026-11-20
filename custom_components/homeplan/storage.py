"""One revision-aware HA authority; atomic Store saves precede publishing acknowledgements."""

import asyncio
import copy
import json
from collections.abc import Awaitable, Callable

from .const import MAX_CONFIG
from .errors import HomeplanError
from .validation import integer, record, validate

DEFAULT_DASHBOARD: dict[str, object] = {
    "urlPath": None,
    "areaTabs": {},
    "areaViews": {},
    "areaColumns": {},
    "areaTitles": {},
    "floorTabs": {},
    "floorColumns": {},
    "floorPositions": {},
}
EMPTY_BINDINGS: dict[str, object] = {
    "lights": {},
    "objects": {},
    "effects": {},
    "areas": {},
    "bubbles": {"rooms": {}, "placed": {}},
}


def defaults() -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "revision": 0,
        "viewer": {"houseId": None, "testEntityId": None},
        "connection": {
            "builderUrl": None,
            "devMode": False,
            "generation": 0,
            "origin": None,
            "servers": [],
        },
        "dashboard": copy.deepcopy(DEFAULT_DASHBOARD),
        "bindings": {},
        "imports": {"global": False, "houses": {}},
        "houses": {},
        "houseSources": {},
        "frontend": {"active": None, "previous": None},
    }


class ConfigurationStore:
    def __init__(
        self,
        load: Callable[[], Awaitable[object]],
        save: Callable[[dict[str, object]], Awaitable[None]],
    ) -> None:
        self._load = load
        self._save = save
        self._lock = asyncio.Lock()
        self._value = defaults()

    async def load(self) -> None:
        value = await self._load()
        if value is not None:
            self._value = validate("IntegrationConfiguration", _migrated(value))

    def snapshot(self) -> dict[str, object]:
        return copy.deepcopy(self._value)

    async def mutate(
        self,
        operation: Callable[[dict[str, object]], None],
        expected: int | None = None,
    ) -> dict[str, object]:
        async with self._lock:
            if expected is not None and expected != integer(self._value["revision"]):
                raise HomeplanError(
                    409,
                    "staleRevision",
                    "Settings changed elsewhere. Keep your draft and reload/reapply it.",
                )
            candidate = copy.deepcopy(self._value)
            operation(candidate)
            if candidate == self._value:
                return self.snapshot()
            candidate["revision"] = integer(self._value["revision"]) + 1
            validate("IntegrationConfiguration", candidate)
            if len(json.dumps(candidate).encode()) > MAX_CONFIG:
                raise HomeplanError(
                    413, "tooLarge", "Homeplan settings exceed the storage limit."
                )
            await self._save(candidate)
            self._value = candidate
            return self.snapshot()


def _migrated(value: object) -> object:
    """Additive in-place upgrades of a stored envelope; every existing value is kept.

    - The house-wide `panelColumns` became per-room `areaColumns` (2026-11-17); the old value is dropped.
    - The connection gained `origin` (app discovery): a URL saved before discovery existed was typed by the
      operator, so it becomes "manual" and is never replaced by a discovered app.
    - The connection gained `servers` (Phase 21, other floor planners besides the default): none before.
    """
    if not isinstance(value, dict):
        return value
    dashboard = value.get("dashboard")
    if isinstance(dashboard, dict) and "panelColumns" in dashboard:
        rest = {key: item for key, item in dashboard.items() if key != "panelColumns"}
        value = {**value, "dashboard": {"areaColumns": {}, **rest}}
    connection = value.get("connection")
    if isinstance(connection, dict) and "origin" not in connection:
        origin = None if connection.get("builderUrl") is None else "manual"
        connection = {**connection, "origin": origin}
        value = {**value, "connection": connection}
    if isinstance(connection, dict) and "servers" not in connection:
        value = {**value, "connection": {**connection, "servers": []}}
    return value


def migrate_seed(
    configuration: dict[str, object],
    house_id: str,
    migration: dict[str, object],
    seed: dict[str, object],
) -> None:
    """Markers distinguish never imported from an intentionally empty/null HA setting."""
    markers = record(configuration["imports"])
    imported = record(markers["houses"])
    if house_id not in imported:
        bindings = record(configuration["bindings"])
        if house_id not in bindings:
            bindings[house_id] = copy.deepcopy(seed["bindings"])
        configuration["bindings"] = bindings
        dashboard = record(configuration["dashboard"])
        source_dashboard = record(migration["dashboard"])
        for field in (
            "areaTabs",
            "areaViews",
            "areaColumns",
            "areaTitles",
            "floorTabs",
            "floorColumns",
            "floorPositions",
            "mainViews",
        ):
            # Floor widgets (13.7), room titles (14.4) and main views (16.1) are optional: settings stored before
            # them have none.
            targets = record(dashboard.get(field, {}))
            incoming = record(source_dashboard.get(field, {}))
            if house_id not in targets and house_id in incoming:
                targets[house_id] = copy.deepcopy(incoming[house_id])
            dashboard[field] = targets
        configuration["dashboard"] = dashboard
        imported[house_id] = True
    if not markers["global"]:
        dashboard = record(configuration["dashboard"])
        source_dashboard = record(migration["dashboard"])
        dashboard["urlPath"] = source_dashboard["urlPath"]
        # The viewer's navigation (14.6) is installation-global and optional (absent: the device default).
        if "navigation" in source_dashboard:
            dashboard["navigation"] = source_dashboard["navigation"]
        configuration["dashboard"] = dashboard
        viewer = record(configuration["viewer"])
        seed_viewer = migration.get("viewer")
        if seed_viewer is not None:
            viewer["testEntityId"] = record(seed_viewer)["testEntityId"]
        configuration["viewer"] = viewer
        markers["global"] = True
    markers["houses"] = imported
    configuration["imports"] = markers
