// Mirror surfaces (Phase 9.1, owner: cheap shine; spec/builder/features/object-templates.md#mirrors): the meshes
// of the material slot a template names in `mirror` draw with an environment-map reflection instead of a real
// one. The view's own environment map is used when it has one (the HA viewer's scene environment); otherwise one
// small environment (a PMREM of three.js's RoomEnvironment: a neutral lit room) is generated on first use and
// shared by every mirror of the view; each authored mirror material gets one shiny copy (metallic,
// almost smooth, its authored colour kept as a faint tint), shared by every instance using it. Nothing is
// rendered per mirror or per frame, so a mirror costs what any other standard material costs. Framework-free
// (D23): the builder viewport, the template preview, and the HA viewer each create one for their renderer.
import { MeshStandardMaterial, PMREMGenerator } from "three";
import type { Material, Texture, WebGLRenderer } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type MirrorSurfaces = Readonly<{
  /** The shiny copy of an authored slot material (created once per material). */
  material: (authored: Material | null) => Material;
  /** Scales every mirror's reflection; the view passes `Lighting.reflectionScale()` after each sun change. */
  setReflectionScale: (scale: number) => void;
  dispose: () => void;
}>;

/** Mirror finish (implementation convention): almost smooth metal, the environment at full strength. */
const mirrorRoughness = 0.04;
const environmentIntensity = 1;
/** How much of the authored colour tints the reflection (0 = pure chrome, 1 = the authored colour). */
const tintShare = 0.25;

export const createMirrorSurfaces = (renderer: WebGLRenderer, existing?: Texture | null): MirrorSurfaces => {
  const own = existing === undefined || existing === null;
  let environment: Texture | null = existing ?? null;
  const copies = new Map<Material | null, MeshStandardMaterial>();
  let reflectionScale = 1;

  const environmentMap = (): Texture => {
    if (environment !== null) return environment;
    const generator = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    environment = generator.fromScene(room, 0.04).texture;
    room.dispose();
    generator.dispose();
    return environment;
  };

  return {
    material: (authored) => {
      const existing = copies.get(authored);
      if (existing !== undefined) return existing;
      const copy = new MeshStandardMaterial({
        metalness: 1,
        roughness: mirrorRoughness,
        envMap: environmentMap(),
        envMapIntensity: environmentIntensity * reflectionScale,
      });
      copy.name = `${authored?.name ?? "mirror"} (mirror)`;
      if (authored instanceof MeshStandardMaterial) {
        copy.color.setRGB(1, 1, 1).lerp(authored.color, tintShare);
        copy.side = authored.side;
      }
      copies.set(authored, copy);
      return copy;
    },
    setReflectionScale: (scale) => {
      reflectionScale = scale;
      for (const copy of copies.values()) copy.envMapIntensity = environmentIntensity * scale;
    },
    dispose: () => {
      for (const copy of copies.values()) copy.dispose();
      copies.clear();
      if (own) environment?.dispose();
      environment = null;
    },
  };
};
