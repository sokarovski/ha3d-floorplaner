import { useId, useState } from "react";
import type { ReactElement } from "react";
import type { EditorName } from "@shared/domain/schemas/annotations";
import { readAnnotation } from "@shared/domain/schemas/annotations";
import type { LengthUnit } from "@shared/domain/schemas/house";
import { isSchemaNode, schemaTitle } from "@shared/domain/schemas/schemaWalk";
import { FormField } from "../../../design-system/components/FormField/FormField";
import type { PropertyEditorRegistry } from "../../../design-system/property-editors/editorContract";
import { describeCommit } from "../services/commitLog";

type EditorStatesProps = Readonly<{
  editor: EditorName;
  registry: PropertyEditorRegistry;
  schema: object;
  validValue: unknown;
  owner?: unknown;
  invalidMessage?: string;
  projectUnit?: LengthUnit;
}>;

export const EditorStates = ({
  editor,
  registry,
  schema,
  validValue,
  owner,
  invalidMessage = "Must be at least the minimum.",
  projectUnit = "mm",
}: EditorStatesProps): ReactElement => {
  const baseId = useId();
  const [value, setValue] = useState<unknown>(validValue);
  const [unit, setUnit] = useState<LengthUnit>(projectUnit);
  const [log, setLog] = useState<readonly string[]>([]);
  const Editor = registry[editor];
  if (Editor === undefined || !isSchemaNode(schema)) return <p>Editor “{editor}” is not registered.</p>;
  const annotation = readAnnotation(schema);
  const label = schemaTitle(schema, editor);
  const states: readonly Readonly<{
    key: string;
    title: string;
    value: unknown;
    mixed: boolean;
    disabled: boolean;
    error?: string;
    live: boolean;
  }>[] = [
    { key: "live", title: "Live (try it)", value, mixed: false, disabled: false, live: true },
    { key: "empty", title: "Empty", value: undefined, mixed: false, disabled: false, live: false },
    {
      key: "invalid",
      title: "Invalid",
      value: validValue,
      mixed: false,
      disabled: false,
      error: invalidMessage,
      live: false,
    },
    { key: "mixed", title: "Mixed", value: undefined, mixed: true, disabled: false, live: false },
    {
      key: "disabled",
      title: "Disabled / read-only",
      value: validValue,
      mixed: false,
      disabled: true,
      live: false,
    },
  ];
  return (
    <div data-ds-editor-states="">
      <div data-ds-editor-unit="">
        <span>Project unit:</span>
        {(["mm", "cm", "m", "in", "ft"] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={unit === candidate}
            data-ds-unit-button=""
            onClick={() => {
              setUnit(candidate);
            }}
          >
            {candidate}
          </button>
        ))}
      </div>
      {states.map((state) => (
        <FormField
          key={state.key}
          label={state.title}
          htmlFor={`${baseId}-${state.key}`}
          layout="inline"
          error={state.error}
          errorId={`${baseId}-${state.key}-error`}
        >
          <Editor
            id={`${baseId}-${state.key}`}
            label={label}
            schema={schema}
            annotation={annotation}
            value={state.value}
            owner={owner}
            projectUnit={unit}
            disabled={state.disabled}
            mixed={state.mixed}
            required={false}
            error={state.error}
            onPreview={
              state.live
                ? (next: unknown) => {
                    setLog((current) => [`preview ${describeCommit(next)}`, ...current].slice(0, 8));
                  }
                : undefined
            }
            onCommit={(next: unknown) => {
              if (state.live) {
                setValue(next);
                setLog((current) => [`commit ${describeCommit(next)}`, ...current].slice(0, 8));
              }
              return true;
            }}
          />
        </FormField>
      ))}
      <div data-ds-commit-log="" aria-live="polite">
        <strong>Events (live row):</strong>
        {log.length === 0 ? <span> none yet. Type and press Enter, or Escape to revert.</span> : null}
        <ul>
          {log.map((line, index) => (
            <li key={`${String(index)}-${line}`}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};
