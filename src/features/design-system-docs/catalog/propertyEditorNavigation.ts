// Sidebar sections for forms and property editors.
import { domainEditorDocs } from "./domainEditorCatalog";
import type { DsNavSection } from "./navigation";
import { propertyEditorDocs } from "./propertyEditorCatalog";

export const propertyEditorNavigation = (): readonly DsNavSection[] => [
  {
    title: "Forms",
    links: [
      { to: "/ds/forms", label: "Forms and popups" },
      { to: "/ds/property-panel", label: "Property panel" },
    ],
  },
  {
    title: "Property editors",
    links: [
      { to: "/ds/property-editors", label: "Contract and registry" },
      ...propertyEditorDocs.map((doc) => ({ to: `/ds/property-editors/${doc.slug}`, label: doc.editor })),
      ...domainEditorDocs.map((doc) => ({
        to: `/ds/property-editors/${doc.slug}`,
        label: `${doc.editor} (domain)`,
      })),
    ],
  },
];
