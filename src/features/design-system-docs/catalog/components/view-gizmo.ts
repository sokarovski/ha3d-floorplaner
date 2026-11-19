import type { ComponentDoc } from "../docTypes";
import { ViewGizmoExample } from "../../examples/ViewGizmoExample";
import ViewGizmoExampleSource from "../../examples/ViewGizmoExample.tsx?raw";
import styleSource from "../../../../design-system/components/ViewGizmo/viewgizmo.tw.css?raw";

export const viewGizmoDoc: ComponentDoc = {
  slug: "view-gizmo",
  name: "ViewGizmo",
  category: "Navigation",
  purpose:
    "A small orientation tripod showing how the red (X), green (Y), and blue (Z) axes sit in the current view; axes pointing away are drawn behind and dimmer.",
  importPath: "src/design-system/components/ViewGizmo/ViewGizmo",
  whenToUse:
    "In a 2D/3D viewport corner, fed from the camera (the caller projects the axes). With onAxis, the tips are buttons, for example Z for the top view and X/Y to look along that axis.",
  props: [
    {
      name: "axes",
      type: "readonly ViewGizmoAxis[]",
      required: true,
      description: "The three axes projected to the screen: { axis, dx, dy (−1…1, y down), behind }.",
    },
    {
      name: "north",
      type: "{ dx: number; dy: number }",
      required: false,
      description: "North on screen, drawn as an N on the rim (hidden when it points at the viewer).",
    },
    {
      name: "label",
      type: "string",
      required: false,
      defaultValue: '"View orientation"',
      description: "Accessible name of the group.",
    },
    {
      name: "onAxis",
      type: '(axis: "x" | "y" | "z") => void',
      required: false,
      description: "Makes the tips buttons with tooltips; without it they are labels only.",
    },
  ],
  examples: [
    {
      id: "view-gizmo-views",
      title: "Top view and an interactive 3D view",
      Example: ViewGizmoExample,
      source: ViewGizmoExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  related: ["tooltip", "icon-button"],
};
