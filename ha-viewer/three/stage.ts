// The 3D part of the stage (spec/home-assistant/viewer-mvp.md#houseviewer). The backdrop (sky and a
// half-ellipse floor) is CSS behind a transparent canvas, so it never moves with the camera. In 3D there is
// only a faint glass-like reflection of the house, transparent wherever it shows nothing so the CSS floor
// shows through. There is no shadow catcher: shadows fall only on real surfaces (floors, carpets, walls),
// never into the air around the house (owner).
import { CircleGeometry, Group, ShaderMaterial } from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";

export type StagePalette = Readonly<{ reflection: number }>;

export const lightStage: StagePalette = { reflection: 0.22 };
export const darkStage: StagePalette = { reflection: 0.3 };

export type Stage = Readonly<{
  root: Group;
  setPalette: (palette: StagePalette) => void;
  /** Drawing-buffer size in pixels; the reflection renders at half of it, which also softens it. */
  setSize: (width: number, height: number) => void;
  /** Shows or hides the glass reflection; hidden skips its extra render pass entirely. */
  setReflectionVisible: (visible: boolean) => void;
  /** Called with false before the reflection pass and true after it, to hide what the glass should not show. */
  setReflectionFilter: (filter: (visible: boolean) => void) => void;
  /** The reflection fades out over this distance (m) from the stage centre. */
  setFadeRadius: (radiusM: number) => void;
  dispose: () => void;
}>;

/** Below the house floors by more than depth precision can blur (implementation convention). */
const reflectorDropM = 0.012;

const glassShader = {
  name: "HomeplanGlassReflection",
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    opacity: { value: lightStage.reflection },
    fadeRadius: { value: 10 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec2 vLocal;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vLocal = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float opacity;
    uniform float fadeRadius;
    varying vec4 vUv;
    varying vec2 vLocal;
    void main() {
      vec4 reflected = texture2DProj(tDiffuse, vUv);
      float fade = 1.0 - smoothstep(0.15, 1.0, length(vLocal) / fadeRadius);
      gl_FragColor = vec4(reflected.rgb, reflected.a * opacity * fade);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

export const createStage = (radiusM: number, palette: StagePalette): Stage => {
  const root = new Group();
  root.name = "stage";
  const reflector = new Reflector(new CircleGeometry(radiusM, 64), {
    clipBias: 0.003,
    textureWidth: 512,
    textureHeight: 512,
    shader: glassShader,
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.y = -reflectorDropM;
  reflector.renderOrder = -1;
  const glass = reflector.material instanceof ShaderMaterial ? reflector.material : null;
  if (glass !== null) {
    glass.transparent = true;
    glass.depthWrite = false;
  }
  // The glass does not reflect what the filter hides (objects and fixtures).
  let reflectionFilter: (visible: boolean) => void = () => undefined;
  const reflect = reflector.onBeforeRender.bind(reflector);
  reflector.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    reflectionFilter(false);
    reflect(renderer, scene, camera, geometry, material, group);
    reflectionFilter(true);
  };

  root.add(reflector);

  const setUniform = (name: "opacity" | "fadeRadius", value: number): void => {
    const uniform = glass?.uniforms[name];
    if (uniform !== undefined) uniform.value = value;
  };
  setUniform("opacity", palette.reflection);

  return {
    root,
    setPalette: (next) => {
      setUniform("opacity", next.reflection);
    },
    setSize: (width, height) => {
      reflector
        .getRenderTarget()
        .setSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)));
    },
    setReflectionVisible: (visible) => {
      reflector.visible = visible;
    },
    setReflectionFilter: (filter) => {
      reflectionFilter = filter;
    },
    setFadeRadius: (fadeRadiusM) => {
      setUniform("fadeRadius", fadeRadiusM);
    },
    dispose: () => {
      reflector.dispose();
      reflector.geometry.dispose();
    },
  };
};
