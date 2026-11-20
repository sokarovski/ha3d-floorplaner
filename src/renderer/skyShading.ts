// Sky light indoors in the shared PBR materials (Phase 15.5, owner decision 2026-11-18: "make sun patches real";
// rules in skyLight.ts; spec/builder/features/lighting.md#sky-light-through-windows-phase-155). Framework-free: the
// builder viewport and the HA viewer each own one and call `beforeRender()` before every render.
//
// One material patch ("sky", materialPatches.ts; it sorts after "hpstrip" and "hpcut", see `sunGainBegin`) on every MeshStandardMaterial/MeshPhysicalMaterial under the
// content root (the plan root: floors, walls, instances; not the HA stage or helpers):
// - Indoor mask (vertex shader): a top-down RGBA8 texture of the active floor's indoor rooms (rooms under a shown
//   shadow-only ceiling, floorScene.ts), R = room, G·256 + B = ceiling height (mm). Each vertex is moved
//   `offset` along its normal and looked up (nearest texel) in the floor frame; it is indoor when it falls in a
//   room below its ceiling. A flat varying carries the result, so a triangle is wholly in or out. The normal
//   offset puts a wall's room-side face indoors and its outer face and top outdoors; the rooms are dilated by
//   `dilate` into outdoor texels, so floor vertices lying exactly on a room's outline count as indoor. Sampled
//   in the vertex stage, so the mask takes no fragment texture unit (the fragment budget belongs to the shadow
//   maps, lightsLayer.ts `shadowBudget`).
// - Indoor fill (fragment, before `lights_fragment_end`): indoors, the indirect diffuse (hemisphere, ambient,
//   image-based irradiance) and the scene-environment reflections are multiplied by `indoorFill(daylight)`
//   (skyLight.ts): 1 at night, the bounce floor in full daylight. Materials with their own environment map
//   (mirrors) keep their reflection.
// - Indoor sun (fragment, in `lights_fragment_begin`): the directional lights (the sun) on indoor fragments are
//   multiplied by `indoorSunGain(daylight)` (skyLight.ts), so sun patches indoors are brighter than before.
// - Sky portals (fragment, after `lights_fragment_begin`): `HP_PORTALS` slots (portal count rounded up to 4, 8
//   or 16) of one-sided rectangles at each exterior opening's glass, facing into its room, evaluated with the
//   strip term's form factor and glossy highlight (rectLightShading.ts). A portal lights only indoor fragments
//   inside its room's box (the room outline's bounds + 20 mm, floor to ceiling), so it never reaches the next
//   room through a wall or the outside. Sun, daylight and blind changes only write uniforms; the slot count
//   changes only with the number of portals (a recompile once).
import type { Material, Object3D } from "three";
import {
  DataTexture,
  Matrix4,
  MeshStandardMaterial,
  NearestFilter,
  ShaderChunk,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
  Vector4,
} from "three";
import type { Region } from "@shared/geometry/region";
import { pointInRegion, regionBounds, regionRings } from "@shared/geometry/region";
import type { IndoorRooms } from "./floorTypes";
import type { SkyOpenings } from "./skyTypes";
import type { Lighting } from "./lighting";
import { setMaterialPatch } from "./materialPatches";
import type { MaterialPatch } from "./materialPatches";
import { commonAnchor, physicalParsAnchor, rectFormFactorGlsl, rectSpecularGlsl } from "./rectLightShading";
import { isMesh } from "./sceneObjects";
import { blendedBlindFactor, indoorFill, indoorSunGain, portalRadiance } from "./skyLight";

/** Most portals a floor evaluates (document order); further openings add no sky light. */
export const portalSlotCapacity = 16;
/** Mask texel (mm) and largest side (texels): 20 mm up to a 20 m floor, coarser beyond. */
const maskTexelMm = 20;
const maskMaxSide = 1024;
/** Rooms grow this far (mm, rounded up to texels) into outdoor texels: outline vertices count as indoor. */
const maskDilateMm = 30;
/** Margin of the mask around the rooms (mm). */
const maskPadMm = 200;
/** A portal's room box reaches this far past the room's outline (mm): its own wall faces, never a neighbour's. */
const roomBoxMarginMm = 20;
/** An opening is exterior when this point beyond its glass (mm, outward) is in no indoor room. */
const exteriorProbeMm = 400;

