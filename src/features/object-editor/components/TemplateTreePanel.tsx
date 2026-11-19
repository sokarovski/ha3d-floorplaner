import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { useStore } from "zustand";
import { Panel } from "../../../design-system/components/Panel/Panel";
import { Tree } from "../../../design-system/components/Tree/Tree";
import { TreeItem } from "../../../design-system/components/TreeItem/TreeItem";
import type { TemplateDraftStore } from "../stores/templateDraftStore";
import { TemplateNodeRows } from "./TemplateNodeRows";

type TemplateTreePanelProps = Readonly<{
  draft: TemplateDraftStore;
}>;

export const TemplateTreePanel = ({ draft }: TemplateTreePanelProps): ReactElement => {
  const nodes = useStore(draft.store, (state) => state.draft.nodes);
  const roots = useStore(draft.store, (state) => state.draft.rootNodes);
  const label = useStore(draft.store, (state) => state.content.label);
  const selected = useStore(draft.store, (state) => state.selected);
  const nodeRules = useStore(draft.store, (state) => state.content.nodeRules);
  const ruled = useMemo(() => new Set(Object.keys(nodeRules)), [nodeRules]);
  const [expanded, setExpanded] = useState<readonly string[]>([
    "template",
    ...nodes.map((node) => node.name),
  ]);
  return (
    <Panel title="Template" padded={false}>
      <Tree
        label="Template nodes"
        selectedIds={[selected === "" ? "template" : selected]}
        expandedIds={expanded}
        onExpandedChange={setExpanded}
        onSelectionChange={(ids) => {
          const id = ids[0];
          if (id !== undefined) draft.store.setState({ selected: id === "template" ? "" : id });
        }}
      >
        <TreeItem id="template" label={label} icon="cube">
          <TemplateNodeRows nodes={nodes} indices={roots} ruled={ruled} />
        </TreeItem>
      </Tree>
    </Panel>
  );
};
