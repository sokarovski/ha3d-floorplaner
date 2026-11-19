// Typed documentation metadata for the /ds workbench (spec/design-system/workbench.md).
import type { ComponentType } from "react";

export type PropDoc = Readonly<{
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  description: string;
}>;

export type ExampleDoc = Readonly<{
  id: string;
  title: string;
  description?: string;
  Example: ComponentType;
  /** Raw source of the example file (build-time `?raw` import). */
  source: string;
  /** Optional companion files shown in the source popup. */
  companions?: readonly Readonly<{ label: string; source: string }>[];
}>;

export type ComponentDoc = Readonly<{
  slug: string;
  name: string;
  category: "Actions" | "Forms" | "Overlays" | "Navigation" | "Layout" | "Feedback" | "Property editors";
  purpose: string;
  importPath: string;
  whenToUse: string;
  props: readonly PropDoc[];
  examples: readonly ExampleDoc[];
  keyboard?: readonly string[];
  accessibility?: string;
  related?: readonly string[];
  stylesheet?: string;
}>;
