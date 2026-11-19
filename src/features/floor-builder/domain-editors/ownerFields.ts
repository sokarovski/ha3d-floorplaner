// Reads common fields of the object that owns a property (for sibling-dependent domain editors).
export const ownerId = (owner: unknown): string | undefined =>
  typeof owner === "object" && owner !== null && "id" in owner && typeof owner.id === "string"
    ? owner.id
    : undefined;

export const ownerTemplateId = (owner: unknown): string | undefined =>
  typeof owner === "object" && owner !== null && "templateId" in owner && typeof owner.templateId === "string"
    ? owner.templateId
    : undefined;
