// The analytic strip light in the shared PBR materials (Phase 12; rules and CPU mirror in linearStrip.ts;
// spec/builder/features/lighting.md#strip-light-phase-154). Framework-free: the builder viewport and the HA viewer
// each own one, through their lights layer.
//
// Every MeshStandardMaterial/MeshPhysicalMaterial in the scene gets one material patch (materialPatches.ts):
// after `#include <lights_fragment_begin>` (view-space `geometryPosition`/`geometryNormal`, the `material`
// struct and `reflectedLight` exist there) a loop over `HP_STRIPS` slots adds each strip's diffuse term to
// `reflectedLight.directDiffuse` and its glossy highlight (Phase 15.4: a representative-point GGX highlight,
// rectLightShading.ts) to `reflectedLight.directSpecular`. Strip data are uniform arrays in world space, moved into view space with the
// fragment shader's `viewMatrix`, so every camera rendering the scene (viewport, HA glass reflection, PNG export)
// sees the same light. The slot count is fixed per floor (strip count rounded up to 4, 8 or 16): dimming,
// recolouring or switching a strip off only writes uniforms (an unused or dark slot has zero radiance), so no
// program recompiles; adding a strip past a slot step recompiles once.
import type { Color, Material, Object3D } from "three";
import { MeshStandardMaterial, Vector3, Vector4 } from "three";
import { previewPhotometricScale } from "./lightColor";
import type { StripPlane, StripVec } from "./linearStrip";
import { stripFrontRampMm, stripMinWidthMm, stripPlaneFadeMm, stripRadiance } from "./linearStrip";
import { setMaterialPatch } from "./materialPatches";
import { commonAnchor, physicalParsAnchor, rectFormFactorGlsl, rectSpecularGlsl } from "./rectLightShading";
import type { MaterialPatch } from "./materialPatches";
import { isMesh } from "./sceneObjects";

/** Most strips a floor's materials evaluate; further strips give their output to their carriers. */
export const stripSlotCapacity = 16;

/** One strip's analytic term, in the floor frame of `frame` (mm). */
export type StripSource = Readonly<{
  /** The object whose local frame the values below are in (the light's root). */
  frame: Object3D;
  center: StripVec;
  /** Unit direction along the strip and unit direction it shines. */
  along: StripVec;
  facing: StripVec;
  lengthMm: number;
  widthMm: number;
  reachMm: number;
  plane: StripPlane | null;
  /** Linear emitter colour (lightEmitterColor) and the lumens this term carries. */
  color: Color;
  lumens: number;
}>;

export type StripShading = Readonly<{
  /** The active floor's strips, in slot order (at most `stripSlotCapacity` are used). */
  setStrips: (strips: readonly StripSource[]) => void;
  /** Before every render of `scene`: patches new materials and writes the strips' world-space uniforms. */
  beforeRender: (scene: Object3D) => void;
  /** Slots compiled into the materials (0, 4, 8 or 16). */
  slots: () => number;
}>;

const slotsFor = (count: number): number =>
  count === 0 ? 0 : count <= 4 ? 4 : count <= 8 ? 8 : stripSlotCapacity;

const declarations = (slots: number): string => /* glsl */ `
#define HP_STRIPS ${String(slots)}
uniform vec4 hpStripCenter[ HP_STRIPS ]; // centre (world), reach
uniform vec4 hpStripAlong[ HP_STRIPS ]; // half length vector, clip-plane fade
uniform vec4 hpStripAcross[ HP_STRIPS ]; // half width vector (cross(across, along) = facing), front ramp
uniform vec4 hpStripColor[ HP_STRIPS ]; // linear radiance
uniform vec4 hpStripPlane[ HP_STRIPS ]; // clip plane (world): lit where dot(xyz, p) < w; zero normal: none
`;

const shading = /* glsl */ `
for ( int hpI = 0; hpI < HP_STRIPS; hpI ++ ) {
  vec3 hpColor = hpStripColor[ hpI ].rgb;
  if ( max( hpColor.r, max( hpColor.g, hpColor.b ) ) <= 0.0 ) continue;
  vec4 hpC = hpStripCenter[ hpI ];
  vec3 hpCenter = ( viewMatrix * vec4( hpC.xyz, 1.0 ) ).xyz;
  vec3 hpAlong = mat3( viewMatrix ) * hpStripAlong[ hpI ].xyz;
  vec3 hpAcross = mat3( viewMatrix ) * hpStripAcross[ hpI ].xyz;
  vec3 hpTo = geometryPosition - hpCenter;
  float hpT = clamp( dot( hpTo, hpAlong ) / max( dot( hpAlong, hpAlong ), 1e-12 ), -1.0, 1.0 );
  float hpDistance = length( hpTo - hpAlong * hpT );
  if ( hpDistance >= hpC.w ) continue;
  float hpFront = dot( hpTo, normalize( cross( hpAcross, hpAlong ) ) );
  if ( hpFront <= 0.0 ) continue;
  float hpWeight = ( 1.0 - smoothstep( 0.5 * hpC.w, hpC.w, hpDistance ) ) * smoothstep( 0.0, hpStripAcross[ hpI ].w, hpFront );
  vec4 hpPlane = hpStripPlane[ hpI ];
  if ( dot( hpPlane.xyz, hpPlane.xyz ) > 0.0 ) {
    vec3 hpPlaneNormal = mat3( viewMatrix ) * hpPlane.xyz;
    float hpBeyond = dot( hpPlaneNormal, geometryPosition - viewMatrix[ 3 ].xyz ) - hpPlane.w;
    hpWeight *= 1.0 - smoothstep( - hpStripAlong[ hpI ].w, 0.0, hpBeyond );
  }
  if ( hpWeight <= 0.0 ) continue;
  float hpForm = hpRectFormFactor( geometryNormal, geometryPosition,
    hpCenter + hpAlong - hpAcross, hpCenter - hpAlong - hpAcross, hpCenter - hpAlong + hpAcross, hpCenter + hpAlong + hpAcross );
  if ( hpForm <= 0.0 ) continue;
  reflectedLight.directDiffuse += hpColor * material.diffuseContribution * ( hpForm * hpWeight );
  // Phase 15.4 gloss: the strip's highlight on shiny surfaces (representative point, rectLightShading.ts).
  reflectedLight.directSpecular += hpColor * ( PI * hpForm * hpWeight ) *
    hpRectSpecular( geometryNormal, geometryViewDir, geometryPosition, hpCenter, hpAlong, hpAcross, material );
}
`;

