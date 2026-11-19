import type { ReactElement } from "react";
import { Banner } from "../../../design-system/components/Banner/Banner";
import { Button } from "../../../design-system/components/Button/Button";

export const BannerExample = (): ReactElement => (
  <div data-ds-example-column="">
    <Banner tone="info">Changes are written automatically. Press ⌘S to save a revision.</Banner>
    <Banner tone="success">Saved.</Banner>
    <Banner tone="warning">This wall needs repair: its edge is no longer on the floor boundary.</Banner>
    <Banner
      tone="danger"
      actions={
        <Button size="sm" variant="secondary">
          Retry
        </Button>
      }
    >
      The save failed. Your work is kept locally.
    </Banner>
  </div>
);
