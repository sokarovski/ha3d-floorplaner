"""Native installation and recovery; House setup is the single configuration authority."""

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.service_info.hassio import HassioServiceInfo

from .const import DISCOVERY_HANDOFF, DOMAIN
from .errors import HomeplanError
from .http import runtime
from .runtime import HomeplanRuntime
from .source_client import SourceClient, discovered_url
from .validation import integer, record


class HomeplanConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        super().__init__()
        self._discovered: str | None = None
        self._app_name = "Homeplan"

    async def async_step_user(self, user_input: dict[str, object] | None = None):
        # A pending discovery card must not block manual setup; creating the entry ends that flow, and the
        # app's next announcement fills an empty URL automatically.
        await self.async_set_unique_id(DOMAIN, raise_on_progress=False)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="Homeplan", data={})
        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))

    async def async_step_hassio(self, discovery_info: HassioServiceInfo):
        """A Homeplan app announced its internal address through Supervisor discovery."""
        try:
            url = discovered_url(discovery_info.config)
        except HomeplanError as err:
            return self.async_abort(
                reason="incompatible_app"
                if err.code == "incompatibleDiscovery"
                else "invalid_discovery"
            )
        await self.async_set_unique_id(DOMAIN)
        entry = self.hass.config_entries.async_entry_for_domain_unique_id(
            DOMAIN, DOMAIN
        )
        if entry is not None and entry.source == config_entries.SOURCE_IGNORE:
            return self.async_abort(reason="already_configured")
        app = self.hass.data.get(DOMAIN)
        if entry is not None:
            if not isinstance(app, HomeplanRuntime) or app.entry is not entry:
                return self.async_abort(reason="not_loaded")
            # The app re-announces periodically: an unchanged or manually kept URL needs no probe or write.
            outcome = app.discovery_outcome(url)
            if outcome == "unchanged":
                return self.async_abort(reason="already_configured")
            if outcome == "manualKept":
                # Kept beside the typed default: listed as a floor planner (Phase 21), never replacing it.
                await app.list_discovered(url)
                return self.async_abort(reason="manual_source_kept")
        try:
            await SourceClient(async_get_clientsession(self.hass), url).probe()
        except HomeplanError as err:
            return self.async_abort(
                reason="incompatible_app"
                if err.code == "incompatibleSnapshot"
                else "cannot_connect"
            )
        if entry is not None and isinstance(app, HomeplanRuntime):
            outcome = await app.adopt_discovered(url)
            return self.async_abort(
                reason={
                    "applied": "discovered_applied",
                    "manualKept": "manual_source_kept",
                }.get(outcome, "already_configured")
            )
        self._discovered = url
        self._app_name = discovery_info.name or "Homeplan"
        self.context["title_placeholders"] = {"name": self._app_name}
        return await self.async_step_hassio_confirm()

    async def async_step_hassio_confirm(
        self, user_input: dict[str, object] | None = None
    ):
        if self._discovered is None:
            return self.async_abort(reason="invalid_discovery")
        if user_input is not None:
            return self.async_create_entry(
                title="Homeplan", data={DISCOVERY_HANDOFF: self._discovered}
            )
        self._set_confirm_only()
        return self.async_show_form(
            step_id="hassio_confirm",
            data_schema=vol.Schema({}),
            description_placeholders={"app": self._app_name, "url": self._discovered},
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        return HomeplanOptionsFlow()


class HomeplanOptionsFlow(config_entries.OptionsFlow):
    def __init__(self) -> None:
        super().__init__()
        self._baseline_revision: int | None = None

    async def async_step_init(self, user_input: dict[str, object] | None = None):
        try:
            app = runtime(self.hass)
        except HomeplanError:
            return self.async_abort(reason="not_loaded")
        config = app.configuration.snapshot()
        connection = record(config["connection"])
        offer = app.discovery_offer()
        errors: dict[str, str] = {}
        if self._baseline_revision is None:
            self._baseline_revision = integer(config["revision"])
        if user_input is not None:
            adopt = offer is not None and user_input.get("use_discovered") is True
            try:
                await app.connection_patch(
                    {
                        "expectedRevision": self._baseline_revision,
                        "patch": {
                            "builderUrl": offer
                            if adopt
                            else user_input.get("builder_url", ""),
                            # DEV MODE does not apply to the discovered app.
                            "devMode": False
                            if adopt
                            else user_input.get("dev_mode", False),
                        },
                    },
                    "discovered" if adopt else "manual",
                )
                if user_input.get("restore_packaged"):

                    def restore(value: dict[str, object]) -> None:
                        current = record(value["frontend"])
                        value["frontend"] = {
                            "active": None,
                            "previous": current["active"],
                        }

                    await app.configuration.mutate(restore)
                # No source/policy copies live in config-entry options. A browser reload reads the Store.
                return self.async_create_entry(title="", data={})
            except HomeplanError as err:
                errors["base"] = (
                    "stale_revision"
                    if err.code == "staleRevision"
                    else "invalid_connection"
                )
                self._baseline_revision = integer(
                    app.configuration.snapshot()["revision"]
                )
        schema = vol.Schema(
            {
                vol.Optional(
                    "builder_url",
                    default=user_input.get("builder_url", "")
                    if user_input is not None
                    else (connection["builderUrl"] or ""),
                ): selector.TextSelector(),
                vol.Required(
                    "dev_mode",
                    default=user_input.get("dev_mode", False)
                    if user_input is not None
                    else connection["devMode"],
                ): selector.BooleanSelector(),
                vol.Required(
                    "restore_packaged", default=False
                ): selector.BooleanSelector(),
            }
        )
        if offer is not None:
            schema = schema.extend(
                {
                    vol.Required(
                        "use_discovered", default=False
                    ): selector.BooleanSelector()
                }
            )
        origin = connection["origin"]
        return self.async_show_form(
            step_id="init",
            data_schema=schema,
            errors=errors,
            description_placeholders={
                "origin": "found automatically (Homeplan app)"
                if origin == "discovered"
                else "entered manually"
                if origin == "manual"
                else "not set",
                "discovered": "none" if offer is None else offer,
            },
        )
