import type { Key } from "react-aria-components";
import type { Choice } from "@shared/domain/schemas/schemaWalk";

/** Selected keys in the schema's choice order. */
export const orderedSelection = (keys: Set<Key>, choices: readonly Choice[]): readonly string[] =>
  choices.filter((choice) => keys.has(choice.value)).map((choice) => choice.value);
