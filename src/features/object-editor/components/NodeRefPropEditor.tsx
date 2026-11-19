import type { ReactElement } from "react";
import Type from "typebox";
import { hp, readAnnotation } from "@shared/domain/schemas/annotations";
import { isSchemaNode } from "@shared/domain/schemas/schemaWalk";
import type { PropertyEditorProps } from "../../../design-system/property-editors/editorContract";
import { SelectPropEditor } from "../../../design-system/property-editors/SelectPropEditor/SelectPropEditor";
import { useNodeRefOptions } from "../services/nodeRefData";

export const NodeRefPropEditor = (props: PropertyEditorProps): ReactElement => {
  const nodes = useNodeRefOptions();
  const contact = props.annotation.group === "attachment";
  const choices = [
    ...(contact
      ? [
          { const: "back", title: "Back face" },
          { const: "bottom", title: "Bottom face" },
          { const: "top", title: "Top face" },
        ]
      : [{ const: "", title: "—" }]),
    ...nodes.map((name) => ({ const: name, title: `Node: ${name}` })),
  ];
  const schema: object = Type.Unsafe<string>({
    title: props.label,
    anyOf: choices,
    ...hp({ editor: "select", searchable: choices.length > 12 }),
  });
  return isSchemaNode(schema) ? (
    <SelectPropEditor {...props} schema={schema} annotation={readAnnotation(schema)} />
  ) : (
    <span>—</span>
  );
};
