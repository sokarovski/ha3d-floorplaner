import { useState } from "react";
import type { ReactElement } from "react";
import { SwatchPicker } from "../../../design-system/components/SwatchPicker/SwatchPicker";
import type { SwatchOption } from "../../../design-system/components/SwatchPicker/SwatchPicker";

const finishes: readonly SwatchOption[] = [
  { id: "oak", label: "Oak", color: [196, 154, 108], textured: true },
  { id: "wenge", label: "Wenge", color: [72, 52, 40] },
  { id: "white", label: "White", color: [246, 246, 244] },
  { id: "color", label: "Own colour", color: null },
];

export const SwatchPickerExample = (): ReactElement => {
  const [finish, setFinish] = useState("oak");
  return (
    <div data-ds-example-column="">
      <SwatchPicker label="Door finish" options={finishes} value={finish} onChange={setFinish} />
      <span>Chosen: {finish}</span>
      <SwatchPicker label="Mixed finish" options={finishes} value={null} onChange={setFinish} />
      <SwatchPicker label="Disabled finish" options={finishes} value="white" disabled onChange={setFinish} />
    </div>
  );
};
