"""Entry-owned runtime: no network work is needed to open an existing local home."""

import asyncio
import copy
import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store

from .artifacts import (
    cleanup,
    cleanup_unconfigured,
    deactivate,
    download_artifact,
    inventory,
    read_inventory,
    read_manifest,
    verify,
)
from .const import MAX_FLOOR_PLANNERS, MAX_MANIFEST
from .errors import HomeplanError
from .source_client import SourceClient
from .storage import EMPTY_BINDINGS, ConfigurationStore, migrate_seed
from .validation import (
    checked_id,
    inside,
    integer,
    items,
    normalize_url,
    parse_json,
    record,
    text,
    validate,
)

_LOGGER = logging.getLogger(__name__)


def now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _timestamp(value: object) -> datetime | None:
    """An ISO 8601 instant (``Z`` or offset); None when absent or unparsable."""
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


class HomeplanRuntime:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.root = Path(hass.config.path("homeplan")).resolve()
        backend: Store[dict[str, object]] = Store(hass, 1, "homeplan.configuration")
        self.configuration = ConfigurationStore(backend.async_load, backend.async_save)
        self.job_store: Store[dict[str, object]] = Store(hass, 1, "homeplan.jobs")
        self.jobs: list[dict[str, object]] = []
        self.tasks: dict[str, asyncio.Task[None]] = {}
        self.selection_intent = 0
        self.recovery: str | None = None
        self._connected_generation: int | None = None
        self._connected_ids: set[str] = set()
        # Last app address announced through Supervisor discovery (memory only; the app re-announces).
        self.discovered_url: str | None = None
        self.shipped: dict[str, object] = {}
        # Verified (manifest, inventory) per immutable artifact directory; bounded FIFO.
        self._inventories: dict[
            tuple[str, bool], tuple[dict[str, object], dict[str, dict[str, object]]]
        ] = {}
        self.shipped_seen: Store[dict[str, object]] = Store(
            hass, 1, "homeplan.shipped_frontend"
        )

    async def setup(self) -> None:
        self.shipped = await asyncio.to_thread(
            read_manifest, Path(__file__).parent / "frontend", True
        )
        await asyncio.to_thread(self.root.mkdir, parents=True, exist_ok=True)
        try:
            await self.configuration.load()
        except (HomeplanError, KeyError, TypeError, ValueError) as err:
            detail = (
                err.message if isinstance(err, HomeplanError) else type(err).__name__
            )
            raise HomeplanError(
                500,
                "invalidConfiguration",
                "The stored Homeplan configuration (.storage/homeplan.configuration) is invalid "
                f"({detail}). Restore it from a Home Assistant backup, or remove that file to start over.",
            ) from err
        stored = await self.job_store.async_load()
        if stored is not None:
            # Job history is advisory; one malformed record must not block setup.
            raw_jobs = stored.get("jobs", [])
            for value in raw_jobs if isinstance(raw_jobs, list) else []:
                try:
                    self.jobs.append(validate("IntegrationJob", value))
                except HomeplanError:
                    _LOGGER.warning("Homeplan dropped an invalid stored job record")
            self.jobs = self.jobs[-20:]
        current = self.configuration.snapshot()
        for job in self.jobs:
            if job["status"] in ("pending", "running"):
                committed = False
                if job["kind"] == "panelUpgrade":
                    active = record(current["frontend"])["active"]
                    committed = active is not None and record(active)[
                        "bundleId"
                    ] == job.get("bundleId")
                elif isinstance(job["houseId"], str):
                    active_copy = record(current["houses"]).get(job["houseId"])
                    committed = active_copy is not None and record(active_copy)[
                        "snapshotId"
                    ] == job.get("snapshotId")
                job.update(
                    status="completed" if committed else "failed",
                    stage=None,
                    finishedAt=now(),
                    updatedAt=now(),
                    outcome="upgraded" if committed else None,
                    error=None
                    if committed
                    else {
                        "code": "interrupted",
                        "message": "Interrupted by Home Assistant restart; prior copies were preserved. Retry explicitly.",
                    },
                )
        await self._recover_copies()
        await self.save_jobs()
        await self.cleanup()

    def source(self) -> SourceClient:
        connection = record(self.configuration.snapshot()["connection"])
        url = connection["builderUrl"]
        if not isinstance(url, str):
            raise HomeplanError(
                400, "validation", "Enter a Floor Builder URL and press Connect first."
            )
        return SourceClient(async_get_clientsession(self.hass), url)

    def generation(self, expected: object) -> None:
        actual = record(self.configuration.snapshot()["connection"])["generation"]
        if expected != actual:
            raise HomeplanError(
                409, "sourceChanged", "The Floor Builder URL changed; Connect again."
            )

    async def connection_patch(
        self, body: dict[str, object], origin: str = "manual"
    ) -> dict[str, object]:
        """The one connection write path. HTTP and recovery edits are manual; recovery's
        "use the discovered app" passes origin="discovered"."""
        validate("ConnectionPatch", body)
        patch = record(body["patch"])

        def change(value: dict[str, object]) -> None:
            connection = record(value["connection"])
            servers = [str(url) for url in list(connection.get("servers", []))]
            if "servers" in patch:
                servers = []
                for raw in list(patch["servers"]):
                    url = normalize_url(raw)
                    if url is not None and url not in servers:
                        servers.append(url)
            if "builderUrl" in patch:
                url = normalize_url(patch["builderUrl"])
                previous = connection["builderUrl"]
                if url != previous:
                    connection["builderUrl"] = url
                    connection["generation"] = integer(connection["generation"]) + 1
                    connection["origin"] = None if url is None else origin
                    # Floor planners (Phase 21): the previous default stays in the list, unless the same edit
                    # gives the list explicitly (deleting the default).
                    if (
                        "servers" not in patch
                        and isinstance(previous, str)
                        and previous not in servers
                    ):
                        servers.insert(0, previous)
                elif url is not None and origin == "discovered":
                    connection["origin"] = origin
            # The default is never also listed; the list stays bounded.
            connection["servers"] = [
                url for url in servers if url != connection["builderUrl"]
            ][:MAX_FLOOR_PLANNERS]
            if "devMode" in patch:
                connection["devMode"] = patch["devMode"]
            if connection["devMode"] and connection["builderUrl"] is None:
                raise HomeplanError(
                    400,
                    "validation",
                    "Set the shared Floor Builder URL before enabling DEV MODE.",
                )
            if connection["devMode"] and connection["origin"] == "discovered":
                # Owner rule (2026-11-19): DEV MODE is for a builder on the developer's own computer,
                # never for the Homeplan app found through discovery.
                raise HomeplanError(
                    400,
                    "validation",
                    "DEV MODE is for a Floor Builder running on your own computer, not the Homeplan app.",
                )
            value["connection"] = connection

        result = await self.configuration.mutate(
            change, integer(body["expectedRevision"])
        )
        return self.connection_state(result)

    def connection_state(self, config: dict[str, object]) -> dict[str, object]:
        """The connection response: the stored record and the Homeplan app's address while discovery announces it
        (Settings keeps that floor planner until its app is removed)."""
        return {
            "revision": config["revision"],
            "connection": config["connection"],
            "discoveredUrl": self.discovered_url,
        }

    async def peek(self, body: dict[str, object]) -> dict[str, object]:
        """Another floor planner's houses, read only (Settings → Houses lists every floor planner's houses)."""
        validate("PeekRequest", body)
        url = normalize_url(body["url"])
        if url is None:
            raise HomeplanError(400, "validation", "Expected a floor planner URL.")
        source = SourceClient(async_get_clientsession(self.hass), url)
        houses = await source.json("houses", "HouseListResponse")
        return {"url": url, "houses": houses["houses"]}

    async def adopt_discovered(self, url: str) -> str:
        """Apply an announced app address under the same serialized revision-aware write.

        Returns "applied" (no URL yet, or the previous URL was itself discovered), "unchanged", or
        "manualKept": an operator-entered URL is never replaced; the offer stays available to recovery.
        DEV MODE, the selected house and all bindings are untouched.
        """
        normalized = normalize_url(url)
        if normalized is None:
            raise HomeplanError(422, "invalidDiscovery", "Empty discovered address.")
        self.discovered_url = normalized
        outcome = "unchanged"

        def change(value: dict[str, object]) -> None:
            nonlocal outcome
            connection = record(value["connection"])
            current = connection["builderUrl"]
            if current == normalized:
                outcome = "unchanged"
            elif current is None or connection["origin"] == "discovered":
                connection["builderUrl"] = normalized
                connection["origin"] = "discovered"
                connection["generation"] = integer(connection["generation"]) + 1
                # DEV MODE never applies to the app (see connection_patch).
                connection["devMode"] = False
                outcome = "applied"
            else:
                outcome = "manualKept"
                # Floor planners (Phase 21): the found app is listed, so it can be made the default.
                servers = [str(url) for url in list(connection.get("servers", []))]
                if normalized not in servers:
                    connection["servers"] = [normalized, *servers][:MAX_FLOOR_PLANNERS]
            value["connection"] = connection

        await self.configuration.mutate(change)
        return outcome

    def discovery_outcome(self, url: str) -> str:
        """What adopt_discovered would do now, without writing (lets discovery skip a needless probe)."""
        connection = record(self.configuration.snapshot()["connection"])
        if connection["builderUrl"] == url:
            return "unchanged"
        if connection["builderUrl"] is None or connection["origin"] == "discovered":
            return "applied"
        return "manualKept"

    def discovery_offer(self) -> str | None:
        """A discovered address the operator could switch to (shown in native Configure)."""
        connection = record(self.configuration.snapshot()["connection"])
        if (
            self.discovered_url is None
            or connection["builderUrl"] == self.discovered_url
        ):
            return None
        return self.discovered_url

    async def connect(self, body: dict[str, object]) -> dict[str, object]:
        validate("RevisionRequest", body)
        config = self.configuration.snapshot()
        if body["expectedRevision"] != config["revision"]:
            raise HomeplanError(
                409, "staleRevision", "Settings changed; reload the connection values."
            )
        generation = integer(record(config["connection"])["generation"])
        source = self.source()
        capabilities = await source.json("capabilities")
        if (
            not record(config["connection"])["devMode"]
            and "houseSnapshots" not in capabilities
        ):
            raise HomeplanError(
                422,
                "incompatibleSnapshot",
                "Update Floor Builder: this server does not export saved house snapshots yet.",
            )
        houses = await source.json("houses", "HouseListResponse")
        self.generation(generation)
        self._connected_generation = generation
        self._connected_ids = {
            text(record(item)["id"])
            for item in items(houses["houses"])
            if record(item)["status"] == "ok"
        }
        offer: object = None
        try:
            offer = await source.frontend()
        except HomeplanError:
            # House discovery remains usable while the source production UI has not been built yet.
            pass
        self.generation(generation)
        return {
            "generation": generation,
            "connectedAt": now(),
            "houses": houses["houses"],
            "frontendOffer": offer,
        }

    async def config_patch(self, body: dict[str, object]) -> dict[str, object]:
        if set(body) != {"expectedRevision", "patch"}:
            raise HomeplanError(
                400, "validation", "Expected a revision and settings patch."
            )
        patch = record(body["patch"])
        # Reuse the exact preferences allowlist/field schemas while keeping storage in HA.
        validate("PreferencesPatch", {"homeAssistant": patch})

        def change(value: dict[str, object]) -> None:
            markers = record(value["imports"])
            for field in ("viewer", "dashboard"):
                if field in patch:
                    if field == "viewer":
                        markers["global"] = True
                        requested = record(patch[field])
                        house_id = requested.get("houseId")
                        if house_id is not None and house_id not in record(
                            value["houses"]
                        ):
                            raise HomeplanError(
                                400,
                                "validation",
                                "Choose a remote house through Use this house.",
                            )
                        value[field] = {**record(value[field]), **requested}
                    else:
                        value[field] = copy.deepcopy(patch[field])
                        markers["global"] = True
            if "bindings" in patch:
                bindings = record(value["bindings"])
                imported = record(markers["houses"])
                for house_id, given in record(patch["bindings"]).items():
                    checked_id(house_id)
                    bindings[house_id] = {
                        **record(bindings.get(house_id, copy.deepcopy(EMPTY_BINDINGS))),
                        **record(given),
                    }
                    imported[house_id] = True
                markers["houses"] = imported
                value["bindings"] = bindings
            value["imports"] = markers

        result = await self.configuration.mutate(
            change, integer(body["expectedRevision"])
        )
        return {"revision": result["revision"], "configuration": result}

    async def use_house(
        self, house_id: str, body: dict[str, object]
    ) -> tuple[int, dict[str, object]]:
        validate("UseHouseRequest", body)
        self.generation(body["generation"])
        config = self.configuration.snapshot()
        if config["revision"] != body["expectedRevision"]:
            raise HomeplanError(
                409, "staleRevision", "Settings changed; reload/reapply the selection."
            )
        self.selection_intent += 1
        intent = self.selection_intent
        connection = record(config["connection"])
        local = record(config["houses"]).get(house_id)
        if connection["devMode"]:
            if (
                self._connected_generation != body["generation"]
                or house_id not in self._connected_ids
            ):
                raise HomeplanError(
                    409,
                    "sourceChanged",
                    "Connect and select a house from the current source.",
                )
            source = self.source()
            envelope = await source.house(house_id)
            if record(envelope["document"])["id"] != house_id:
                raise HomeplanError(
                    422, "invalidDocument", "The source returned a different house."
                )
            seed = await source.preferences()
            self.generation(body["generation"])

            def select_remote(value: dict[str, object]) -> None:
                if intent != self.selection_intent:
                    raise HomeplanError(
                        409,
                        "sourceChanged",
                        "Another house selection superseded this one.",
                    )
                preferences = record(record(seed["preferences"])["homeAssistant"])
                bindings = record(preferences["bindings"]).get(
                    house_id, copy.deepcopy(EMPTY_BINDINGS)
                )
                migrate_seed(
                    value,
                    house_id,
                    {
                        "viewer": preferences["viewer"],
                        "dashboard": preferences["dashboard"],
                    },
                    {"bindings": bindings},
                )
                value["viewer"] = {**record(value["viewer"]), "houseId": house_id}

                associations = record(value["houseSources"])
                associations[house_id] = source.base
                value["houseSources"] = associations

            result = await self.configuration.mutate(
                select_remote, integer(body["expectedRevision"])
            )
            return 200, {"revision": result["revision"], "configuration": result}
        if local is not None:
            await asyncio.to_thread(
                verify, self.house_path(house_id, text(record(local)["snapshotId"]))
            )

            def select_local(value: dict[str, object]) -> None:
                if intent != self.selection_intent:
                    raise HomeplanError(
                        409,
                        "sourceChanged",
                        "Another house selection superseded this one.",
                    )
                value["viewer"] = {**record(value["viewer"]), "houseId": house_id}

            result = await self.configuration.mutate(
                select_local, integer(body["expectedRevision"])
            )
            return 200, {"revision": result["revision"], "configuration": result}
        if (
            self._connected_generation != body["generation"]
            or house_id not in self._connected_ids
        ):
            raise HomeplanError(
                409, "sourceChanged", "Connect and select a valid house first."
            )
        return 202, {
            "job": await self.start_job("houseUpgrade", house_id, body, intent)
        }

    async def verified_inventory(
        self, directory: Path, frontend: bool = False
    ) -> tuple[dict[str, object], dict[str, dict[str, object]]]:
        """Manifest + inventory of an immutable artifact, checked once per directory.

        Artifact directories are content-addressed and never rewritten in place, so a verified
        inventory stays valid; serving still checks each file, so a removed copy answers 410.
        """
        key = (str(directory), frontend)
        cached = self._inventories.get(key)
        if cached is None:
            cached = await self.hass.async_add_executor_job(
                read_inventory, directory, frontend
            )
            if len(self._inventories) >= 64:
                self._inventories.pop(next(iter(self._inventories)))
            self._inventories[key] = cached
        return cached

    def house_path(self, house_id: str, snapshot_id: str) -> Path:
        return inside(
            self.root / "houses" / checked_id(house_id), checked_id(snapshot_id, True)
        )

    async def save_jobs(self) -> None:
        active = [job for job in self.jobs if job["status"] in ("pending", "running")]
        terminal = [
            job for job in self.jobs if job["status"] not in ("pending", "running")
        ]
        self.jobs = terminal[-20:] + active
        await self.job_store.async_save({"jobs": copy.deepcopy(self.jobs)})

    async def start_job(
        self,
        kind: str,
        house_id: str | None,
        body: dict[str, object],
        select_intent: int | None = None,
    ) -> dict[str, object]:
        self.generation(body["generation"])
        for running_job in self.jobs:
            if (
                running_job["kind"] == kind
                and running_job["houseId"] == house_id
                and running_job["status"] in ("pending", "running")
            ):
                if select_intent is not None:
                    raise HomeplanError(
                        409,
                        "upgradeInProgress",
                        "Wait for this house's upgrade, then Use this house.",
                    )
                return copy.deepcopy(running_job)
        if len(self.tasks) >= 4:
            raise HomeplanError(
                409,
                "upgradeInProgress",
                "Four transfers are already active; wait for one to finish.",
            )
        # Resolve the source before recording the job, so a refusal never leaves a pending record.
        source = self.source()
        job: dict[str, object] = {
            "id": "job_" + uuid.uuid4().hex,
            "kind": kind,
            "houseId": house_id,
            "snapshotId": None,
            "bundleId": None,
            "status": "pending",
            "stage": "checking",
            "filesDone": 0,
            "filesTotal": 0,
            "bytesDone": 0,
            "bytesTotal": 0,
            "createdAt": now(),
            "updatedAt": now(),
            "finishedAt": None,
            "error": None,
            "outcome": None,
        }
        self.jobs.append(job)
        await self.save_jobs()
        # Entry-owned background task: HA cancels it on unload/shutdown. Not eager, so the task is
        # registered before its first step and cancellation before that step stays terminal.
        self.tasks[text(job["id"])] = self.entry.async_create_background_task(
            self.hass,
            self._run_job(job, source, body, select_intent),
            "Homeplan artifact upgrade",
            eager_start=False,
        )
        return copy.deepcopy(job)

    async def _run_job(
        self,
        job: dict[str, object],
        source: SourceClient,
        body: dict[str, object],
        select_intent: int | None,
    ) -> None:
        try:
            job["status"] = "running"
            frontend = job["kind"] == "panelUpgrade"
            if frontend:
                manifest = await source.frontend()
                if body.get("expectedBundleId") not in (None, manifest["bundleId"]):
                    raise HomeplanError(
                        409,
                        "sourceChanged",
                        "The offered frontend changed; check again.",
                    )
                root = self.root / "frontend"
                prefix = "viewer/frontend/" + text(manifest["bundleId"])
            else:
                house_id = text(job["houseId"])
                export = await source.json(
                    f"houses/{house_id}/snapshots",
                    "SnapshotExport",
                    "POST",
                    {
                        key: value
                        for key, value in body.items()
                        if key == "expectedSourceRevisionId"
                    },
                    MAX_MANIFEST,
                )
                prefix = f"houses/{house_id}/snapshots/{text(export['snapshotId'])}"
                manifest = await source.json(
                    prefix + "/manifest", "SnapshotManifest", maximum=MAX_MANIFEST
                )
                if manifest["houseId"] != house_id:
                    raise HomeplanError(
                        422, "invalidDocument", "The transfer is for a different house."
                    )
                root = self.root / "houses" / house_id
            job["bundleId" if frontend else "snapshotId"] = manifest[
                "bundleId" if frontend else "snapshotId"
            ]
            files = inventory(manifest, frontend)
            job.update(
                stage="downloading",
                filesTotal=len(files),
                bytesTotal=sum(integer(entry["byteSize"]) for entry in files.values()),
                updatedAt=now(),
            )
            await self.save_jobs()

            def progress(count: int, size: int) -> None:
                job["filesDone"] = integer(job["filesDone"]) + count
                job["bytesDone"] = integer(job["bytesDone"]) + size
                job["updatedAt"] = now()

            directory = await download_artifact(
                source, root, manifest, prefix, progress, frontend
            )
            job.update(stage="verifying", updatedAt=now())
            await self.save_jobs()
            self.generation(body["generation"])
            job["stage"] = "activating"
            await self.save_jobs()

            seed = (
                None
                if frontend
                else await asyncio.to_thread(
                    lambda: validate(
                        "BindingSeed",
                        parse_json((directory / "bindings.json").read_bytes()),
                    )
                )
            )

            def activate(value: dict[str, object]) -> None:
                self.generation(body["generation"])
                if frontend:
                    current = record(value["frontend"])
                    if (
                        current["active"] is not None
                        and record(current["active"])["bundleId"]
                        == manifest["bundleId"]
                    ):
                        job["outcome"] = "unchanged"
                    else:
                        value["frontend"] = {
                            "active": manifest,
                            "previous": current["active"],
                        }
                        job["outcome"] = "upgraded"
                else:
                    house_id = text(job["houseId"])
                    houses = record(value["houses"])
                    previous = houses.get(house_id)
                    previous_id = (
                        record(previous)["snapshotId"] if previous is not None else None
                    )
                    if previous_id == manifest["snapshotId"]:
                        job["outcome"] = "unchanged"
                    else:
                        houses[house_id] = {
                            "houseId": house_id,
                            "snapshotId": manifest["snapshotId"],
                            "sourceRevisionId": manifest["sourceRevisionId"],
                            "documentRevision": manifest["documentRevision"],
                            "savedAt": manifest["savedAt"],
                            "importedAt": now(),
                            "producerVersion": manifest["producerVersion"],
                            "fileCount": len(files),
                            "byteSize": job["bytesTotal"],
                            "sourceUrl": source.base,
                            "previousSnapshotId": previous_id,
                        }
                        value["houses"] = houses
                        job["outcome"] = "imported" if previous is None else "upgraded"
                    if seed is None:
                        raise HomeplanError(
                            422, "invalidDocument", "The migration seed is missing."
                        )
                    migrate_seed(value, house_id, record(manifest["migration"]), seed)
                    associations = record(value["houseSources"])
                    associations[house_id] = source.base
                    value["houseSources"] = associations
                    if (
                        select_intent is not None
                        and select_intent == self.selection_intent
                    ):
                        value["viewer"] = {
                            **record(value["viewer"]),
                            "houseId": house_id,
                        }

            before = self.configuration.snapshot()
            await self.configuration.mutate(activate)
            try:
                if frontend:
                    old = record(before["frontend"])["active"]
                    await asyncio.to_thread(
                        deactivate,
                        root,
                        None if old is None else record(old)["bundleId"],
                    )
                else:
                    old = record(before["houses"]).get(text(job["houseId"]))
                    await asyncio.to_thread(
                        deactivate,
                        root,
                        None if old is None else record(old)["snapshotId"],
                    )
            except OSError:
                _LOGGER.warning(
                    "Homeplan activated successfully but could not update a retention marker"
                )
            job.update(
                status="completed", stage=None, finishedAt=now(), updatedAt=now()
            )
        except asyncio.CancelledError:
            job.update(status="canceled", stage=None, finishedAt=now(), updatedAt=now())
            raise
        except (
            HomeplanError,
            OSError,
            ValueError,
            TimeoutError,
            ExceptionGroup,
            KeyError,
            TypeError,
            RuntimeError,
        ) as err:
            problem = self._problem(err)
            job.update(
                status="failed",
                stage=None,
                finishedAt=now(),
                updatedAt=now(),
                error={"code": problem.code, "message": problem.message},
            )
            _LOGGER.warning("Homeplan %s failed: %s", job["kind"], problem.code)
        except Exception:
            # Any unexpected defect still ends the job; a job must never stay "running".
            _LOGGER.exception("Homeplan %s failed unexpectedly", job["kind"])
            internal = self._problem(RuntimeError())
            job.update(
                status="failed",
                stage=None,
                finishedAt=now(),
                updatedAt=now(),
                error={"code": internal.code, "message": internal.message},
            )
        finally:
            self.tasks.pop(text(job["id"]), None)
            await self.save_jobs()
            await self.cleanup()

    @staticmethod
    def _problem(err: Exception) -> HomeplanError:
        if isinstance(err, HomeplanError):
            return err
        if isinstance(err, ExceptionGroup):
            for child in err.exceptions:
                problem = HomeplanRuntime._problem(child)
                if problem.code != "internal":
                    return problem
        return HomeplanError(
            500,
            "internal",
            "The upgrade failed. Existing local copies/settings were retained; retry or use native integration recovery.",
        )

    async def cancel(self, job_id: str) -> dict[str, object]:
        job = next((value for value in self.jobs if value["id"] == job_id), None)
        if job is None:
            raise HomeplanError(404, "notFound", "The job was not found.")
        task = self.tasks.get(job_id)
        if task is not None and job["stage"] != "activating":
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            if job["status"] in ("pending", "running"):
                job.update(
                    status="canceled", stage=None, finishedAt=now(), updatedAt=now()
                )
                self.tasks.pop(job_id, None)
                await self.save_jobs()
        return copy.deepcopy(job)

    async def unload(self) -> None:
        for job in self.jobs:
            if job["status"] in ("pending", "running"):
                await self.cancel(text(job["id"]))
        await asyncio.gather(*self.tasks.values(), return_exceptions=True)

    async def cleanup(self) -> None:
        config = self.configuration.snapshot()
        configured = set(record(config["houses"]))
        busy = {
            text(job["houseId"])
            for job in self.jobs
            if job["status"] in ("pending", "running")
            and isinstance(job["houseId"], str)
        }
        await asyncio.to_thread(
            cleanup_unconfigured, self.root / "houses", configured, busy
        )
        for house_id, value in record(config["houses"]).items():
            metadata = record(value)
            protected = {text(metadata["snapshotId"])}
            if isinstance(metadata["previousSnapshotId"], str):
                protected.add(metadata["previousSnapshotId"])
            await asyncio.to_thread(cleanup, self.root / "houses" / house_id, protected)
        frontend = record(config["frontend"])
        protected = {
            text(record(frontend[key])["bundleId"])
            for key in ("active", "previous")
            if frontend[key] is not None
        }
        await asyncio.to_thread(cleanup, self.root / "frontend", protected)

    async def _recover_copies(self) -> None:
        config = self.configuration.snapshot()
        for house_id, raw in record(config["houses"]).items():
            metadata = record(raw)
            try:
                await asyncio.to_thread(
                    verify, self.house_path(house_id, text(metadata["snapshotId"]))
                )
            except (HomeplanError, OSError):
                previous = metadata["previousSnapshotId"]
                if not isinstance(previous, str):
                    self.recovery = "A local copy is damaged; use House setup to upgrade it or choose another house."
                    continue
                try:
                    manifest = await asyncio.to_thread(
                        verify, self.house_path(house_id, previous)
                    )
                except (HomeplanError, OSError):
                    self.recovery = (
                        "No verified house copy is available; use House setup."
                    )
                    continue

                def recover(
                    value: dict[str, object],
                    metadata: dict[str, object] = metadata,
                    previous: str = previous,
                    manifest: dict[str, object] = manifest,
                    house_id: str = house_id,
                ) -> None:
                    houses = record(value["houses"])
                    recovered = {
                        **metadata,
                        "snapshotId": previous,
                        "previousSnapshotId": None,
                        "sourceRevisionId": manifest["sourceRevisionId"],
                        "documentRevision": manifest["documentRevision"],
                        "savedAt": manifest["savedAt"],
                        "importedAt": now(),
                        "fileCount": len(inventory(manifest)),
                        "byteSize": sum(
                            integer(entry["byteSize"])
                            for entry in inventory(manifest).values()
                        ),
                        "producerVersion": manifest["producerVersion"],
                    }
                    houses[house_id] = recovered
                    value["houses"] = houses

                await self.configuration.mutate(recover)
                self.recovery = "Recovered the previous verified house copy."
        frontend = record(config["frontend"])
        if frontend["active"] is not None:
            try:
                await asyncio.to_thread(
                    verify,
                    self.root
                    / "frontend"
                    / text(record(frontend["active"])["bundleId"]),
                    True,
                )
            except (HomeplanError, OSError):
                replacement: object = None
                if frontend["previous"] is not None:
                    try:
                        replacement = await asyncio.to_thread(
                            verify,
                            self.root
                            / "frontend"
                            / text(record(frontend["previous"])["bundleId"]),
                            True,
                        )
                    except (HomeplanError, OSError):
                        pass

                def recover_frontend(value: dict[str, object]) -> None:
                    value["frontend"] = {"active": replacement, "previous": None}

                await self.configuration.mutate(recover_frontend)
                self.recovery = "Recovered a compatible local frontend; the shipped baseline remains available in native Configure."
        await self._prefer_updated_shipped_frontend()

    async def _prefer_updated_shipped_frontend(self) -> None:
        """Drop a downloaded viewer once the integration ships a different one.

        The shipped bundle ID seen at the previous start lives in its own Store
        (atomic like the rest). A differing ID means the integration was updated;
        with no record (first start of this feature) a download no newer than the
        shipped bundle is dropped. The dropped viewer moves to ``previous``, as
        for restore-packaged; Upgrade panel can activate a download again.
        """
        shipped_id = text(self.shipped["bundleId"])
        stored = await self.shipped_seen.async_load()
        seen = stored.get("bundleId") if stored is not None else None
        if seen == shipped_id:
            return
        active = record(self.configuration.snapshot()["frontend"])["active"]
        if active is not None:
            updated = isinstance(seen, str)
            active_created = _timestamp(record(active).get("createdAt"))
            shipped_created = _timestamp(self.shipped.get("createdAt"))
            # An unparsable date cannot prove the download is newer, so prefer the shipped viewer.
            older = (
                active_created is None
                or shipped_created is None
                or active_created <= shipped_created
            )
            if updated or older:

                def prefer_shipped(value: dict[str, object]) -> None:
                    current = record(value["frontend"])
                    value["frontend"] = {"active": None, "previous": current["active"]}

                await self.configuration.mutate(prefer_shipped)
        await self.shipped_seen.async_save({"bundleId": shipped_id})
