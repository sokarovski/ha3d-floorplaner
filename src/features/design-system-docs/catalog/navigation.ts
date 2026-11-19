// Sidebar sections of the /ds workbench.
import { componentDocs } from "./componentCatalog";

export type DsNavLink = Readonly<{ to: string; label: string }>;
export type DsNavSection = Readonly<{ title: string; links: readonly DsNavLink[] }>;

export const dsNavigation = (extraSections: readonly DsNavSection[] = []): readonly DsNavSection[] => [
  {
    title: "Overview",
    links: [
      { to: "/ds", label: "Home" },
      { to: "/ds/colors", label: "Colors" },
      { to: "/ds/themes", label: "Themes" },
      { to: "/ds/conventions", label: "Conventions" },
    ],
  },
  {
    title: "Components",
    links: [
      { to: "/ds/components", label: "All components" },
      ...componentDocs.map((doc) => ({ to: `/ds/components/${doc.slug}`, label: doc.name })),
    ],
  },
  ...extraSections,
];
