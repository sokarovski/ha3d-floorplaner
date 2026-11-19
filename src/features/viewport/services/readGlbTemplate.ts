// Reads a GLB's Homeplan metadata and node rules (playground stand-in for the Object Editor draft, which
// receives them from the server).
import { isSchemaNode } from "@shared/domain/schemas/schemaWalk";
import type { NodeRule, TemplateMetadata } from "@shared/domain/templates/metadata";
import { homeplanExtras, parseNodeRule, validateTemplateMetadata } from "@shared/domain/templates/metadata";

export type GlbTemplate = Readonly<{
  metadata: TemplateMetadata;
  nodeRules: Readonly<Record<string, NodeRule>>;
}>;

const glbJson = (buffer: ArrayBuffer): unknown => {
  const view = new DataView(buffer);
  const length = view.getUint32(12, true);
  const parsed: unknown = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
  return parsed;
};

export const readGlbTemplate = async (url: string): Promise<GlbTemplate> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} failed with ${String(response.status)}`);
  const json = glbJson(await response.arrayBuffer());
  if (!isSchemaNode(json)) throw new Error("Not a glTF document");
  const scenes = Array.isArray(json.scenes) ? json.scenes : [];
  const scene: unknown = scenes[0];
  const validation = validateTemplateMetadata(homeplanExtras(isSchemaNode(scene) ? scene.extras : undefined));
  if (validation.metadata === null) throw new Error("The template has no valid Homeplan metadata");
  const nodeRules: Record<string, NodeRule> = {};
  for (const node of Array.isArray(json.nodes) ? json.nodes : []) {
    if (!isSchemaNode(node) || typeof node.name !== "string") continue;
    const rule = parseNodeRule(homeplanExtras(node.extras)).rule;
    if (rule !== undefined) nodeRules[node.name] = rule;
  }
  return { metadata: validation.metadata, nodeRules };
};
