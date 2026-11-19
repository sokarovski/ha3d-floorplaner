import type { ReactElement } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Tooltip } from "../Tooltip/Tooltip";

/** One axis projected to the screen: direction in gizmo units (−1…1, y down) and whether it points away. */
export type ViewGizmoAxis = Readonly<{ axis: "x" | "y" | "z"; dx: number; dy: number; behind: boolean }>;

type ViewGizmoProps = Readonly<{
  /** The three axes as seen from the current camera. */
  axes: readonly ViewGizmoAxis[];
  /** Where north points on screen (same units), drawn as an "N" on the rim. */
  north?: Readonly<{ dx: number; dy: number }>;
  /** Accessible name of the gizmo group. */
  label?: string;
  /** Makes the axis tips buttons (for example: Z for the top view, X/Y to look along that axis). */
  onAxis?: (axis: ViewGizmoAxis["axis"]) => void;
}>;

const sizePx = 72;
const center = sizePx / 2;
const lengthPx = 21;
const rimPx = 31;
const tipPx = 16;
const tipNames: Readonly<Record<ViewGizmoAxis["axis"], string>> = {
  x: "Red axis (X)",
  y: "Green axis (Y)",
  z: "Blue axis (Z)",
};

export const ViewGizmo = ({
  axes,
  north,
  label = "View orientation",
  onAxis,
}: ViewGizmoProps): ReactElement => {
  // Axes pointing away from the viewer draw first and dimmer, so the nearer ones stay on top.
  const ordered = [...axes].sort((a, b) => Number(b.behind) - Number(a.behind));
  return (
    <div data-view-gizmo="" role="group" aria-label={label}>
      <svg viewBox={`0 0 ${String(sizePx)} ${String(sizePx)}`}>
        {ordered.map((axis) => (
          <g key={axis.axis} data-axis={axis.axis} data-behind={axis.behind ? "" : undefined}>
            <line
              data-view-gizmo-stub=""
              x1={center}
              y1={center}
              x2={center - axis.dx * lengthPx * 0.4}
              y2={center - axis.dy * lengthPx * 0.4}
            />
            <line
              data-view-gizmo-line=""
              x1={center}
              y1={center}
              x2={center + axis.dx * lengthPx}
              y2={center + axis.dy * lengthPx}
            />
          </g>
        ))}
        {north === undefined || Math.hypot(north.dx, north.dy) < 0.2 ? null : (
          <text
            data-view-gizmo-north=""
            x={center + (north.dx / Math.hypot(north.dx, north.dy)) * rimPx}
            y={center + (north.dy / Math.hypot(north.dx, north.dy)) * rimPx}
          >
            N
          </text>
        )}
        {ordered.map((axis) => {
          const x = center + axis.dx * lengthPx - tipPx / 2;
          const y = center + axis.dy * lengthPx - tipPx / 2;
          const letter = axis.axis.toUpperCase();
          return (
            <foreignObject key={axis.axis} x={x} y={y} width={tipPx} height={tipPx}>
              {onAxis === undefined ? (
                <span data-view-gizmo-tip="" data-axis={axis.axis} data-behind={axis.behind ? "" : undefined}>
                  {letter}
                </span>
              ) : (
                <Tooltip content={tipNames[axis.axis]}>
                  <AriaButton
                    data-view-gizmo-tip=""
                    data-axis={axis.axis}
                    data-behind={axis.behind ? "" : undefined}
                    aria-label={tipNames[axis.axis]}
                    onPress={() => {
                      onAxis(axis.axis);
                    }}
                  >
                    {letter}
                  </AriaButton>
                </Tooltip>
              )}
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
};
