// Houses screen, Floor Builder, and Object Editor routes.
import type { RouteObject } from "react-router";

export const houseRoutes: readonly RouteObject[] = [
  {
    path: "/",
    lazy: async () => ({ Component: (await import("../../features/houses/pages/HousesPage")).HousesPage }),
  },
  {
    path: "/houses/:houseId",
    lazy: async () => ({
      Component: (await import("../../features/floor-builder/pages/FloorBuilderPage")).FloorBuilderPage,
    }),
  },
  {
    path: "/houses/:houseId/objects/:templateId",
    lazy: async () => ({
      Component: (await import("../../features/object-editor/pages/ObjectEditorPage")).ObjectEditorPage,
    }),
  },
];
