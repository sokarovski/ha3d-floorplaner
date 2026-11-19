import type { ReactElement } from "react";
import { Button } from "../../../design-system/components/Button/Button";

export const ButtonVariantsExample = (): ReactElement => (
  <>
    <Button variant="primary">Save</Button>
    <Button variant="secondary">Cancel</Button>
    <Button variant="danger">Delete house</Button>
    <Button variant="ghost">More</Button>
  </>
);
