// Public contract of the Object Editor's template preview runtime (spec/builder/screens/object-editor.md).
import type { NodeRule, TemplateMetadata, TemplateParameterValue } from "@shared/domain/templates/metadata";
import type { TemplateSizeMm } from "@shared/geometry/templateResize";
import type { HelperTheme, NavigationMode } from "./runtimeTypes";

export type TemplatePreviewInput = Readonly<{
  /** glTF/GLB URL: the draft's base glTF or a saved version. */
  url: string;
  /**
   * Column-major 4 × 4 normalization matrix applied to the loaded scene root. Pass the draft's rootMatrix
   * for the base glTF (which has no HomeplanRoot wrapper); omit it for saved versions, which carry it.
   */
  rootMatrix?: readonly number[];
  metadata: TemplateMetadata;
  /** Draft node rules by node name; the nearest ancestor-or-self rule applies. */
  nodeRules: Readonly<Record<string, NodeRule>>;
  parameters: Readonly<Record<string, TemplateParameterValue>>;
  flip: Readonly<{ x: boolean; z: boolean }>;
  /** Reference wall depth for Wallable templates (fitHostDepth, opening cut); default 200 mm. */
  hostDepthMm?: number;
}>;

export type TemplatePreviewEvent =
  | Readonly<{ type: "unsupported"; reason: string }>
  | Readonly<{ type: "loading"; url: string }>
  | Readonly<{ type: "loadError"; url: string; message: string }>
  /** After every rebuild: the resized size, or the resize issues. */
  | Readonly<{ type: "resized"; ok: true; sizeMm: TemplateSizeMm }>
  | Readonly<{ type: "resized"; ok: false; issues: readonly string[] }>
  /** A click on the model (no drag): the picked node, or null for empty space. */
  | Readonly<{ type: "pick"; nodeName: string | null }>;

export type TemplatePreviewOptions = Readonly<{
  container: HTMLElement;
  onEvent: (event: TemplatePreviewEvent) => void;
}>;

export type TemplatePreviewRuntime = Readonly<{
  setTemplate: (input: TemplatePreviewInput) => void;
  /** Highlights every mesh (including repeat copies) of the node; null clears it. */
  setSelectedNode: (nodeName: string | null) => void;
  setNavigation: (navigation: NavigationMode) => void;
  setTheme: (theme: HelperTheme) => void;
  frame: () => void;
  dispose: () => void;
}>;
