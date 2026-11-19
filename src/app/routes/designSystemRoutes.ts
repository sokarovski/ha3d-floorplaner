// The unlisted /ds documentation routes (spec/design-system/workbench.md#page-map).
import { redirect } from "react-router";
import type { RouteObject } from "react-router";

export const designSystemRoutes: RouteObject = {
  path: "/ds",
  lazy: async () => ({
    Component: (await import("../../features/design-system-docs/pages/DsLayoutPage")).DsLayoutPage,
  }),
  children: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import("../../features/design-system-docs/pages/DsHomePage")).DsHomePage,
      }),
    },
    {
      path: "colors",
      lazy: async () => ({
        Component: (await import("../../features/design-system-docs/pages/DsColorsPage")).DsColorsPage,
      }),
    },
    {
      path: "themes",
      lazy: async () => ({
        Component: (await import("../../features/design-system-docs/pages/DsThemesPage")).DsThemesPage,
      }),
    },
    {
      path: "conventions",
      lazy: async () => ({
        Component: (await import("../../features/design-system-docs/pages/DsConventionsPage"))
          .DsConventionsPage,
      }),
    },
    {
      path: "components",
      lazy: async () => ({
        Component: (await import("../../features/design-system-docs/pages/DsComponentsPage"))
          .DsComponentsPage,
      }),
    },
    // ThemeSetting was retired for the segmented property editor (Phase 5.9).
    {
      path: "components/theme-setting",
      loader: () => redirect("/ds/property-editors/segmented"),
    },
    {
      path: "components/:componentSlug",
      lazy: async () => ({
        Component: (await import("../../features/design-system-docs/pages/DsComponentPage")).DsComponentPage,
      }),
    },
    {
      path: "property-editors",
      lazy: async () => ({
        Component: (await import("../../features/design-system-docs/pages/DsPropertyEditorsPage"))
          .DsPropertyEditorsPage,
      }),
    },
    {
      path: "property-editors/:editorSlug",
      lazy: async () => ({
        Component: (await import("../../features/design-system-docs/pages/DsPropertyEditorPage"))
          .DsPropertyEditorPage,
      }),
    },
    {
      path: "forms",
      lazy: async () => ({
        Component: (await import("../../features/design-system-docs/pages/DsFormsPage")).DsFormsPage,
      }),
    },
    {
      path: "property-panel",
      lazy: async () => ({
        Component: (await import("../../features/design-system-docs/pages/DsPropertyPanelPage"))
          .DsPropertyPanelPage,
      }),
    },
    {
      path: "viewport",
      lazy: async () => ({
        Component: (await import("../../features/viewport/pages/ViewportPlaygroundPage"))
          .ViewportPlaygroundPage,
      }),
    },
    {
      path: "*",
      lazy: async () => ({
        Component: (await import("../../features/design-system-docs/pages/DsUnknownPage")).DsUnknownPage,
      }),
    },
  ],
};
