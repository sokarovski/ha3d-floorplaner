import type { ReactElement } from "react";
import Type from "typebox";
import { hp } from "@shared/domain/schemas/annotations";
import { readAnnotation } from "@shared/domain/schemas/annotations";
import { isSchemaNode } from "@shared/domain/schemas/schemaWalk";
import type { PropertyEditorProps } from "../../../design-system/property-editors/editorContract";
import { MultiSelectPropEditor } from "../../../design-system/property-editors/MultiSelectPropEditor/MultiSelectPropEditor";
import { SelectPropEditor } from "../../../design-system/property-editors/SelectPropEditor/SelectPropEditor";
import { useDomainEditorData } from "./domainEditorData";

export const ReferencePropEditor = (props: PropertyEditorProps): ReactElement => {
  const data = useDomainEditorData();
  const options = data.referenceOptions(props.annotation.referenceKind ?? "", props.owner);
  const choices = options.map((option) => ({ const: option.id, title: option.label }));
  const schema: object =
    props.annotation.multiple === true
      ? Type.Unsafe<string[]>({
          type: "array",
          title: props.label,
          items: { anyOf: choices.length === 0 ? [{ const: "", title: "—" }] : choices },
          ...hp({ editor: "multiSelect" }),
        })
      : Type.Unsafe<string>({
          title: props.label,
          anyOf: choices.length === 0 ? [{ const: "", title: "—" }] : choices,
          ...hp({ editor: "select", searchable: choices.length > 12 }),
        });
  if (!isSchemaNode(schema)) return <span>—</span>;
  return props.annotation.multiple === true ? (
    <MultiSelectPropEditor {...props} schema={schema} annotation={readAnnotation(schema)} />
  ) : (
    <SelectPropEditor {...props} schema={schema} annotation={readAnnotation(schema)} />
  );
};