const fragmentAnchor = "#include <lights_fragment_begin>";

const vec = (value: StripVec): Vector3 => new Vector3(value.x, value.y, value.z);

/** Three.js draws no light under a hidden object; the strip term follows the same rule. */
const visibleInTree = (object: Object3D): boolean => {
  for (let current: Object3D | null = object; current !== null; current = current.parent)
    if (!current.visible) return false;
  return true;
};

export const createStripShading = (): StripShading => {
  const slotArray = (): Vector4[] => Array.from({ length: stripSlotCapacity }, () => new Vector4());
  const uniforms = {
    hpStripCenter: { value: slotArray() },
    hpStripAlong: { value: slotArray() },
    hpStripAcross: { value: slotArray() },
    hpStripColor: { value: slotArray() },
    hpStripPlane: { value: slotArray() },
  };
  let strips: readonly StripSource[] = [];
  let slots = 0;
  /** The slot count each patched material was last compiled for. */
  const compiledFor = new WeakMap<Material, number>();

  const patch: MaterialPatch = {
    key: () => String(slots),
    apply: (shader) => {
      if (slots === 0) return;
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace(commonAnchor, `${commonAnchor}\n${declarations(slots)}\n${rectFormFactorGlsl}`)
        .replace(physicalParsAnchor, `${physicalParsAnchor}\n${rectSpecularGlsl}`)
        .replace(fragmentAnchor, `${fragmentAnchor}\n${shading}`);
    },
  };

  const patchMaterials = (scene: Object3D): void => {
    scene.traverse((object) => {
      if (!isMesh(object)) return;
      const materials: Material | Material[] = object.material;
      for (const material of Array.isArray(materials) ? materials : [materials]) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        const compiled = compiledFor.get(material);
        if (compiled === slots) continue;
        if (compiled === undefined) setMaterialPatch(material, "hpstrip", patch);
        else material.needsUpdate = true;
        compiledFor.set(material, slots);
      }
    });
  };

  const writeUniforms = (): void => {
    const p = new Vector3();
    const q = new Vector3();
    strips.slice(0, stripSlotCapacity).forEach((strip, index) => {
      const center = uniforms.hpStripCenter.value[index];
      const along = uniforms.hpStripAlong.value[index];
      const across = uniforms.hpStripAcross.value[index];
      const color = uniforms.hpStripColor.value[index];
      const plane = uniforms.hpStripPlane.value[index];
      if (
        center === undefined ||
        along === undefined ||
        across === undefined ||
        color === undefined ||
        plane === undefined
      )
        return;
      const { frame } = strip;
      if (strip.lumens <= 0 || !visibleInTree(frame)) {
        color.set(0, 0, 0, 0);
        return;
      }
      frame.updateWorldMatrix(true, false);
      const width = Math.max(strip.widthMm, stripMinWidthMm);
      const localCenter = vec(strip.center);
      const worldCenter = frame.localToWorld(localCenter.clone());
      const halfAlong = frame
        .localToWorld(p.copy(localCenter).addScaledVector(vec(strip.along), strip.lengthMm / 2))
        .sub(worldCenter);
      const acrossDirection = vec(strip.along).cross(vec(strip.facing)).normalize();
      const halfAcross = frame
        .localToWorld(q.copy(localCenter).addScaledVector(acrossDirection, width / 2))
        .sub(worldCenter);
      const worldPerMm = halfAlong.length() / (strip.lengthMm / 2);
      center.set(worldCenter.x, worldCenter.y, worldCenter.z, strip.reachMm * worldPerMm);
      along.set(halfAlong.x, halfAlong.y, halfAlong.z, stripPlaneFadeMm * worldPerMm);
      across.set(halfAcross.x, halfAcross.y, halfAcross.z, stripFrontRampMm * worldPerMm);
      const area = strip.lengthMm * width * worldPerMm * worldPerMm;
      const radiance = stripRadiance(strip.lumens, area) * previewPhotometricScale;
      color.set(strip.color.r * radiance, strip.color.g * radiance, strip.color.b * radiance, 0);
      if (strip.plane === null) plane.set(0, 0, 0, 0);
      else {
        const normal = vec(strip.plane.normal);
        const onPlane = frame.localToWorld(normal.clone().multiplyScalar(strip.plane.offsetMm));
        const worldNormal = frame
          .localToWorld(normal.multiplyScalar(strip.plane.offsetMm + 1))
          .sub(onPlane)
          .normalize();
        plane.set(worldNormal.x, worldNormal.y, worldNormal.z, worldNormal.dot(onPlane));
      }
    });
    for (let index = Math.min(strips.length, stripSlotCapacity); index < stripSlotCapacity; index += 1)
      uniforms.hpStripColor.value[index]?.set(0, 0, 0, 0);
  };

  return {
    setStrips: (next) => {
      strips = next;
      slots = slotsFor(Math.min(next.length, stripSlotCapacity));
    },
    beforeRender: (scene) => {
      patchMaterials(scene);
      writeUniforms();
    },
    slots: () => slots,
  };
};
