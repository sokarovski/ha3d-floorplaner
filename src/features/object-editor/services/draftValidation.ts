// Validates the draft metadata against the asset's nodes and materials before saving a version.
import type { TemplateDraftValue } from "@shared/contracts/templates";
import { validateTemplateMetadata } from "@shared/domain/templates/metadata";
import type { TemplateAssetSummary, TemplateMetadata } from "@shared/domain/templates/metadata";
import { metadataFormSchema } from "@shared/domain/templates/metadataForm";
import type { SchemaNode } from "@shared/domain/schemas/schemaWalk";
import type { DraftContent } from "../stores/templateDraftStore";

/** What validation needs to know about the draft's asset, with the draft's own node rules. */
export const draftSummary = (draft: TemplateDraftValue, content: DraftContent): TemplateAssetSummary => ({
  nodeNames: draft.nodes.map((node) => node.name),
  materialNames: draft.materials,
  nodeRules: { ...content.nodeRules },
});

export const draftIssues = (draft: TemplateDraftValue, content: DraftContent): readonly string[] =>
  validateTemplateMetadata(content.metadata, draftSummary(draft, content)).issues.map(
    (issue) => `${issue.pointer === "" ? "" : `${issue.pointer}: `}${issue.message}`,
  );

let lastSchema: Readonly<{ key: string; schema: SchemaNode }> | undefined;

/**
 * The metadata panel schema of a draft (its own slots and formulas, Phase 9.1), rebuilt only when the slot names,
 * formula names, or asset materials change, so the form keeps a stable schema while values are edited.
 */
export const draftMetadataSchema = (
  metadata: TemplateMetadata,
  materialNames: readonly string[],
): SchemaNode => {
  const key = JSON.stringify([
    Object.keys(metadata.materialSlots),
    Object.keys(metadata.formulas ?? {}),
    materialNames,
  ]);
  if (lastSchema?.key !== key) lastSchema = { key, schema: metadataFormSchema(metadata, materialNames) };
  return lastSchema.schema;
};
