import type { ReactElement } from "react";
import type { ColorPairingDoc } from "../catalog/colorPairings";

type ColorPairingProps = Readonly<{
  pairing: ColorPairingDoc;
}>;

export const ColorPairing = ({ pairing }: ColorPairingProps): ReactElement => (
  <div data-ds-card="">
    <span data-ds-pairing="" data-ds-pairing-id={pairing.id}>
      {pairing.label}
    </span>
    <span data-ds-card-text="">
      {pairing.foreground} on {pairing.background}
    </span>
  </div>
);
