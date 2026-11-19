import type { ReactElement } from "react";
import { Button } from "../../../design-system/components/Button/Button";

export const ButtonStatesExample = (): ReactElement => (
  <>
    <Button disabled>Disabled</Button>
    <Button busy>Saving</Button>
    <Button size="sm" variant="secondary">
      Small
    </Button>
  </>
);