export type SkyShadingSources = Readonly<{
  /** The floor frame (mm): the floor scene's root. */
  frame: Object3D;
  /** Materials under this root get the patch (the plan root). */
  content: Object3D;
  rooms: () => IndoorRooms;
  openings: () => SkyOpenings;
  lighting: Lighting;
}>;

export type SkyShading = Readonly<{
  /** Before every render: rebuilds the mask and portals when the rooms or openings changed, writes uniforms. */
  beforeRender: () => void;
  /** Portals in use and slots compiled (diagnostics). */
  portals: () => Readonly<{ count: number; slots: number }>;
  /**
   * Runs `run` with the patch compiling for `count` portal slots (0, 4, 8 or 16), for a host precompiling another
   * view's programs (a compile reads the key and the source at once); the slots are restored afterwards.
   */
  withSlots: (count: number, run: () => void) => void;
  dispose: () => void;
}>;

const slotsFor = (count: number): number =>
  count === 0 ? 0 : count <= 4 ? 4 : count <= 8 ? 8 : portalSlotCapacity;

const vertexDeclarations = /* glsl */ `
uniform sampler2D hpIndoorMap;
uniform mat4 hpIndoorFrame; // world → (u, v, height mm above the floor)
uniform float hpIndoorOffset; // world units along the normal
flat varying float hpIndoor;
`;

const vertexAnchor = "#include <worldpos_vertex>";
const vertexShading = /* glsl */ `
{
  vec4 hpWorld = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
  hpWorld = batchingMatrix * hpWorld;
  #endif
  #ifdef USE_INSTANCING
  hpWorld = instanceMatrix * hpWorld;
  #endif
  hpWorld = modelMatrix * hpWorld;
  vec3 hpWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
  vec3 hpMask = ( hpIndoorFrame * vec4( hpWorld.xyz + hpWorldNormal * hpIndoorOffset, 1.0 ) ).xyz;
  hpIndoor = 0.0;
  if ( hpMask.x > 0.0 && hpMask.x < 1.0 && hpMask.y > 0.0 && hpMask.y < 1.0 ) {
    vec4 hpTexel = textureLod( hpIndoorMap, hpMask.xy, 0.0 );
    float hpCeiling = hpTexel.g * 65280.0 + hpTexel.b * 255.0;
    if ( hpTexel.r > 0.0 && hpMask.z <= hpCeiling + 1.0 && hpMask.z > - 100.0 ) hpIndoor = 1.0;
  }
}
`;

const fragmentDeclarations = (slots: number): string => /* glsl */ `
#define HP_PORTALS ${String(slots)}
flat varying float hpIndoor;
uniform float hpIndoorFill;
uniform float hpIndoorSunGain;
#if HP_PORTALS > 0
uniform vec4 hpPortalCenter[ HP_PORTALS ]; // centre (world)
uniform vec4 hpPortalAlong[ HP_PORTALS ]; // half width vector
uniform vec4 hpPortalAcross[ HP_PORTALS ]; // half height vector (cross(across, along) = into the room)
uniform vec4 hpPortalColor[ HP_PORTALS ]; // linear radiance
uniform vec4 hpPortalBoxMin[ HP_PORTALS ]; // the room's box (world)
uniform vec4 hpPortalBoxMax[ HP_PORTALS ];
#endif
`;

const portalAnchor = "#include <lights_fragment_begin>";
/**
 * Three.js's lights_fragment_begin with the indoor sun gain applied to the directional lights (the sun) before
 * they are added; null if a Three.js upgrade changed the chunk (the sun is then left as is). It replaces the
 * include line, so this patch runs after every patch anchoring there (its name "sky" sorts after them).
 */
