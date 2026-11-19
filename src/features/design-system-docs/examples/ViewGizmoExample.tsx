import { useState } from "react";
import type { ReactElement } from "react";
import { ViewGizmo } from "../../../design-system/components/ViewGizmo/ViewGizmo";
import type { ViewGizmoAxis } from "../../../design-system/components/ViewGizmo/ViewGizmo";

// Top view: red right, green up, blue toward the viewer (a dot at the centre).
const topAxes: readonly ViewGizmoAxis[] = [
  { axis: "x", dx: 1, dy: 0, behind: false },
  { axis: "y", dx: 0, dy: -1, behind: false },
  { axis: "z", dx: 0, dy: 0, behind: false },
];

// The builder's default 3D view (orbited about 30°, looking down about 35°).
const obliqueAxes: readonly ViewGizmoAxis[] = [
  { axis: "x", dx: 0.86, dy: 0.29, behind: false },
  { axis: "y", dx: 0.52, dy: -0.47, behind: true },
  { axis: "z", dx: 0, dy: -0.82, behind: false },
];

export const ViewGizmoExample = (): ReactElement => {
  const [pressed, setPressed] = useState<string>("none");
  return (
    <div data-ds-example-gizmo="">
      <ViewGizmo axes={topAxes} north={{ dx: 0, dy: -1 }} label="Top view orientation" />
      <ViewGizmo
        axes={obliqueAxes}
        north={{ dx: 0.52, dy: -0.47 }}
        label="3D view orientation"
        onAxis={(axis) => {
          setPressed(axis.toUpperCase());
        }}
      />
      <p>Last axis pressed: {pressed}</p>
    </div>
  );
};
