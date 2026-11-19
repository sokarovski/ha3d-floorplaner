// Shared prop shapes of the schema form builder (spec/design-system/README.md#8-forms-and-popups).
import type { LengthUnit } from "@shared/domain/schemas/house";
import type { CommitResult, PropertyEditorRegistry } from "../property-editors/editorContract";

export type SchemaFormMode = "live" | "buffered";

export type SchemaFormContext = Readonly<{
  formId: string;
  mode: SchemaFormMode;
  registry: PropertyEditorRegistry;
  projectUnit: LengthUnit;
  errors: Readonly<Record<string, string>>;
  mixedPointers: ReadonlySet<string>;
  disabled: boolean;
  onCommit: (path: readonly string[], value: unknown) => CommitResult;
  onPreview?: (path: readonly string[], value: unknown) => void;
}>;

export const emptyErrors: Readonly<Record<string, string>> = {};
export const emptyMixed: ReadonlySet<string> = new Set();