const sunGainBegin = ((): string | null => {
  const chunk = ShaderChunk.lights_fragment_begin;
  const block = chunk.indexOf("#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )");
  const call = block < 0 ? -1 : chunk.indexOf("RE_Direct( directLight,", block);
  if (call < 0) return null;
  return `float hpSunGain = hpIndoor > 0.5 ? hpIndoorSunGain : 1.0;\n${chunk.slice(0, call)}directLight.color *= hpSunGain;\n\t\t${chunk.slice(call)}`;
})();
const portalShading = /* glsl */ `
#if HP_PORTALS > 0
if ( hpIndoor > 0.5 ) {
  vec3 hpWorldPosition = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
  for ( int hpJ = 0; hpJ < HP_PORTALS; hpJ ++ ) {
    vec3 hpPColor = hpPortalColor[ hpJ ].rgb;
    if ( max( hpPColor.r, max( hpPColor.g, hpPColor.b ) ) <= 0.0 ) continue;
    if ( any( lessThan( hpWorldPosition, hpPortalBoxMin[ hpJ ].xyz ) ) || any( greaterThan( hpWorldPosition, hpPortalBoxMax[ hpJ ].xyz ) ) ) continue;
    vec3 hpPCenter = ( viewMatrix * vec4( hpPortalCenter[ hpJ ].xyz, 1.0 ) ).xyz;
    vec3 hpPAlong = mat3( viewMatrix ) * hpPortalAlong[ hpJ ].xyz;
    vec3 hpPAcross = mat3( viewMatrix ) * hpPortalAcross[ hpJ ].xyz;
    float hpPForm = hpRectFormFactor( geometryNormal, geometryPosition,
      hpPCenter + hpPAlong - hpPAcross, hpPCenter - hpPAlong - hpPAcross, hpPCenter - hpPAlong + hpPAcross, hpPCenter + hpPAlong + hpPAcross );
    if ( hpPForm <= 0.0 ) continue;
    reflectedLight.directDiffuse += hpPColor * material.diffuseContribution * hpPForm;
    reflectedLight.directSpecular += hpPColor * ( PI * hpPForm ) *
      hpRectSpecular( geometryNormal, geometryViewDir, geometryPosition, hpPCenter, hpPAlong, hpPAcross, material );
  }
}
#endif
`;

