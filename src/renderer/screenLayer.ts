// Screen pictures (Phase 8.8, spec/builder/features/object-templates.md#screens): a picture shown on the screen of
// a display instance (a TV whose template declares `screen`). The picture is a thin unlit plane just in front of
// the screen slot's box, fitted inside it (contain: the whole picture shows, centered, the rest of the screen
// keeps its authored dark material). Unlit and not tone mapped, so it reads at night and in daylight alike; it
// casts and receives no shadows. The plane is a child of the instance root, so it moves, hides, and is picked
// with its object; when an instance is rebuilt the next sync attaches a new plane. Framework-free (D23); the HA
// viewer decides what to show (ha-viewer/tvScreens.ts).
import { DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Texture } from "three";
import type { Object3D } from "three";
import type { ScreenFace } from "./instanceLayer";

/** A decoded picture and its pixel size. */
export type ScreenImage = Readonly<{
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap;
  width: number;
  height: number;
}>;

export type ScreenLayer = Readonly<{
  /** Shows (or with null clears) a picture on an instance's screen; takes effect at the next `sync`. */
  setImage: (instanceId: string, image: ScreenImage | null) => void;
  /** Attaches the pictures to the current instance roots (after every instance sync). */
  sync: (
    root: (instanceId: string) => Object3D | null,
    screen: (instanceId: string) => ScreenFace | null,
  ) => void;
  dispose: () => void;
}>;

/** Gap between the screen surface and the picture plane (m), against z-fighting. */
const frontGapM = 0.0008;
/** Share of the screen the picture may cover at most (a thin dark margin, implementation convention). */
const fillShare = 0.94;

type Shown = {
  readonly image: ScreenImage;
  readonly texture: Texture;
  readonly material: MeshBasicMaterial;
  mesh: Mesh | null;
  root: Object3D | null;
  face: ScreenFace | null;
};

const fittedPlane = (image: ScreenImage, face: ScreenFace, material: MeshBasicMaterial): Mesh => {
  const screenWidth = (face.max[0] - face.min[0]) * fillShare;
  const screenHeight = (face.max[1] - face.min[1]) * fillShare;
  const aspect = image.height > 0 ? image.width / image.height : 1;
  const width = Math.min(screenWidth, screenHeight * aspect);
  const height = width / aspect;
  const mesh = new Mesh(new PlaneGeometry(width, height), material);
  mesh.name = "screen-picture";
  mesh.position.set(
    (face.min[0] + face.max[0]) / 2,
    (face.min[1] + face.max[1]) / 2,
    face.front === 1 ? face.max[2] + frontGapM : face.min[2] - frontGapM,
  );
  if (face.front === -1) mesh.rotation.y = Math.PI;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
};

export const createScreenLayer = (): ScreenLayer => {
  const shown = new Map<string, Shown>();

  const detach = (entry: Shown): void => {
    if (entry.mesh === null) return;
    entry.mesh.removeFromParent();
    entry.mesh.geometry.dispose();
    entry.mesh = null;
    entry.root = null;
    entry.face = null;
  };

  const release = (entry: Shown): void => {
    detach(entry);
    entry.material.dispose();
    entry.texture.dispose();
  };

  return {
    setImage: (instanceId, image) => {
      const current = shown.get(instanceId);
      if (current?.image === image) return;
      if (current !== undefined) release(current);
      shown.delete(instanceId);
      if (image === null) return;
      const texture = new Texture(image.source);
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      const material = new MeshBasicMaterial({ map: texture, toneMapped: false, side: DoubleSide });
      shown.set(instanceId, { image, texture, material, mesh: null, root: null, face: null });
    },
    sync: (root, screen) => {
      for (const [instanceId, entry] of shown) {
        const nextRoot = root(instanceId);
        const face = nextRoot === null ? null : screen(instanceId);
        if (nextRoot === entry.root && face === entry.face && entry.mesh?.parent === nextRoot) continue;
        detach(entry);
        if (nextRoot === null || face === null) continue;
        const mesh = fittedPlane(entry.image, face, entry.material);
        nextRoot.add(mesh);
        entry.mesh = mesh;
        entry.root = nextRoot;
        entry.face = face;
      }
    },
    dispose: () => {
      for (const entry of shown.values()) release(entry);
      shown.clear();
    },
  };
};
