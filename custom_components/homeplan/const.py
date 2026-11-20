"""Homeplan protocol constants. No Homeplan user/account layer."""

DOMAIN = "homeplan"
VERSION = "0.1.2"
MIN_HA_VERSION = "2025.7.0"
LOADER_PROTOCOL = 1
API_PROTOCOL = 1
MAX_MANIFEST = 262144
# Floor planners kept besides the default (Phase 21; the TypeBox schema's maxFloorPlanners).
MAX_FLOOR_PLANNERS = 16
MAX_CONFIG = 16777216
MAX_ASSET = 134217728
MAX_HOUSE_TOTAL = 1073741824
MAX_FRONTEND_TOTAL = 268435456
GRACE_SECONDS = 86400
# Config-entry data key: a discovered app URL waiting for the first runtime setup (consumed, then removed).
DISCOVERY_HANDOFF = "discoveredUrl"
