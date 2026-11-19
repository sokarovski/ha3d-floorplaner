// The property editor contract (spec/builder/property-system.md#editor-contract).
import type { ComponentType } from "react";
import type { EditorName, XHomeplan } from "@shared/domain/schemas/annotations";
import type { LengthUnit } from "@shared/domain/schemas/house";
import type { SchemaNode } from "@shared/domain/schemas/schemaWalk";

/** true when the value was accepted; false keeps the editor's draft (e.g. a rejected domain command). */
export type CommitResult = boolean;

export type PropertyEditorProps = Readonly<{
  /** DOM id for the control; the field label points at it. */
  id: string;
  /** Visible label (also used for accessible names of composite parts). */
  label: string;
  /** IDs for aria-describedby (error, description). */
  describedBy?: string;
  schema: SchemaNode;
  annotation: XHomeplan;
  value: unknown;
  /** The object that owns this property (for sibling-dependent editors). */
  owner: unknown;
  projectUnit: LengthUnit;
  disabled: boolean;
  mixed: boolean;
  required: boolean;
  error?: string;
  onPreview?: (value: unknown) => void;
  onCommit: (value: unknown) => CommitResult;
}>;

export type PropertyEditorComponent = ComponentType<PropertyEditorProps>;

export type PropertyEditorRegistry = Readonly<Partial<Record<EditorName, PropertyEditorComponent>>>;
