import type { ReactElement } from "react";
import { schemaGroups, schemaTitle, valueAtPath } from "@shared/domain/schemas/schemaWalk";
import type { PropertyEntry, SchemaNode } from "@shared/domain/schemas/schemaWalk";
import { isGroupNode, visibleEntries } from "../fieldLayout";
import type { SchemaFormContext } from "../schemaFormTypes";
import { PropertyGroup } from "../PropertyGroup/PropertyGroup";
import { SchemaField } from "../SchemaField/SchemaField";

type SchemaFieldListProps = Readonly<{
  node: SchemaNode;
  owner: unknown;
  path: readonly string[];
  grouped: boolean;
  context: SchemaFormContext;
}>;

/** One editable item: the property, the object it belongs to, and its full path. */
type FieldItem = Readonly<{ entry: PropertyEntry; owner: unknown; path: readonly string[] }>;

/**
 * A group: one form editor bound to one object (owner, Phase 5 follow-up). The panel is a flat list of
 * groups, each a list of editable items; a nested object is its own group bound to that object, never a
 * box inside another group.
 */
type GroupBlock = Readonly<{
  key: string;
  /** The catalog group ID (collapse memory); sub-object groups use their path. */
  collapseId: string;
  title: string | undefined;
  items: readonly FieldItem[];
}>;

/** The groups of one object: its declared groups, its loose fields, then one group per nested object. */
const collectGroups = (
  node: SchemaNode,
  owner: unknown,
  path: readonly string[],
  looseTitle: string | undefined,
  grouped: boolean,
): GroupBlock[] => {
  const entries = visibleEntries(node, owner);
  const plain = entries.filter((entry) => !isGroupNode(entry));
  const objects = entries.filter(isGroupNode);
  const declared = grouped ? schemaGroups(node) : [];
  const item = (entry: PropertyEntry): FieldItem => ({ entry, owner, path: [...path, entry.key] });
  const base = path.join("/");
  const blocks: GroupBlock[] = [];
  const loose = plain.filter((entry) => !declared.some((group) => group.id === entry.annotation.group));
  if (loose.length > 0)
    blocks.push({
      key: `${base}#loose`,
      collapseId: base === "" ? "_" : base,
      title: looseTitle,
      items: loose.map(item),
    });
  for (const group of declared) {
    const inGroup = plain.filter((entry) => entry.annotation.group === group.id);
    if (inGroup.length > 0)
      blocks.push({
        key: `${base}#${group.id}`,
        collapseId: base === "" ? group.id : `${base}#${group.id}`,
        title: group.title,
        items: inGroup.map(item),
      });
  }
  // Each nested object is its own group(s), placed after the group it is declared in.
  for (const entry of objects) {
    const child = valueAtPath(owner, [entry.key]);
    const nested = collectGroups(
      entry.node,
      child,
      [...path, entry.key],
      schemaTitle(entry.node, entry.key),
      true,
    );
    const after = blocks.findLastIndex((block) => block.key === `${base}#${entry.annotation.group ?? ""}`);
    if (after < 0) blocks.push(...nested);
    else blocks.splice(after + 1, 0, ...nested);
  }
  return blocks;
};

const isInline = (item: FieldItem): boolean => item.entry.annotation.inlineLabel !== undefined;

export const SchemaFieldList = ({
  node,
  owner,
  path,
  grouped,
  context,
}: SchemaFieldListProps): ReactElement => {
  const blocks = collectGroups(node, owner, path, undefined, grouped);
  return (
    <>
      {blocks.map((block) => {
        // A group with one item is titled by that item and shows no second label ("Flooring").
        const single = block.title !== undefined && block.items.length === 1 ? block.items[0] : undefined;
        // Consecutive items with inline labels (W, D, …) share one row, labelled with their titles (Phase 5.8).
        const runs: FieldItem[][] = [];
        for (const item of block.items) {
          const last = runs[runs.length - 1];
          if (isInline(item) && last?.length === 1 && last.every(isInline)) last.push(item);
          else runs.push([item]);
        }
        const fields = runs.map((run) => {
          const [item] = run;
          if (item === undefined) return null;
          if (run.length > 1)
            return (
              <div key={run.map((part) => part.path.join("/")).join("+")} data-schema-field-pair="">
                <span data-schema-field-pair-label="" aria-hidden="true">
                  {run.map((part) => schemaTitle(part.entry.node, part.entry.key)).join(" × ")}
                </span>
                <div data-schema-field-pair-fields="">
                  {run.map((part) => (
                    <SchemaField
                      key={part.path.join("/")}
                      entry={part.entry}
                      owner={part.owner}
                      path={part.path}
                      context={context}
                      labelHidden
                    />
                  ))}
                </div>
              </div>
            );
          return (
            <SchemaField
              key={item.path.join("/")}
              entry={item.entry}
              owner={item.owner}
              path={item.path}
              context={context}
              labelHidden={item === single}
            />
          );
        });
        return block.title === undefined ? (
          <div key={block.key} data-schema-fields="">
            {fields}
          </div>
        ) : (
          <PropertyGroup
            key={block.key}
            title={single === undefined ? block.title : schemaTitle(single.entry.node, single.entry.key)}
            groupId={block.collapseId}
          >
            {fields}
          </PropertyGroup>
        );
      })}
    </>
  );
};
