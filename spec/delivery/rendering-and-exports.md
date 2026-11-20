# Rendering and exports

Updated: 2026-11-18.

Status: local PNG preview and final export are MVP Phase 1 and implemented. The optional backend photorealistic render is MVP Phase 2 ([D11](../decisions.md#d11-photorealistic-render-and-image-mode)) and implemented with Blender/Cycles; the engine is an implementation choice. HA scene packages and image layers are post-MVP ([publishing](../home-assistant/publishing.md)).

The editable house model is the common source for the browser preview, images, and optional mesh exports. See the [renderer boundary](../architecture/renderer.md).


## Baseline exports

Provide a quick preview/pre-render PNG and an explicit final PNG export from the selected camera. Final WebGL exports may use a larger render target and higher quality settings than the editing viewport; they must be identified as viewport-quality renders when no path tracer is used.

For MVP, each local render and optional geometry output represents one selected building floor. Record its stable floor ID with the camera and snapshot metadata. A house export may contain separate per-floor outputs, but never a stacked multi-floor render. Only the selected floor's geometry and artificial emitters contribute; house environment inputs remain shared.

Each export must record its scene revision, camera, image dimensions, render settings, renderer/version, and creation time in `metadata.json`. A queued render must use an immutable scene snapshot and the corresponding asset versions, even if editing continues. Preserve the preview and final outputs when both are requested.

Sunlight uses the shared house location, north orientation, and current or fixed simulation datetime defined in [house environment](../builder/features/house-environment.md). Resolve one effective simulation instant at export start and freeze it with the house environment for every image in the export set. Store that depicted instant separately from the export creation timestamp.

Exports show the model as built regardless of the editor's view toggles: walls are drawn even when Walls off is on, light fixtures even when the light controls are Off, and image textures even in the Room Editor's plain colours (Phases 4.5 and 5 follow-up, [floor builder](../builder/screens/floor-builder.md)).

Validate output dimensions against device/memory limits, load required assets before capture, and provide download and save-to-project behavior. Keep preview and final color management consistent and explicitly map output to an appropriate PNG color space. Resolution presets are 1×, 2×, and 4× of the viewport, capped by the GPU's maximum texture size ([D16](../decisions.md#d16-interaction-defaults-and-support-limits)). A transparent background is an export option.

## Main-view photorealistic render

Provide a **Render photorealistic image** action in the main active-floor toolbar. It is an optional capability, available from the main Top/3D floor overview when the backend renderer is configured. Do not add it to Room Editor or Object Editor for MVP. An unavailable renderer has a clear unavailable/setup status and leaves normal editing/PNG capture usable.

1. Resolve any active draft, then capture the current validated committed model, including unsaved committed edits. Freeze its source document revisions/local generation and asset versions; do not silently load an older on-disk floor as the job input.
2. Capture the full current camera: position/orientation/target as applicable, projection type, perspective field of view or orthographic bounds, aspect ratio/framing, and requested image dimensions. Preserve the visible composition rather than copying only camera coordinates or switching to a default perspective.
3. Freeze authored materials/textures, prepared shared walls (clipped by and risen to the floor's roof), openings, light enabled/brightness/color/output state, and the effective sun/environment instant. Render only the active floor with the usual open-top/no-ceilings rule. Exclude editing helpers.
4. Submit that immutable snapshot to a backend job. Validate input, supported features, assets, and output limits; return a job ID promptly. Run rendering outside the HTTP request lifecycle, with pending/running/completed/failed/canceled status and progress where available.
5. On completion, return image metadata plus a builder-local asset/download URL and display the PNG in a result panel/dialog with a clear return-to-editor action. The result is a static image, not a replacement editable scene. Download/save-to-project follows the baseline export policy.
6. Keep the result associated with its floor, camera, and snapshot. If editing/camera movement continues, show that the result depicts the earlier snapshot. A late completion must not overwrite the current editor or appear as a render of a different floor/house.

Use the typed render/export client and the existing job/asset-serving boundaries. Routes and job polling are defined in the [API specification](../architecture/api.md#exports-and-renders). No HA package, entity binding, image-layer combination, or dashboard URL is involved.

Validate the backend adapter against representative local materials/lighting and camera framing. Higher-quality rendering can produce different pixels from the interactive preview, but must preserve scene geometry, selected view, and authored lighting intent. Backend errors/missing assets/cancellation preserve the model and usable editor. Starting or completing a render is outside model Undo.

## Backend renderer implementation

| Candidate | Execution location | Evaluation |
| --- | --- | --- |
| Blender/Cycles controlled by Node | Separate backend process, optionally GPU accelerated | Candidate for offline final renders when quality or scene complexity exceeds the practical browser budget; requires an installed renderer and scene conversion |

The product choice is backend rendering. Select/evaluate its engine and pin an adapter-compatible release during implementation; browser path tracing is not the MVP execution path. Document supported materials/lights, camera conversion, hardware requirements, and initial quality/time limits before claiming the optional capability is available.

Blender's Cycles is a physically based path tracer, and Blender supports background command-line rendering. A Node backend can orchestrate that process; it is a separate installed renderer, not a pure Node rendering library. An adapter must map geometry, materials, lights, cameras, and color settings, with visual checks for differences from Three.js. [Cycles overview](https://www.blender.org/features/rendering/), [background rendering](https://docs.blender.org/manual/en/latest/advanced/command_line/render.html).

### Implemented adapter: Blender/Cycles

The backend implements one adapter behind a small `RendererAdapter` interface (`server/render/blenderAdapter.ts`): Blender runs in background mode, one process per job, with `server/render/render_scene.py`. Tested with Blender 4.0.2 on macOS (Apple M2 Pro).

- **Configuration:** `BLENDER_PATH` (default: `/Applications/Blender.app/Contents/MacOS/Blender`, then `blender` on `PATH`), `BLENDER_DEVICE` (`CPU` default, or `GPU`: Metal, OptiX, CUDA, HIP, or oneAPI, falling back to CPU), `BLENDER_SAMPLES` (default 64; a job may request 1–4096). `GET /api/capabilities` reports the detected version, or the reason it is unavailable.
- **Scene:** the browser exports the active floor as GLB with Three's `GLTFExporter`, so geometry, PBR materials, textures, and `KHR_lights_punctual` point and spot lights come through Blender's glTF importer (its default lighting conversion). Helpers, grid, and guides are left out by the client, as for PNG export.
- **Camera:** Three.js world meters (y up) convert to Blender (z up) as (x, y, z) → (x, −z, y), the importer's convention. 3D uses the vertical field of view; Top uses an orthographic camera whose height is `orthoHeightM`. Both use a vertical sensor fit, so framing matches the viewport at the snapshot's aspect.
- **Sun and sky:** a Blender sun lamp along `sunDirectionWorld` with strength `sunIntensity` (W/m²; Three's directional intensity is used directly) and a 0.53° disc; a Nishita sky (sun disc off, strength 0.35) for daylight; a dark background with no sun when the sun is below the horizon.
- **Output:** Cycles with adaptive sampling and OpenImageDenoise, AgX view transform, opaque PNG at the snapshot's size, stored as an ordinary export.
- **Not mapped yet:** linear lights as lines (each shadow-casting carrier is exported as a point light of its share; the preview's unshadowed fill is left out), Three-only material effects, and exposure matching with the WebGL preview. Since Phase 8.9 the preview also uses AgX, so the remaining colour differences come from the lighting, not the view transform.
- **Time and hardware:** on an M2 Pro CPU a 480 × 300 test room renders in about 4 s at 16 samples, most of it Blender start-up; the same room at 1280 × 800 and 64 samples takes about 9 s. Real floors with textures and many lights take longer; time grows with pixels × samples. GPU rendering needs a supported GPU and `BLENDER_DEVICE=GPU`. One job runs at a time.

PNG is the output format, not the source of photorealism. Quality depends on rendering, materials, lighting, and assets. Optional denoising or image post-processing follows rendering; it does not replace the scene renderer.

Execute long renders outside HTTP request handling and expose job progress, completion, cancellation, and errors. Persist job metadata in JSON; do not introduce a database-backed queue. Start with one worker and document recovery after interruption.

## Optional geometry export

STL export is a possible derived output, not a committed replacement house format. If offered, declare its unit convention and apply staircase openings and the roof's wall clipping to actual exported geometry. Visual clipping alone is insufficient. STL does not retain materials, textures, or semantic editing rules; preserve the source JSON separately.

## Verification

- Preview/final PNGs match the selected camera, dimensions, color policy, and scene snapshot.
- Every image in a render set shares the same effective environment instant and requested light state policy.
- Editing after a render starts cannot change that job's inputs or asset versions.
- Exports omit editor helpers under the selected helper policy and never add ceilings.
- Unavailable optional render capabilities leave basic editing and baseline PNG output usable.
- A main-view render preserves the selected Top/3D camera framing, current committed edits, and frozen light/environment state; the frontend presents the returned image for that snapshot.


Calibration (implementation convention, 2026-11-14): Cycles sun strength = 2 × the preview sun intensity, Nishita sky strength 0.15, plus a neutral ground plane just below the floor so the open-top house does not float over the below-horizon sky. Artificial lamps are exported in physical units (lm → W at 683 lm/W), so they are faint in daylight renders and dominant at night, as in reality.
