// Subtle ground grid (spec/builder/features/units-and-grid.md): 1 m minor and 5 m major lines drawn
// analytically in a fragment shader on a large plane slightly below h = 0, anti-aliased with screen-space
// derivatives and faded with distance from the floor center for an infinite feel. Minor lines fade out
// when they get denser than a few pixels, so spacing always represents the same physical distances.
// Editor helper: on the helper layer and excluded from exports.
import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector2 } from "three";
import type { HelperPalette } from "./helperPalette";
import { markAsHelper } from "./sceneObjects";

export type GroundGrid = Readonly<{
  mesh: Mesh;
  /** Re-centers the plane (plan mm) and sets the fade radius from the floor extent. */
  fit: (centerMm: Readonly<{ x: number; y: number }>, extentMm: number) => void;
  setPalette: (palette: HelperPalette) => void;
  dispose: () => void;
}>;

const gridDepthMm = -4;
const planeSizeMm = 400000;

const vertexShader = /* glsl */ `
varying vec2 vPlan;
void main() {
  vec4 local = vec4(position, 1.0);
  vPlan = (modelMatrix * local).xz * vec2(1000.0, -1000.0);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * local;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform vec2 uCenter;
uniform float uFadeRadius;
varying vec2 vPlan;

float gridLine(vec2 coordinate, float spacing, out float density) {
  vec2 scaled = coordinate / spacing;
  vec2 width = fwidth(scaled);
  density = max(width.x, width.y);
  vec2 distanceToLine = abs(fract(scaled - 0.5) - 0.5) / max(width, vec2(1e-6));
  return 1.0 - min(min(distanceToLine.x, distanceToLine.y), 1.0);
}

void main() {
  float minorDensity;
  float majorDensity;
  float minor = gridLine(vPlan, 1000.0, minorDensity);
  float major = gridLine(vPlan, 5000.0, majorDensity);
  float minorFade = 1.0 - smoothstep(0.08, 0.3, minorDensity);
  float majorFade = 1.0 - smoothstep(0.15, 0.5, majorDensity);
  float line = max(minor * 0.55 * minorFade, major * majorFade);
  float fade = 1.0 - smoothstep(uFadeRadius * 0.45, uFadeRadius, distance(vPlan, uCenter));
  float alpha = line * fade * uAlpha;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;

export const createGroundGrid = (palette: HelperPalette): GroundGrid => {
  const uniforms = {
    uColor: { value: new Color() },
    uAlpha: { value: 1 },
    uCenter: { value: new Vector2() },
    uFadeRadius: { value: 60000 },
  };
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });
  const geometry = new PlaneGeometry(planeSizeMm, planeSizeMm);
  const mesh = new Mesh(geometry, material);
  mesh.name = "groundGrid";
  mesh.position.z = gridDepthMm;
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  markAsHelper(mesh);

  const setPalette = (next: HelperPalette): void => {
    uniforms.uColor.value.setRGB(next.grid.r, next.grid.g, next.grid.b);
    uniforms.uAlpha.value = next.grid.a;
  };
  setPalette(palette);

  return {
    mesh,
    fit: (centerMm, extentMm) => {
      mesh.position.x = centerMm.x;
      mesh.position.y = centerMm.y;
      uniforms.uCenter.value.set(centerMm.x, centerMm.y);
      uniforms.uFadeRadius.value = Math.max(30000, extentMm * 3);
    },
    setPalette,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
};
