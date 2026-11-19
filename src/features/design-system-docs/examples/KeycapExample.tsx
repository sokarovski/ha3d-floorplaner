import type { ReactElement } from "react";
import { Keycap } from "../../../design-system/components/Keycap/Keycap";

export const KeycapExample = (): ReactElement => (
  <div data-ds-example-stage="">
    <Keycap>⌘K</Keycap>
    <Keycap>Esc</Keycap>
    <Keycap aria-label="Shift">⇧</Keycap>
  </div>
);
