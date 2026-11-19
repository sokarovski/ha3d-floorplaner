// The property group catalog (Phase 5.7, owner H9): one registry of the groups the properties panel shows,
// so every object type names its groups by ID and they read the same everywhere (title, order). Types with
// the same field in the same group share it: a mixed selection shows the groups its types have in common.

export const propertyGroupCatalog = {
  general: { title: "General" },
  template: { title: "Template" },
  staircase: { title: "Staircase" },
  placement: { title: "Placement" },
  size: { title: "Size" },
  slab: { title: "Slab" },
  emitter: { title: "Emitter" },
  light: { title: "Light" },
  appearance: { title: "Appearance" },
  environment: { title: "Environment" },
  profile: { title: "Profile" },
  materials: { title: "Materials" },
  ribs: { title: "Ribs" },
} as const;

export type PropertyGroupId = keyof typeof propertyGroupCatalog;

const catalogOrder = Object.keys(propertyGroupCatalog);

/** The `groups` annotation for a type: the named catalog groups, always in catalog order. */
export const propertyGroups = (
  ...ids: readonly PropertyGroupId[]
): { groups: { id: PropertyGroupId; title: string }[] } => ({
  groups: [...ids]
    .sort((a, b) => catalogOrder.indexOf(a) - catalogOrder.indexOf(b))
    .map((id) => ({ id, title: propertyGroupCatalog[id].title })),
});
