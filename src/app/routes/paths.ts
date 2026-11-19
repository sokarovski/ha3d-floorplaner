// URL construction for the SPA. IDs are encoded; they are resource identifiers, never filesystem paths.

export const paths = {
  houses: (): string => "/",
  house: (houseId: string): string => `/houses/${encodeURIComponent(houseId)}`,
  newObject: (houseId: string): string => `/houses/${encodeURIComponent(houseId)}/objects/new`,
  object: (houseId: string, templateId: string): string =>
    `/houses/${encodeURIComponent(houseId)}/objects/${encodeURIComponent(templateId)}`,
  ds: (subPath = ""): string => (subPath === "" ? "/ds" : `/ds/${subPath}`),
} as const;
