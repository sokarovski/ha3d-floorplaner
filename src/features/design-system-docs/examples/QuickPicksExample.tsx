import { useState } from "react";
import type { ReactElement } from "react";
import { formatLength } from "@shared/domain/units/lengthUnits";
import { QuickPicks } from "../../../design-system/property-editors/QuickPicks/QuickPicks";

const bedWidths = [1200, 1400, 1600, 1800];

export const QuickPicksExample = (): ReactElement => {
  const [width, setWidth] = useState(1400);
  return (
    <div data-ds-example-column="">
      <QuickPicks
        label="Bed width quick picks"
        picks={bedWidths.map((value) => ({ value, text: formatLength(value, "cm") }))}
        value={width}
        disabled={false}
        onPick={setWidth}
      />
      <span>Stored: {width} mm (a value between the picks shows no chip selected)</span>
      <QuickPicks
        label="Disabled quick picks"
        picks={bedWidths.map((value) => ({ value, text: formatLength(value, "cm") }))}
        value={1600}
        disabled
        onPick={setWidth}
      />
    </div>
  );
};
