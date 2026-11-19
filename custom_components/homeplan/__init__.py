"""Homeplan custom integration. Installable independently of the authoring server."""

import hashlib
import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError, ConfigEntryNotReady

from .const import DISCOVERY_HANDOFF, DOMAIN, VERSION
from .errors import HomeplanError
from .http import HomeplanFrontendView, HomeplanView
from .runtime import HomeplanRuntime

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    panels = hass.data.get("frontend_panels", {})
    if DOMAIN in panels and DOMAIN not in hass.data:
        raise ConfigEntryNotReady(
            "Remove the old homeplan panel_custom YAML entry and restart HA; Homeplan will not overwrite another panel."
        )
    app = HomeplanRuntime(hass, entry)
    try:
        await app.setup()
    except HomeplanError as err:
        # Damaged durable state needs an explicit repair; retrying setup cannot fix it.
        raise ConfigEntryError(err.message) from err
    hass.data[DOMAIN] = app
    handoff = entry.data.get(DISCOVERY_HANDOFF)
    if handoff is not None:
        # The discovery flow created this entry before any runtime existed; apply its address once through
        # the configuration authority (a retained manual URL still wins), then drop the hand-off.
        if isinstance(handoff, str):
            try:
                await app.adopt_discovered(handoff)
            except HomeplanError as err:
                _LOGGER.warning(
                    "Homeplan ignored the discovered app address: %s", err.message
                )
        hass.config_entries.async_update_entry(
            entry,
            data={
                key: value
                for key, value in entry.data.items()
                if key != DISCOVERY_HANDOFF
            },
        )
    if not hass.data.get("homeplan_http_registered"):
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    "/homeplan-static",
                    str(Path(__file__).parent / "frontend"),
                    cache_headers=False,
                )
            ]
        )
        hass.http.register_view(HomeplanView(hass))
        hass.http.register_view(HomeplanFrontendView(hass))
        hass.data["homeplan_http_registered"] = True
    loader_version = await hass.async_add_executor_job(_loader_version)
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=DOMAIN,
        webcomponent_name="homeplan-panel",
        sidebar_title="Homeplan",
        sidebar_icon="mdi:home-variant",
        module_url=f"/homeplan-static/loader.js?v={loader_version}",
        embed_iframe=False,
        require_admin=False,
        config={"mode": "integration", "protocol": 1},
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    app = hass.data.get(DOMAIN)
    if isinstance(app, HomeplanRuntime):
        await app.unload()
    frontend.async_remove_panel(hass, DOMAIN)
    hass.data.pop(DOMAIN, None)
    return True


def _loader_version() -> str:
    """Cache key for the loader URL: a hash of the shipped loader.js (Phase 14.7).

    The integration version does not change between builds, so a browser kept serving an older cached loader
    after an update. Falls back to the integration version if the file cannot be read.
    """
    try:
        digest = hashlib.sha256(
            (Path(__file__).parent / "frontend" / "loader.js").read_bytes()
        ).hexdigest()
    except OSError:
        return VERSION
    return f"{VERSION}-{digest[:12]}"
