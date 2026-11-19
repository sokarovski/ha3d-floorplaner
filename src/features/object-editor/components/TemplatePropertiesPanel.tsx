import { useMemo } from "react";
import type { ReactElement } from "react";
import { useStore } from "zustand";
import { validateTemplateMetadata } from "@shared/domain/templates/metadata";
import {
  fromMetadataView,
  fromNodeRuleView,
  metadataFormErrors,
  MetadataFormView,
  nodeRuleFormErrors,
  NodeRuleFormView,
  toMetadataView,
  toNodeRuleView,
} from "@shared/domain/templates/metadataForm";
import { isSchemaNode, withValueAtPath } from "@shared/domain/schemas/schemaWalk";
import { compileValidator } from "@shared/domain/validation/ajv";
import { Banner } from "../../../design-system/components/Banner/Banner";
import { PropertyPanel } from "../../../design-system/forms/PropertyPanel/PropertyPanel";
import { draftIssues, draftMetadataSchema, draftSummary } from "../services/draftValidation";
import { objectEditorRegistry } from "../services/objectEditorRegistry";
import type { TemplateDraftStore } from "../stores/templateDraftStore";

type TemplatePropertiesPanelProps = Readonly<{
  draft: TemplateDraftStore;
}>;

export const TemplatePropertiesPanel = ({ draft }: TemplatePropertiesPanelProps): ReactElement => {
  const state = useStore(draft.store, (value) => value);
  const registry = useMemo(() => objectEditorRegistry(), []);
  const issues = draftIssues(state.draft, state.content);
  const nodeSelected = state.selected !== "";
  const view = nodeSelected
    ? toNodeRuleView(state.content.nodeRules[state.selected])
    : toMetadataView(state.content.metadata);
  // The metadata form lists the draft's own slots and formulas (Phase 9.1); rebuilt only when those change.
  const metadata = state.content.metadata;
  const metadataSchema = draftMetadataSchema(metadata, state.draft.materials);
  // Formula and reference problems show at their fields, with the validator's message (Phase 9.1).
  const validation = validateTemplateMetadata(metadata, draftSummary(state.draft, state.content));
  const errors = nodeSelected
    ? nodeRuleFormErrors(validation.issues, state.selected)
    : metadataFormErrors(validation.issues);
  return (
    <PropertyPanel
      title="Properties"
      subtitle={nodeSelected ? `Node “${state.selected}”: part rules` : "Template metadata"}
      schema={nodeSelected ? NodeRuleFormView : metadataSchema}
      value={view}
      errors={errors}
      registry={registry}
      projectUnit="mm"
      before={
        issues.length === 0 ? undefined : <Banner tone="warning">{issues.slice(0, 4).join(" · ")}</Banner>
      }
      onCommit={(path, next) => {
        const updated = withValueAtPath(view, path, next);
        if (!isSchemaNode(updated)) return false;
        if (nodeSelected) {
          const isView = compileValidator(NodeRuleFormView);
          if (!isView(updated)) return false;
          const rule = fromNodeRuleView(updated, state.content.nodeRules[state.selected]);
          const nodeRules = Object.fromEntries([
            ...Object.entries(state.content.nodeRules).filter(([name]) => name !== state.selected),
            ...(rule === undefined ? [] : [[state.selected, rule] as const]),
          ]);
          draft.edit({ ...state.content, nodeRules });
          return true;
        }
        const isView = compileValidator(MetadataFormView);
        if (!isView(updated)) return false;
        const edited = fromMetadataView(updated, state.content.metadata);
        draft.edit({ ...state.content, metadata: edited, label: edited.label });
        return true;
      }}
    />
  );
};
