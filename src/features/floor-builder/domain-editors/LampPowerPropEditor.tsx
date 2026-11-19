import type { ReactElement } from "react";
import Type from "typebox";
import { hp, readAnnotation } from "@shared/domain/schemas/annotations";
import { isSchemaNode, valueAtPath } from "@shared/domain/schemas/schemaWalk";
import { isLampType, lampTypeInfo, lumensForWatts, presetLabel } from "@shared/domain/lighting/lampTypes";
import type { LampPreset } from "@shared/domain/lighting/lampTypes";
import type { PropertyEditorProps } from "../../../design-system/property-editors/editorContract";
import { SelectPropEditor } from "../../../design-system/property-editors/SelectPropEditor/SelectPropEditor";

export const LampPowerPropEditor = (props: PropertyEditorProps): ReactElement => {
  const type = valueAtPath(props.owner, ["lampType"]);
  const presets: readonly LampPreset[] = isLampType(type) ? lampTypeInfo[type].presets : [];
  const current = typeof props.value === "number" && isLampType(type) ? props.value : undefined;
  const listed =
    current === undefined || presets.some((preset) => preset.watts === current)
      ? presets
      : [...presets, { watts: current, lumens: isLampType(type) ? lumensForWatts(type, current) : 0 }].sort(
          (a, b) => a.watts - b.watts,
        );
  const choices =
    listed.length === 0
      ? [{ const: "", title: "Choose a lamp type first" }]
      : listed.map((preset) => ({ const: String(preset.watts), title: presetLabel(preset) }));
  const schema: object = Type.Unsafe<string>({
    title: props.label,
    anyOf: choices,
    ...hp({ editor: "select" }),
  });
  if (!isSchemaNode(schema)) return <span>—</span>;
  return (
    <SelectPropEditor
      {...props}
      schema={schema}
      annotation={readAnnotation(schema)}
      value={current === undefined ? undefined : String(current)}
      disabled={props.disabled || listed.length === 0}
      onCommit={(next) => {
        const watts = typeof next === "string" ? Number(next) : Number.NaN;
        return Number.isFinite(watts) && watts > 0 ? props.onCommit(watts) : false;
      }}
    />
  );
};
