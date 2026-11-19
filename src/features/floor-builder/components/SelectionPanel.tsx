import { useMemo } from "react";
import type { ReactElement } from "react";
import { indexEntities } from "@shared/domain/house/entityIndex";
import { setPropertyCommand } from "@shared/domain/commands/propertyCommands";
import { PropertyPanel } from "../../../design-system/forms/PropertyPanel/PropertyPanel";
import { useHouse, useSession, useUi } from "../hooks/sessionContext";
import { useInstanceSchemas } from "../hooks/useInstanceSchemas";
import { applicationRegistry } from "../services/editorRegistry";
import { mixedPointers } from "../services/mixedValues";
import { kindLabel, schemaForEntity } from "../services/selectionSchema";
import { SelectionActions } from "./SelectionActions";
import { SelectionDetails } from "./SelectionDetails";
import { sharedSchema } from "../services/sharedSchema";

/** "2 Carpets, 1 Light": counts per kind, in selection order. */
const mixedSummary = (labels: readonly string[]): string => {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts].map(([label, count]) => `${String(count)} ${label}${count === 1 ? "" : "s"}`).join(", ");
};

export const SelectionPanel = (): ReactElement => {
  const session = useSession();
  const house = useHouse((value) => value);
  const selection = useUi((ui) => ui.selection);
  const instanceSchema = useInstanceSchemas();
  const registry = useMemo(() => applicationRegistry(), []);
  const entities = useMemo(() => indexEntities(house), [house]);
  const refs = selection.map((id) => entities.get(id)).filter((ref) => ref !== undefined);
  const first = refs[0];
  const sameKind =
    first !== undefined &&
    refs.every(
      (ref) =>
        ref.kind === first.kind &&
        schemaForEntity(ref, instanceSchema) === schemaForEntity(first, instanceSchema),
    );
  // A selection of different types shows the properties they share (Phase 5.7).
  const schema =
    first === undefined
      ? undefined
      : sameKind
        ? schemaForEntity(first, instanceSchema)
        : sharedSchema(refs.map((ref) => schemaForEntity(ref, instanceSchema)));
  const values = refs.map((ref) => ref.value);
  // The header is the selection's name: the object's own name, else its kind; several items are counted.
  const nameOf = (ref: (typeof refs)[number]): string => {
    const value: unknown = ref.value;
    return typeof value === "object" && value !== null && "name" in value && typeof value.name === "string"
      ? value.name
      : kindLabel(ref);
  };
  const title =
    first === undefined
      ? "Properties"
      : refs.length > 1 && sameKind
        ? `${String(refs.length)} × ${kindLabel(first)}`
        : refs.length > 1
          ? `${String(refs.length)} items: ${mixedSummary(refs.map(kindLabel))}`
          : nameOf(first);
  return (
    <PropertyPanel
      title={title}
      schema={schema}
      value={first?.value}
      mixedPointers={refs.length > 1 ? mixedPointers(values) : undefined}
      registry={registry}
      projectUnit={house.units}
      emptyMessage={
        refs.length > 1 && !sameKind
          ? "These items share no properties that can be edited together."
          : "Select something in the tree or the view to see its properties."
      }
      onCommit={(path, value) => {
        const label = `Change ${path[path.length - 1] ?? "property"}`;
        const outcome = session.execute(
          setPropertyCommand(
            house,
            refs.map((ref) => ref.id),
            path,
            value,
            label,
          ),
        );
        return outcome.ok;
      }}
      headerActions={first === undefined ? undefined : <SelectionActions refs={refs} />}
      after={first === undefined ? undefined : <SelectionDetails refs={refs} />}
    />
  );
};
