// Object group (spec/builder/features/object-groups.md): a named set of an area's floor objects that is
// selected, moved, and turned as one; every member keeps its own placement and template.
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "./annotations";
import { propertyGroups } from "./propertyGroups";
import { Hidden, Id, Name } from "./values";

export const ObjectGroup = Type.Object(
  {
    id: Id,
    name: Name(),
    memberIds: Type.Array(Type.String(), {
      title: "Members",
      uniqueItems: true,
      minItems: 2,
      ...hp({ editor: "reference", referenceKind: "object", multiple: true, group: "general", order: 1 }),
    }),
    hidden: Hidden,
  },
  {
    additionalProperties: false,
    title: "Object group",
    ...hp({ groups: propertyGroups("general").groups }),
  },
);

export type ObjectGroupValue = Static<typeof ObjectGroup>;
