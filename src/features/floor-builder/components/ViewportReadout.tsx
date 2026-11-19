import type { ReactElement } from "react";
import type { Readout } from "../tools/toolTypes";

type ViewportReadoutProps = Readonly<{
  readout: Readout | undefined;
  hint: string;
}>;

export const ViewportReadout = ({ readout, hint }: ViewportReadoutProps): ReactElement => (
  <>
    {readout === undefined ? null : (
      <output
        data-viewport-readout=""
        aria-live="polite"
        data-readout-x={Math.round(readout.screen.x)}
        ref={(element) => {
          if (element !== null) {
            element.style.setProperty("--readout-x", `${String(Math.round(readout.screen.x + 16))}px`);
            element.style.setProperty("--readout-y", `${String(Math.round(readout.screen.y + 16))}px`);
          }
        }}
      >
        {readout.text}
      </output>
    )}
    {hint === "" ? null : <div data-viewport-hint="">{hint}</div>}
  </>
);
