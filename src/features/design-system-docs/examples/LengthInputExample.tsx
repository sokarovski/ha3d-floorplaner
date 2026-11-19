import { useState } from "react";
import type { ReactElement } from "react";
import { LengthInput } from "../../../design-system/property-editors/LengthInput/LengthInput";

export const LengthInputExample = (): ReactElement => {
  const [value, setValue] = useState(2500);
  return (
    <div data-ds-example-column="">
      <LengthInput
        id="ds-length-input"
        aria-label="Height"
        value={value}
        unit="cm"
        limits={{ minimum: 1, integer: false }}
        mixed={false}
        disabled={false}
        onCommit={(next) => {
          setValue(next);
          return true;
        }}
      />
      <span>Stored: {value} mm (type 1.5m, 3ft, or 80 in)</span>
    </div>
  );
};
