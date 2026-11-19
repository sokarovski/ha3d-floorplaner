import type { ReactElement } from "react";
import { IconButton } from "../../../design-system/components/IconButton/IconButton";
import { Panel } from "../../../design-system/components/Panel/Panel";

export const PanelExample = (): ReactElement => (
  <div data-ds-example-box="">
    <Panel title="Properties" actions={<IconButton icon="close" label="Close panel" size="sm" />}>
      <p>Panel body content scrolls when it is taller than the panel.</p>
    </Panel>
  </div>
);
