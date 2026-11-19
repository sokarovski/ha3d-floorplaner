# Publishing, packages, and app deployment

Updated: 2026-11-19 (HA app packaging and discovery implemented).

Status: scene/image publishing remains post-MVP design context ([D10](../decisions.md#d10-publishing-and-package-lifetime), [D11](../decisions.md#d11-photorealistic-render-and-image-mode) image mode). The Home Assistant app packaging (container build, ingress, Supervisor discovery) is implemented ([implemented app](#implemented-app)), and the integration is distributed through Marketplace and a release ZIP ([distribution and builds](production-integration.md#distribution-and-builds)). These notes were moved here from [rendering and exports](../delivery/rendering-and-exports.md) and [deployment](../delivery/deployment.md) so that MVP delivery documents describe local builder outputs.

**Active panel exception:** the production viewer's [custom integration and local snapshot transfer](production-integration.md) is implemented. Its checksummed copy envelope, explicit Update and HA-owned settings are the panel contract. Richer scene/image packages remain deferred. App deployment and discovery are additions on top of that contract; the integration keeps working with a manually entered source URL.

## Scene-package contract

A live-3D export should include a versioned manifest, house/floor model snapshots, required template definitions/versions, referenced model/texture files, light capabilities/defaults, and the matching controllables manifest. A richer mesh interchange format such as glTF/GLB may be useful; it is not a replacement for semantic identities or the editable source documents.

Multiple floor snapshots can be packaged together for navigation while remaining independently rendered scenes. The consumer selects one floor at a time; packaging several documents does not require absolute building-floor elevations.

Do not let an export reference mutable authoring files by URL and claim it is an immutable snapshot. Freeze or copy the asset versions needed by the package. Include source document revisions and a package-format version so the card can reject unsupported data and report missing assets. Scene package layout, template portability, version negotiation, and copy/hash strategy remain [D10](../decisions.md#d10-publishing-and-package-lifetime).

## Layered-image mode

Before implementing image mode, select:

- Fixed camera/projection, dimensions, alpha/mask encoding, color space, and blending order.
- Whether supported states are finite on/off presets, brightness levels, temperature/color presets, or evaluated basis renders.
- How overlapping light contributions and indirect lighting compare with full reference renders.
- Aligned interaction polygons/masks, occlusion/priority rules, and responsive coordinate mapping.
- Update behavior when geometry, camera, templates, or state-target IDs change.

For `n` independent binary lights, exhaustive state rendering needs up to `2^n` combinations. Per-light overlays can reduce output count, but require a validated compositing model. Stacking complete illuminated room images can count common surfaces/background lighting more than once. PNG output alone does not settle the problem.

The first proof should compare no-light, each individual light, and overlapping-light combinations under one frozen environment. Set a visual acceptance threshold and define intentional approximations before promising arbitrary RGB or dimming. See [D11](../decisions.md#d11-photorealistic-render-and-image-mode).

## App packaging and ingress

**Owner requirements (2026-11-19), implemented:** one source repository holds the `custom_components/homeplan` integration sources and the HA app packaging. The Dockerfile and source are published and the Supervisor builds Homeplan locally (no prebuilt registry image); the base is Node on Alpine. House data is persistent and private to the installation, and the editor opens through ingress. The integration uses a discovered local app when available, through Supervisor discovery and its `hassio` config-flow entry, and manual source URL entry when it is not; existing manual settings, the selected house, HA configuration, and the local-snapshot fallback are preserved. Protocol/schema details of the shared-URL/DEV MODE contract are owned by [production integration](production-integration.md).

The app's architectures, persistent paths, backup inclusion, process startup/shutdown, base-URL handling, SPA routing and asset routes are specified below and in [deployment](../delivery/deployment.md#home-assistant-app). See [Home Assistant app development](https://contributors.home-assistant.io/apps/).

**Ingress (owner, 2026-11-19: the builder opens only in the HA sidebar).** The app's editor is served through [ingress](https://contributors.home-assistant.io/apps/guides/ingress/), whose prefix `/api/hassio_ingress/<token>/` is chosen per installation and stripped by the Supervisor before proxying. Implemented base-URL handling:

- The production build uses relative URLs (Vite `base: "./"`), and `index.html` carries a `<base href>`. The server serves `index.html` itself (never as a static file) and sets that tag per request: `X-Ingress-Path` (only the Supervisor's form `^/api/hassio_ingress/[A-Za-z0-9_-]+$`; anything else is ignored) followed by `HOMEPLAN_BASE_PATH`. One build therefore runs at `/`, under a configured base path, or behind ingress.
- The SPA reads its router basename and API base from `document.baseURI` (`src/app/runtimeConfig.ts`). Server-built URLs in API payloads (template `thumbnailUrl`) are relative to that base, and in-app links such as `agent.md` are relative.
- Integration-to-app traffic does not use ingress: it uses the app's internal hostname delivered by Supervisor discovery (spike-verified, 2026-11-19).

### Implemented app

The app's files sit at the root of the source repository, next to the source they build (the Supervisor accepts an app at the repository root and uses the whole repository as build context):

| File | Role |
| --- | --- |
| `repository.yaml` | App repository metadata (name, URL, maintainer); users add the repository URL under **Settings → Apps → Install app** |
| `config.yaml` | The app: slug `homeplan`, `version` equal to `package.json` `version` (one shared version for app, integration and site), `arch` `amd64` and `aarch64`, `ingress: true` on port `8099` with `ingress_stream` for uploads, sidebar panel **Homeplan** (`mdi:floor-plan`), `hassio_api` plus `discovery: [homeplan]`, hot backup. No `image` key (source build on the device) and no `ports` (sidebar only) |
| `Dockerfile` | Multi-stage build on a pinned `node:<version>-alpine<version>@sha256:…` base (Supervisor 2026.04+ passes no `BUILD_FROM`): `npm ci`, `npm run build`, `npm run build:ha-viewer`, `npm prune --omit=dev`; the runtime stage holds `server/`, `shared/`, the production `node_modules` and `dist/client`, `dist/ha-viewer`, `dist/ha-artifacts`, and runs `node --import tsx server/main.ts`. Blender is not included |
| `.dockerignore` | Keeps `.git`, data directories, `.env*`, `node_modules`, `dist`, specifications and the integration's generated files out of the build context |
| `DOCS.md` | User documentation shown on the app page |
| `icon.png`, `logo.png` | App store images, generated from `brand/ha3d-logo.svg`; the image build does not use them |

`npm run app:check` verifies the packaging: required files, `config.yaml` version equal to `package.json`, no `image`/`ports`, ingress and discovery settings, both architectures, a version-pinned `FROM` (never `latest`), the Dockerfile `PORT` equal to `ingress_port`, and the `.dockerignore` exclusions. The runtime environment, persistent `/data`, shutdown and the app-mode request guards are in [deployment](../delivery/deployment.md#home-assistant-app).

### Supervisor discovery payload

The app announces itself to the Supervisor with `POST http://supervisor/discovery` for service `homeplan` (the integration domain). The payload `config` is exactly:

```json
{ "host": "<hostname>", "port": 8099, "api": 1 }
```

- `host`: the app container's internal hostname from `GET http://supervisor/addons/self/info` (`data.hostname`), reachable from HA Core on the Supervisor network. It is not a browser URL.
- `port`: integer, the app's internal HTTP port (the ingress port, `8099`). The integration builds `http://<host>:<port>/` as the source URL for server-to-server calls.
- `api`: integer API compatibility version of the app's HTTP API; `1` today. The integration rejects a discovered app whose `api` it does not support and keeps the manual URL path.

The app (`server/services/supervisorDiscovery.ts`, started only when `SUPERVISOR_TOKEN` is set) announces on every start and again every 15 minutes. The Supervisor answers an identical announcement with the existing message and does not notify HA again, so each announcement withdraws the previous one (`DELETE http://supervisor/discovery/<uuid>`) and posts anew; at start it posts, withdraws what it got (possibly a message left by a crash) and posts again. HA therefore re-fires the `hassio` config flow when the integration was installed after the app. The integration must make this idempotent (a unique ID per app, aborting when already configured or in progress). Withdrawing briefly removes the pending discovery, so an open confirmation dialog can be aborted at the 15-minute refresh. On shutdown the app withdraws its announcement. If `GET /addons/self/info` fails, the container's own host name (the same DNS name) is used. Announcement failures are logged and never stop the server.

Editor access and dashboard asset delivery need separate designs. Do not treat a session-dependent editor ingress URL as a durable dashboard image/package URL. Choose authenticated serving or a deliberate copy/publish destination, then define local/remote access and URL lifetime. This is [D10](../decisions.md#d10-publishing-and-package-lifetime), not an implied permission to expose the data directory publicly.

