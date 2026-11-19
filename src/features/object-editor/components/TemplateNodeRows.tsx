import type { ReactElement } from "react";
import type { DraftNodeValue } from "@shared/contracts/templates";
import { TreeItem } from "../../../design-system/components/TreeItem/TreeItem";

type TemplateNodeRowsProps = Readonly<{
  nodes: readonly DraftNodeValue[];
  indices: readonly number[];
  ruled: ReadonlySet<string>;
}>;

export const TemplateNodeRows = ({ nodes, indices, ruled }: TemplateNodeRowsProps): ReactElement => (
  <>
    {indices.map((index) => {
      const node = nodes.find((candidate) => candidate.index === index);
      if (node === undefined) return null;
      return (
        <TreeItem
          key={node.index}
          id={node.name === "" ? `node-${String(node.index)}` : node.name}
          label={node.name === "" ? `Node ${String(node.index)}` : node.name}
          icon={node.mesh ? "cube" : "frame"}
          badge={ruled.has(node.name) ? "rule" : undefined}
        >
          {node.children.length === 0 ? undefined : (
            <TemplateNodeRows nodes={nodes} indices={node.children} ruled={ruled} />
          )}
        </TreeItem>
      );
    })}
  </>
);
