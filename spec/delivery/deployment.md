# Deployment and operating environment

Updated: 2026-11-19.

Status: the MVP runs the builder SPA and Node.js backend locally on the reference Mac ([D02](../decisions.md#d02-reference-setup-and-representative-house)) with persistent storage. Owner addition (2026-11-19): the same server also runs as a Home Assistant app ([below](#home-assistant-app)); [publishing and packaging](../home-assistant/publishing.md#app-packaging-and-ingress) owns the HA packaging and discovery design. The local setup below remains the default.

## Development and production

The first release runs the editing app for usability validation. Distribution packaging and HA integration follow only after that editor workflow proves easy to use, as specified in [D01](../decisions.md#d01-first-useful-release). Local development/build/run steps needed to use the app remain part of this first phase.

- Development: Node LTS, a selected package manager and lockfile, local frontend/API processes, and an isolated writable development data directory. With Vite, proxy API calls to the backend for a consistent browser origin. [Vite guide](https://vite.dev/guide/), [Fastify documentation](https://fastify.dev/docs/latest/).
- Production: serve the built SPA and API under one origin, with client route fallback to the SPA shell. API and asset routes must retain their own response/error handling.
- Provide persistent writable storage for the backend. A local process, container with a mounted volume, or persistent server can satisfy this model. Hosting that provides only ephemeral filesystems cannot be the durable project store.
- Keep production data independent of builds and deployments. Configure paths and server settings through environment variables; never place secrets in frontend build variables.
- Optional render environment: a configured backend renderer/worker (implemented with Blender/Cycles, [rendering and exports](rendering-and-exports.md#implemented-adapter-blendercycles)). Select CPU/GPU execution explicitly for the host; normal editing and basic PNG exports remain available without this capability. The main-view render action reports availability through the backend.

### Implemented setup

`npm run dev` starts the Fastify backend (watch mode, port 4310) and the Vite dev server (port 5173, proxying `<base>/api` to the backend) together. `npm run build` then `npm start` serves the built SPA from `dist/client/` and the API from one origin, with SPA fallback for client routes. Configuration (implementation conventions, also in the [project README](../../README.md#configuration)):

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATA_DIR` | `.homeplan-data` (relative to the working directory) | Storage root ([persistence](../architecture/persistence.md#storage-ownership)) |
| `PORT` | `4310` | Backend port |
| `HOST` | `localhost` | Backend bind address |
| `HOMEPLAN_BASE_PATH` | `/` | Base path for the SPA and API (normalized to a leading and trailing `/`). The production build is prefix-independent: the server writes the page's `<base href>` per request (this base path, preceded by Home Assistant's `X-Ingress-Path` when present); see [app packaging and ingress](../home-assistant/publishing.md#app-packaging-and-ingress) |
| `CLIENT_PORT` | `5173` | Vite dev server port |
| `HOMEPLAN_HA_ORIGINS` | none | Comma-separated Home Assistant origins allowed by the dev server's CORS, for the [HA viewer](../home-assistant/viewer-mvp.md#dev-server), for example `http://homeassistant.local:8123`. Set it in the shell or in an untracked `.env.local` (template: [`.env.example`](../../.env.example)); nothing machine-specific is committed |
| `HOMEPLAN_ALLOWED_HOSTS` | none | Comma-separated extra host names the backend accepts in the `Host` header ([request guards](#request-guards)); `*` accepts any |
| `HOMEPLAN_SEED_DEMOS` | on | `0` or `false` turns off seeding the three demo houses into a data directory that has never held a house ([demo houses](../architecture/persistence.md#demo-houses)) |
| `BLENDER_PATH`, `BLENDER_DEVICE`, `BLENDER_SAMPLES` | auto, `CPU`, `64` | Photorealistic render backend |

Build outputs (`dist/client`, `dist/ha-viewer`, `dist/ha-artifacts`) are resolved from the repository root (`server/runtimePaths.ts`), not the working directory. In production the server logs a warning when `dist/client/index.html` is missing and serves only the API. `SIGTERM`/`SIGINT` close the server gracefully (in-flight requests finish, the discovery announcement is withdrawn; forced exit after 10 s).

### Home Assistant app

The root `Dockerfile` builds the production image ([implemented app](../home-assistant/publishing.md#implemented-app)); the Supervisor builds it on the device. Runtime conventions:

| Setting | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATA_DIR` | `/data`, the app's persistent private folder: houses, per-house Git history, images, templates, preferences. Kept across updates and included in HA backups (hot backup; writes are atomic) |
| `HOST` / `PORT` | `0.0.0.0` / `8099`, the ingress port. No host port is mapped: browsers reach the builder only through HA ingress (HA sidebar), and HA Core reaches it at the app's internal host name |
| `SUPERVISOR_TOKEN` | Set by the Supervisor. Its presence turns on app mode: the Supervisor-network [request guards](#request-guards) and the [discovery announcement](../home-assistant/publishing.md#supervisor-discovery-payload) |
| `HOMEPLAN_SEED_DEMOS` | Unset (on): the first start creates the three demo houses |
| Process | `node --import tsx server/main.ts` under Docker's init (`init: true`), which forwards `SIGTERM` on app stop |

Blender is not in the image, so photorealistic rendering reports itself unavailable. The same image runs outside HA with plain Docker (`docker run -p 8099:8099 -v homeplan-data:/data <image>`); without `SUPERVISOR_TOKEN` it uses the normal guards.

## Ownership and access

There are no users or accounts ([D12](../decisions.md#d12-user-identity-and-access)). The MVP backend binds to `localhost` by default; exposing it on a network is an explicit configuration choice. Exception for the HA viewer ([D23](../decisions.md#d23-ha-viewer-mvp)): the Vite **dev server** listens on the LAN (`server.host: true`) so Home Assistant's browser can load `ha-viewer/main.ts` and reach the `/api` proxy; the backend itself still binds to `HOST`. Because Vite serves files under the project root, the dev server refuses the data directory (`.homeplan-data/`) and any local `execution` notes folder besides its default `.env*`, certificate and `.git` rules (`server.fs.deny`).

### Request guards

With no accounts, the API trusts whoever reaches it, so the backend (`server/http/requestGuards.ts`, on every `/api/` route) keeps other sites from reaching it through the user's browser. Implementation conventions:

- **Host (DNS rebinding):** the `Host` name (port ignored) must be `localhost` or `*.localhost`, an IP literal (`127.0.0.1`, `[::1]`, a LAN address), this machine's host name or `<name>.local`, the configured `HOST`, or a name in `HOMEPLAN_ALLOWED_HOSTS`; otherwise `400 badRequest`. A rebinding attack needs a domain name the attacker controls, which none of these are. The Vite dev proxy keeps the browser's `Host` (no `changeOrigin`), so `localhost:5173` and the LAN address or `.local` name the HA viewer uses pass. The check is **off** when `HOMEPLAN_ALLOWED_HOSTS=*`, and when `HOST` is `0.0.0.0`/`::` and `HOMEPLAN_ALLOWED_HOSTS` is not set: a server listening on every interface (for example a container reached under host names not known in advance) must stay reachable; setting `HOMEPLAN_ALLOWED_HOSTS` turns the check back on for such a server. The server logs a warning when the check is off.
- **Origin (cross-site writes):** a request other than `GET`/`HEAD`/`OPTIONS` that carries an `Origin` header must come from the `Host`'s own origin or from an origin in `HOMEPLAN_HA_ORIGINS` (the HA dev viewer calls `/api` from Home Assistant's origin through the Vite proxy); otherwise `400 badRequest`. Requests without `Origin` (curl, the HA integration's server-side client) are not affected. In development the backend reads `HOMEPLAN_HA_ORIGINS` from the shell or, like Vite, from `.env.local`; in production only from the environment.
- **Home Assistant app mode** (`SUPERVISOR_TOKEN` set): the Host and Origin checks above are replaced. Ingress rewrites `Host` and the browser's `Origin` is Home Assistant's, so they cannot be compared. Instead every `/api/` request must come from the Supervisor network `172.30.32.0/24` (HA Core's traffic arrives from the bridge gateway `172.30.32.1`, the Supervisor's ingress proxy is `172.30.32.2`) or loopback; other apps (`172.30.33.0/24`) and anything else get `400 badRequest`. The peer is the TCP socket address (no proxy headers are trusted). HA's authenticated ingress session is the browser boundary; a non-`GET`/`HEAD`/`OPTIONS` request that the browser marks `Sec-Fetch-Site: cross-site` is still refused.

## Operational acceptance

- A rebuild/redeploy preserves house data, assets, and application preferences.
- Backup/restore recovers complete houses, templates, and referenced assets.
- The SPA, API, and asset routes work both in development and under a configured base path.
- Backend shutdown/interruption leaves recoverable data and a documented state for any render job.
- Optional rendering runs only on explicitly configured hardware; ordinary editing does not depend on it.

Performance budgets are measured on the reference setup ([D02](../decisions.md#d02-reference-setup-and-representative-house)).

### Measured baselines and provisional budgets (milestone 1.17)

Measured on 2026-11-14 on an Apple M2 Pro Mac with Chrome (headless, Metal), using `npm run seed:demo` (3 rooms, 12 walls, 2 openings) and `npm run seed:stress` (20 rooms, 80 walls, 40 openings, 20 objects, 20 carpets, 20 pendant fixtures). Warm runs:

| Measure | Demo house | 20-room house | Provisional budget |
| --- | --- | --- | --- |
| Load to first rendered view | 1.4 s | 1.7 s | ≤ 4 s |
| Frame rate while orbiting in 3D | 60 fps | 60 fps | ≥ 45 fps |
| Edit latency (property commit to visible update) | 12 ms | 21 ms | ≤ 100 ms |
| JS heap after load | 79 MB | 113 MB | ≤ 400 MB |
| PNG export at 2× | 0.33 s | 0.35 s | ≤ 3 s |
| Photorealistic render 1280 × 800, 64 samples (CPU) | 9 s | — | informational |

The budgets are provisional until the representative house is drawn completely on the reference setup with a visible browser and trackpad; re-measure then and replace this table. Cold first loads were about twice as slow (template downloads and shader compilation).
