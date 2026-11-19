// Cache of template-instance schemas per house and template version, populated when template metadata loads
// (1.7). House templates are house-owned (a cloned house keeps the same `t_…` IDs but its versions can diverge),
// so every key includes the house ID. A small store lets the property panel re-render when a schema arrives.
import { createStore } from "zustand/vanilla";
import type { EntityRef } from "@shared/domain/house/entityIndex";

const schemas = new Map<string, object>();

export const instanceSchemaVersion = createStore<Readonly<{ version: number }>>(() => ({ version: 0 }));

export const templateSchemaKey = (houseId: string, templateId: string, version: number): string =>
  `${houseId}/${templateId}@${String(version)}`;

export const registerInstanceSchema = (
  houseId: string,
  templateId: string,
  version: number,
  schema: object,
): void => {
  const key = templateSchemaKey(houseId, templateId, version);
  if (schemas.get(key) === schema) return;
  schemas.set(key, schema);
  instanceSchemaVersion.setState((state) => ({ version: state.version + 1 }));
};

export const instanceSchemaFor = (houseId: string, ref: EntityRef): object | undefined =>
  ref.kind === "opening" || ref.kind === "object"
    ? schemas.get(templateSchemaKey(houseId, ref.value.templateId, ref.value.templateVersion))
    : undefined;
