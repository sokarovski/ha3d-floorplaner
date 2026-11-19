// The visible, editable properties of an object (x-homeplan hidden/visibleWhen, D18).
import { readAnnotation } from "@shared/domain/schemas/annotations";
import { isVisible, objectProperties, resolveEditorName } from "@shared/domain/schemas/schemaWalk";
import type { PropertyEntry, SchemaNode } from "@shared/domain/schemas/schemaWalk";

export const visibleEntries = (node: SchemaNode, owner: unknown): readonly PropertyEntry[] =>
  objectProperties(node).filter(
    (entry) =>
      isVisible(entry.annotation, owner) && resolveEditorName(entry.node, entry.annotation) !== undefined,
  );

export const isGroupNode = (entry: PropertyEntry): boolean =>
  resolveEditorName(entry.node, entry.annotation) === "group";

export const nodeAnnotation = readAnnotation;

const sectionEditors: ReadonlySet<string> = new Set(["material", "materialChoice", "location"]);

/**
 * Composite editors (several fields of their own) are sections (Phase 19.7): their title is a bold section
 * heading with space above, so stacked materials (a roof's top, underside and sides) read as separate blocks.
 */
export const isSectionEditor = (editorName: string | undefined): boolean =>
  editorName !== undefined && sectionEditors.has(editorName);
