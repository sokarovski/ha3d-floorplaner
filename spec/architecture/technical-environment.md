# Technical environment

Updated: 2026-11-16.

Status: D13 is resolved. The stack and boundaries below are selected for MVP; package versions, concrete interfaces/schemas, and feature-specific geometry/offline-render engines are implementation work.

## Required constraints

- Use the latest stable React release when implementation begins, with strongly typed TypeScript components and the shared [design system](../design-system/README.md).
- Run the client-rendered SPA and Node.js filesystem backend as a standalone application, independent of Home Assistant. Add-on packaging and ingress are post-MVP.
- Use Three.js `WebGLRenderer` in a typed runtime mounted by React; keep serializable house data separate from live rendering objects.
- Use folders and JSON documents for persistence. No database, including embedded databases.
- Provide PNG preview/final outputs, plus the optional backend photorealistic render (Phase 2, [D11](../decisions.md#d11-photorealistic-render-and-image-mode)), without making ordinary editing depend on it.
- Apply the open-top rule consistently: no ceilings or room-spanning roof covers in the preview or exports (and in future cards).
- Keep global application preferences separate from house data; synchronize only explicitly selected browser values.
- Author canonical length values at **1 unit = 1 mm**, including fractions; groups hold relative child geometry and parent transforms. Floor shapes and walls are guides; RealFloor, RealWall, and RealAllWalls are derived from them. See [geometry groups](../builder/features/geometry-groups.md).

## Selected MVP stack

| Area | Selection | Status |
| --- | --- | --- |
| Frontend | React + TypeScript strict mode | React and typed component conventions required |
| Build | Vite | Selected |
| SPA routing | React Router Data Mode with explicit route modules | Selected; follow frontend route conventions |
| Shared client state | Zustand vanilla session stores with React selector hooks | Selected; local drafts remain React state |
| Resource access | Typed fetch transport/resource clients with explicit loading/save services | Selected; TanStack Query deferred |
| Styling | Tailwind with semantic tokens and data-attribute selectors in `.tw.css` | Selected |
| Interactive renderer | Three.js `WebGLRenderer` | Selected |
| React integration | Small React viewport host around a typed Three.js runtime | Selected; no React Three Fiber in MVP |
| Backend | Supported Node.js LTS + Fastify, strict TypeScript | Selected |
| Shared model | Typed document/command layer plus local geometry registry | Selected boundaries; concrete interfaces defined during implementation |
| Persistence | Versioned JSON and binary assets in house folders; one Git repository per house for revisions (isomorphic-git) | Implemented ([persistence](persistence.md)) |
| Schemas and validation | JSON Schema (draft 2020-12) per object type and form, authored with TypeBox, validated with Ajv in browser and server and by Fastify on routes; drives the property panel and popup forms | Selected ([D13](../decisions.md#d13-application-stack), [D18](../decisions.md#d18-property-schemas-and-the-property-panel)) |
| Accessible UI behavior | React Aria Components under the design system, styled by `.tw.css` data selectors | Selected |
| Tooling | npm + `package-lock.json`, ESLint (typescript-eslint, react-hooks, import boundaries), Prettier | Selected |
| Automated tests | None in the initial baseline; spec verification scenarios are checked manually | Deferred |
| Object assets | glTF 2.0 (GLB) templates with Homeplan metadata in `extras`; STL converted on import | Selected ([D17](../decisions.md#d17-object-asset-format-and-template-metadata)) |
| High-quality rendering | Optional backend render job from the main floor view, Blender/Cycles adapter | Implemented ([rendering and exports](../delivery/rendering-and-exports.md#implemented-adapter-blendercycles)) |
| HA viewer (exception) | Lit + Lit `css` + framework-free Three.js in `ha-viewer/`, reusing `shared/` and `src/renderer/` | [D23](../decisions.md#d23-ha-viewer-mvp); the React/Tailwind/React Aria rules do not apply there |

React/Vite and Node/Fastify are the selected client-rendered editor and filesystem-service stack under [D13](../decisions.md#d13-application-stack). Next.js is not an active MVP option; feature implementations follow this common stack.

## Rendering baseline

Normal rendering runs on the browser GPU. Three.js `WebGLRenderer` uses WebGL 2; detect unavailable support and show a compatibility message. Do not require WebGPU merely to open/edit a house. Specialized optional rendering can have its own capability check. [Three.js renderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html).

Use physically based materials, appropriate environment/lighting, shadows, and consistent color management. Those choices support realism but do not guarantee photorealistic results. Measure a representative scene on target hardware before committing frame-rate or scene-size targets.

A shared document and geometry core should drive the viewport, export adapters, and the Home Assistant display. Runtime meshes, cameras, GPU resources, pointer previews, and frame loops are not persisted house documents. See [renderer architecture](renderer.md).

## Dependency policy

Select compatible stable package releases at scaffolding time. Pin them with the committed `package-lock.json` (npm) and document the Node and npm versions. Dependencies are pinned to exact versions in `package.json`; `engines.node` is `>=20.19.0`. Notable runtime packages: React 19, React Router 8, Zustand 5, React Aria Components, Three.js, Fastify 5, TypeBox, Ajv, isomorphic-git, jsdiff, sharp (thumbnails), glTF Transform and the glTF Validator (template import), clipper2-ts (polygon union), SunCalc, and Lit (HA viewer only). Do not put floating `latest` dependencies in deployment.

Verify selected package compatibility without silently downgrading the required stable React release or adding alpha dependencies. A development branch is not proof of published-release compatibility. Avoid hard-coded “current latest” claims in this specification.

Primary references: [React versions](https://react.dev/versions), [Node.js releases](https://nodejs.org/en/about/previous-releases), [Vite](https://vite.dev/guide/), [Fastify](https://fastify.dev/docs/latest/).

## Owning specifications

- [Persistence](persistence.md): storage tree, stable IDs, validation, saves, concurrency, and recovery.
- [Frontend architecture](frontend-architecture.md): routes, source layout, utilities, domain rules, services, and repositories.
- [State and resource access](state-and-data.md): Zustand ownership, React subscriptions, HTTP clients, loading, and save acknowledgment.
- [Application preferences](application-preferences.md): global settings, browser state, and selective synchronization.
- [API](api.md): every backend route, error envelope, and revision rule.
- [Rendering and exports](../delivery/rendering-and-exports.md): snapshots, PNGs, and the optional backend render.
- [Deployment](../delivery/deployment.md): local/production hosting and storage.
- [Editing lifecycle](../builder/editing-lifecycle.md): commands, previews, cancellation, and save feedback.

Architecture validation should demonstrate save/reload, interrupted-save recovery, a representative geometry edit, resource cleanup, and local export/render-result presentation. Dashboard asset loading is post-MVP. Detailed acceptance scenarios live with each owning specification.
