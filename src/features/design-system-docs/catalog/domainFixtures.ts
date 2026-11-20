// Fixture domain-editor data for /ds pages (no real house, no API calls).
import {
  builtInPresets,
  createArea,
  createHouseDocument,
  defaultWallPaint,
} from "@shared/domain/house/defaults";
import { materialLibrary } from "@shared/domain/materials/materialLibrary";
import type { DomainEditorData } from "../../floor-builder/domain-editors/domainEditorData";

const swatch = (color: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${color}"/><path d="M0 32h64M32 0v64" stroke="#0003"/></svg>`)}`;

const fixturePresets = [
  ...builtInPresets.map((preset) => ({ ...preset, builtIn: true })),
  { id: "mp_fixture01", name: "Kitchen tiles", material: defaultWallPaint(), builtIn: false },
];

/** A fixture house with one room, so the chooser's Used in this house group has entries. */
const fixtureLibraryHouse = (() => {
  const house = createHouseDocument("h_fixture000", "Fixture house");
  house.floors[0]?.areas.push(createArea("Living", { x: 0, y: 0 }));
  return house;
})();

export const fixtureDomainData: DomainEditorData = {
  houseId: "h_fixture000",
  images: [
    {
      id: "img_fixture01",
      name: "Oak parquet",
      originalFilename: "oak.jpg",
      mediaType: "image/jpeg",
      widthPx: 1024,
      heightPx: 1024,
      byteSize: 120000,
      file: "img_fixture01.jpg",
      thumbnail: "img_fixture01.thumb.webp",
      createdAt: "2026-11-14T10:00:00.000Z",
    },
    {
      id: "img_fixture02",
      name: "Slate tiles",
      originalFilename: "slate.png",
      mediaType: "image/png",
      widthPx: 512,
      heightPx: 512,
      byteSize: 80000,
      file: "img_fixture02.png",
      thumbnail: "img_fixture02.thumb.webp",
      createdAt: "2026-11-14T10:00:00.000Z",
    },
  ],
  imageUrl: (imageId) => swatch(imageId === "img_fixture01" ? "#b08550" : "#5a6470"),
  thumbnailUrl: (imageId) => swatch(imageId === "img_fixture01" ? "#b08550" : "#5a6470"),
  uploadImage: () => Promise.reject(new Error("Uploads are disabled in the design-system fixtures.")),
  reloadImages: () => undefined,
  setImageTexture: () => Promise.reject(new Error("Uploads are disabled in the design-system fixtures.")),
  presets: fixturePresets,
  savePreset: () => true,
  renamePreset: () => true,
  deletePreset: () => true,
  materialLibrary: () => materialLibrary(fixtureLibraryHouse, fixturePresets),
  referenceOptions: (kind) =>
    kind === "light"
      ? [
          { id: "l_fixture001", label: "Pendant Light 1 · Living" },
          { id: "l_fixture002", label: "Floor lamp · Living" },
          { id: "l_fixture003", label: "Strip · Kitchen" },
        ]
      : [
          { id: "w_fixture001", label: "Wall (bottom) · Living" },
          { id: "w_fixture002", label: "Wall (right) · Living" },
        ],
  templates: [
    {
      id: "window-style-1",
      label: "Window Style 1",
      kind: "window",
      contract: "Wallable",
      versions: [1, 2],
      source: "builtin",
      thumbnailUrl: null,
    },
    {
      id: "pendant-light",
      label: "Pendant Light",
      kind: "light",
      contract: "Areable",
      versions: [1],
      source: "builtin",
      thumbnailUrl: null,
    },
  ],
  updateTemplateVersion: () => true,
};
