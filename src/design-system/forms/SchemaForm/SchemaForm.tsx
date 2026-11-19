import { useId } from "react";
import type { ReactElement } from "react";
import type { LengthUnit } from "@shared/domain/schemas/house";
import { isSchemaNode } from "@shared/domain/schemas/schemaWalk";
import type { CommitResult, PropertyEditorRegistry } from "../../property-editors/editorContract";
import { emptyErrors, emptyMixed } from "../schemaFormTypes";
import type { SchemaFormMode } from "../schemaFormTypes";
import { SchemaFieldList } from "../SchemaFieldList/SchemaFieldList";

type SchemaFormProps = Readonly<{
  schema: object;
  value: unknown;
  registry: PropertyEditorRegistry;
  projectUnit: LengthUnit;
  mode: SchemaFormMode;
  onCommit: (path: readonly string[], value: unknown) => CommitResult;
  onPreview?: (path: readonly string[], value: unknown) => void;
  errors?: Readonly<Record<string, string>>;
  mixedPointers?: ReadonlySet<string>;
  disabled?: boolean;
}>;

export const SchemaForm = ({
  schema,
  value,
  registry,
  projectUnit,
  mode,
  onCommit,
  onPreview,
  errors = emptyErrors,
  mixedPointers = emptyMixed,
  disabled = false,
}: SchemaFormProps): ReactElement => {
  const formId = useId();
  return (
    <div data-schema-form="" data-schema-form-live={mode === "live" ? "" : undefined}>
      {isSchemaNode(schema) ? (
        <SchemaFieldList
          node={schema}
          owner={value}
          path={[]}
          grouped
          context={{
            formId,
            mode,
            registry,
            projectUnit,
            errors,
            mixedPointers,
            disabled,
            onCommit,
            onPreview,
          }}
        />
      ) : null}
    </div>
  );
};