const fillAnchor = "#include <lights_fragment_end>";
const fillShading = (reflections: boolean): string => /* glsl */ `
{
  float hpFill = hpIndoor > 0.5 ? hpIndoorFill : 1.0;
  #if defined( RE_IndirectDiffuse )
  irradiance *= hpFill;
  iblIrradiance *= hpFill;
  #endif
  ${
    reflections
      ? `#if defined( RE_IndirectSpecular )
  radiance *= hpFill;
  clearcoatRadiance *= hpFill;
  #endif`
      : ""
  }
}
`;

/** One portal as built from an opening (floor frame for the tests, root-local for the rectangle). */
type Portal = Readonly<{
  root: Object3D;
  /** Rectangle in the root's contact frame (metres): centre, half width (x), half height (y). */
  center: Vector3;
  halfWidth: number;
  halfHeight: number;
  /** Room box in the floor frame (mm). */
  boxMin: Vector3;
  boxMax: Vector3;
  transmission: number;
  glassShare: number;
  blind: number;
}>;

/** Fills every texel whose centre lies inside `region` (even-odd over its rings) with `value`. */
const rasterize = (
  data: Uint8Array,
  width: number,
  height: number,
  origin: Readonly<{ x: number; y: number }>,
  texel: number,
  region: Region,
  value: readonly [number, number, number],
): void => {
  const rings = regionRings(region);
  for (let row = 0; row < height; row += 1) {
    const y = origin.y + (row + 0.5) * texel;
    const crossings: number[] = [];
    for (const ring of rings)
      for (let index = 0; index < ring.length; index += 1) {
        const a = ring[index];
        const b = ring[(index + 1) % ring.length];
        if (a === undefined || b === undefined) continue;
        if (a.y > y === b.y > y) continue;
        crossings.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    crossings.sort((p, q) => p - q);
    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const from = Math.max(0, Math.ceil(((crossings[pair] ?? 0) - origin.x) / texel - 0.5));
      const to = Math.min(width - 1, Math.floor(((crossings[pair + 1] ?? 0) - origin.x) / texel - 0.5));
      for (let column = from; column <= to; column += 1) {
        const at = (row * width + column) * 4;
        data[at] = value[0];
        data[at + 1] = value[1];
        data[at + 2] = value[2];
        data[at + 3] = 255;
      }
    }
  }
};

/** Grows filled texels into empty ones by one texel (8-neighbourhood), `steps` times. */
const dilate = (data: Uint8Array, width: number, height: number, steps: number): void => {
  for (let step = 0; step < steps; step += 1) {
    const source = data.slice();
    for (let row = 0; row < height; row += 1)
      for (let column = 0; column < width; column += 1) {
        const at = (row * width + column) * 4;
        if ((source[at] ?? 0) > 0) continue;
        let best = -1;
        let bestCeiling = -1;
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dx = -1; dx <= 1; dx += 1) {
            const r = row + dy;
            const c = column + dx;
            if (r < 0 || r >= height || c < 0 || c >= width) continue;
            const near = (r * width + c) * 4;
            if ((source[near] ?? 0) === 0) continue;
            const ceiling = (source[near + 1] ?? 0) * 256 + (source[near + 2] ?? 0);
            if (ceiling > bestCeiling) {
              bestCeiling = ceiling;
              best = near;
            }
          }
        if (best < 0) continue;
        for (let k = 0; k < 4; k += 1) data[at + k] = source[best + k] ?? 0;
      }
  }
};

/** The indoor mask of `rooms` (floor frame, mm); null without rooms. */
export type IndoorMask = Readonly<{
  data: Uint8Array;
  width: number;
  height: number;
  origin: Readonly<{ x: number; y: number }>;
  texelMm: number;
  /** How far a vertex is moved along its normal before the lookup. */
  offsetMm: number;
}>;

export const indoorMask = (rooms: IndoorRooms["rooms"]): IndoorMask | null => {
  if (rooms.length === 0) return null;
  const bounds = regionBounds({ polygons: rooms.flatMap((room) => room.outline.polygons) });
  const extent = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) + 2 * maskPadMm;
  const texel = Math.max(maskTexelMm, extent / maskMaxSide);
  const origin = { x: bounds.minX - maskPadMm, y: bounds.minY - maskPadMm };
  const width = Math.max(1, Math.ceil((bounds.maxX - bounds.minX + 2 * maskPadMm) / texel));
  const height = Math.max(1, Math.ceil((bounds.maxY - bounds.minY + 2 * maskPadMm) / texel));
  const data = new Uint8Array(width * height * 4);
  rooms.slice(0, 255).forEach((room, index) => {
    const ceiling = Math.min(65535, Math.max(0, Math.round(room.ceilingMm)));
    rasterize(data, width, height, origin, texel, room.outline, [index + 1, ceiling >> 8, ceiling & 255]);
  });
  const steps = Math.ceil(maskDilateMm / texel);
  dilate(data, width, height, steps);
  // Beyond the dilation plus a texel's rounding, with a margin: a wall's outer face on an outline is outdoor.
  return { data, width, height, origin, texelMm: texel, offsetMm: steps * texel + texel + 20 };
};

/** CPU mirror of the vertex shader's lookup: a point (floor frame, mm) with its unit normal. */
export const maskIndoor = (
  mask: IndoorMask,
  point: Readonly<{ x: number; y: number; z: number }>,
  normal: Readonly<{ x: number; y: number; z: number }>,
): boolean => {
  const x = point.x + normal.x * mask.offsetMm;
  const y = point.y + normal.y * mask.offsetMm;
  const z = point.z + normal.z * mask.offsetMm;
  const u = (x - mask.origin.x) / (mask.width * mask.texelMm);
  const v = (y - mask.origin.y) / (mask.height * mask.texelMm);
  if (!(u > 0 && u < 1 && v > 0 && v < 1)) return false;
  const column = Math.min(mask.width - 1, Math.floor(u * mask.width));
  const row = Math.min(mask.height - 1, Math.floor(v * mask.height));
  const at = (row * mask.width + column) * 4;
  const ceiling = (mask.data[at + 1] ?? 0) * 256 + (mask.data[at + 2] ?? 0);
  return (mask.data[at] ?? 0) > 0 && z <= ceiling + 1 && z > -100;
};

const emptyMask = (): DataTexture => {
  const texture = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat, UnsignedByteType);
  texture.needsUpdate = true;
  return texture;
};

export const createSkyShading = (sources: SkyShadingSources): SkyShading => {
  const slotArray = (): Vector4[] => Array.from({ length: portalSlotCapacity }, () => new Vector4());
  const uniforms = {
    hpIndoorMap: { value: emptyMask() },
    hpIndoorFrame: { value: new Matrix4() },
    hpIndoorOffset: { value: 0 },
    hpIndoorFill: { value: 1 },
    hpIndoorSunGain: { value: 1 },
    hpPortalCenter: { value: slotArray() },
    hpPortalAlong: { value: slotArray() },
    hpPortalAcross: { value: slotArray() },
    hpPortalColor: { value: slotArray() },
    hpPortalBoxMin: { value: slotArray() },
    hpPortalBoxMax: { value: slotArray() },
  };
  /** Floor frame (mm) → mask (u, v, h), and the mask offset along normals (mm). */
  let maskFromFloor = new Matrix4();
  let offsetMm = 0;
  let roomsVersion = -1;
  let openingsVersion = -1;
  let portals: Portal[] = [];
  let slots = 0;
  const compiledFor = new WeakMap<Material, number>();

  const patchOf = (material: MeshStandardMaterial): MaterialPatch => {
    // Mirrors (their own environment map) keep their reflection; scene-environment reflections are scaled.
    const reflections = material.envMap === null;
    return {
      key: () => `${String(slots)}${reflections ? "r" : ""}`,
      apply: (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace(commonAnchor, `${commonAnchor}\n${vertexDeclarations}`)
          .replace(vertexAnchor, `${vertexAnchor}\n${vertexShading}`);
        shader.fragmentShader = shader.fragmentShader
          .replace(commonAnchor, `${commonAnchor}\n${fragmentDeclarations(slots)}\n${rectFormFactorGlsl}`)
          .replace(physicalParsAnchor, `${physicalParsAnchor}\n${rectSpecularGlsl}`)
          .replace(portalAnchor, `${sunGainBegin ?? portalAnchor}\n${portalShading}`)
          .replace(fillAnchor, `${fillShading(reflections)}\n${fillAnchor}`);
      },
    };
  };

  const patchMaterials = (): void => {
    sources.content.traverse((object) => {
      if (!isMesh(object)) return;
      const materials: Material | Material[] = object.material;
      for (const material of Array.isArray(materials) ? materials : [materials]) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        const compiled = compiledFor.get(material);
        if (compiled === slots) continue;
        if (compiled === undefined) setMaterialPatch(material, "sky", patchOf(material));
        else material.needsUpdate = true;
        compiledFor.set(material, slots);
      }
    });
  };

  const rebuildMask = (rooms: IndoorRooms["rooms"]): void => {
    uniforms.hpIndoorMap.value.dispose();
    const mask = indoorMask(rooms);
    if (mask === null) {
      uniforms.hpIndoorMap.value = emptyMask();
      maskFromFloor = new Matrix4();
      offsetMm = 0;
      return;
    }
    const texture = new DataTexture(mask.data, mask.width, mask.height, RGBAFormat, UnsignedByteType);
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    uniforms.hpIndoorMap.value = texture;
    const sizeX = mask.width * mask.texelMm;
    const sizeY = mask.height * mask.texelMm;
    // u = (x − x0) / size, v likewise, h unchanged.
    maskFromFloor = new Matrix4().set(
      1 / sizeX,
      0,
      0,
      -mask.origin.x / sizeX,
      0,
      1 / sizeY,
      0,
      -mask.origin.y / sizeY,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    );
    offsetMm = mask.offsetMm;
  };

  const rebuildPortals = (rooms: IndoorRooms["rooms"], openings: SkyOpenings["openings"]): void => {
    portals = [];
    const roomByArea = new Map(rooms.map((room) => [room.areaId, room]));
    const floorFromWorld = new Matrix4().copy(sources.frame.matrixWorld).invert();
    const indoorAt = (point: Vector3): boolean =>
      rooms.some(
        (room) =>
          point.z <= room.ceilingMm &&
          point.z > -100 &&
          pointInRegion({ x: point.x, y: point.y }, room.outline),
      );
    for (const opening of openings) {
      if (portals.length >= portalSlotCapacity) break;
      const room = roomByArea.get(opening.areaId);
      if (room === undefined) continue;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let midZ = 0;
      let glassArea = 0;
      let transmitted = 0;
      for (const pane of opening.panes) {
        minX = Math.min(minX, pane.min[0]);
        maxX = Math.max(maxX, pane.max[0]);
        minY = Math.min(minY, pane.min[1]);
        maxY = Math.max(maxY, pane.max[1]);
        const area = (pane.max[0] - pane.min[0]) * (pane.max[1] - pane.min[1]);
        midZ += ((pane.min[2] + pane.max[2]) / 2) * area;
        glassArea += area;
        transmitted += pane.transmission * area;
      }
      const rectArea = (maxX - minX) * (maxY - minY);
      if (!(rectArea > 0) || !(glassArea > 0)) continue;
      const center = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, midZ / glassArea);
      opening.root.updateWorldMatrix(true, false);
      const toFloor = new Matrix4().multiplyMatrices(floorFromWorld, opening.root.matrixWorld);
      // Interior glazing (another room behind it) is not a sky portal.
      const outside = new Vector3(center.x, center.y, center.z - exteriorProbeMm / 1000).applyMatrix4(
        toFloor,
      );
      if (indoorAt(outside)) continue;
      const box = regionBounds(room.outline);
      portals.push({
        root: opening.root,
        center,
        halfWidth: (maxX - minX) / 2,
        halfHeight: (maxY - minY) / 2,
        boxMin: new Vector3(box.minX - roomBoxMarginMm, box.minY - roomBoxMarginMm, -100),
        boxMax: new Vector3(box.maxX + roomBoxMarginMm, box.maxY + roomBoxMarginMm, room.ceilingMm + 20),
        transmission: transmitted / glassArea,
        glassShare: Math.min(1, glassArea / rectArea),
        blind: blendedBlindFactor(opening.parameterSets),
      });
    }
    slots = slotsFor(portals.length);
  };

  const p = new Vector3();
  const q = new Vector3();
  const writeUniforms = (): void => {
    const frameWorld = sources.frame.matrixWorld;
    uniforms.hpIndoorFrame.value.multiplyMatrices(maskFromFloor, new Matrix4().copy(frameWorld).invert());
    const worldPerMm = frameWorld.getMaxScaleOnAxis();
    uniforms.hpIndoorOffset.value = offsetMm * worldPerMm;
    const { lighting } = sources;
    const daylight = lighting.daylight();
    uniforms.hpIndoorFill.value = indoorFill(daylight);
    uniforms.hpIndoorSunGain.value = indoorSunGain(daylight);
    const gain = 1 / lighting.exposure();
    const [sx, sy, sz] = lighting.sunState().directionWorld;
    const sun = new Vector3(sx, sy, sz);
    if (sun.lengthSq() > 0) sun.normalize();
    portals.forEach((portal, index) => {
      const center = uniforms.hpPortalCenter.value[index];
      const along = uniforms.hpPortalAlong.value[index];
      const across = uniforms.hpPortalAcross.value[index];
      const color = uniforms.hpPortalColor.value[index];
      const boxMin = uniforms.hpPortalBoxMin.value[index];
      const boxMax = uniforms.hpPortalBoxMax.value[index];
      if (
        center === undefined ||
        along === undefined ||
        across === undefined ||
        color === undefined ||
        boxMin === undefined ||
        boxMax === undefined
      )
        return;
      portal.root.updateWorldMatrix(true, false);
      const matrix = portal.root.matrixWorld;
      const worldCenter = portal.center.clone().applyMatrix4(matrix);
      const halfAlong = p.set(portal.center.x + portal.halfWidth, portal.center.y, portal.center.z);
      halfAlong.applyMatrix4(matrix).sub(worldCenter);
      const halfAcross = q.set(portal.center.x, portal.center.y + portal.halfHeight, portal.center.z);
      halfAcross.applyMatrix4(matrix).sub(worldCenter);
      const inward = new Vector3(0, 0, 1).transformDirection(matrix);
      // cross(across, along) must point into the room.
      if (new Vector3().crossVectors(halfAcross, halfAlong).dot(inward) < 0) halfAcross.negate();
      center.set(worldCenter.x, worldCenter.y, worldCenter.z, 0);
      along.set(halfAlong.x, halfAlong.y, halfAlong.z, 0);
      across.set(halfAcross.x, halfAcross.y, halfAcross.z, 0);
      // s: the horizontal outward normal (world y is up) · the unit direction toward the sun.
      const outward = new Vector3(-inward.x, 0, -inward.z);
      const sunSide = outward.lengthSq() > 0 ? outward.normalize().dot(sun) : 0;
      const [r, g, b] = portalRadiance({
        sunSide,
        daylight,
        gain,
        transmission: portal.transmission,
        blind: portal.blind,
        glassShare: portal.glassShare,
      });
      color.set(r, g, b, 0);
      const lo = new Vector3(Infinity, Infinity, Infinity);
      const hi = new Vector3(-Infinity, -Infinity, -Infinity);
      for (let corner = 0; corner < 8; corner += 1) {
        const point = new Vector3(
          corner & 1 ? portal.boxMax.x : portal.boxMin.x,
          corner & 2 ? portal.boxMax.y : portal.boxMin.y,
          corner & 4 ? portal.boxMax.z : portal.boxMin.z,
        ).applyMatrix4(frameWorld);
        lo.min(point);
        hi.max(point);
      }
      boxMin.set(lo.x, lo.y, lo.z, 0);
      boxMax.set(hi.x, hi.y, hi.z, 0);
    });
    for (let index = portals.length; index < portalSlotCapacity; index += 1)
      uniforms.hpPortalColor.value[index]?.set(0, 0, 0, 0);
  };

  return {
    beforeRender: () => {
      sources.frame.updateWorldMatrix(true, false);
      const rooms = sources.rooms();
      const openings = sources.openings();
      if (rooms.version !== roomsVersion) {
        rebuildMask(rooms.rooms);
        roomsVersion = rooms.version;
        openingsVersion = -1;
      }
      if (openings.version !== openingsVersion) {
        rebuildPortals(rooms.rooms, openings.openings);
        openingsVersion = openings.version;
      }
      patchMaterials();
      writeUniforms();
    },
    portals: () => ({ count: portals.length, slots }),
    withSlots: (count, run) => {
      const kept = slots;
      slots = count;
      try {
        run();
      } finally {
        slots = kept;
      }
    },
    dispose: () => {
      uniforms.hpIndoorMap.value.dispose();
    },
  };
};
