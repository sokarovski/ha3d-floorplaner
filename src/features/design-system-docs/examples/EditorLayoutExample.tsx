import type { ReactElement } from "react";
import { EditorLayout } from "../../../design-system/components/EditorLayout/EditorLayout";
import { Panel } from "../../../design-system/components/Panel/Panel";
import { ToolButton } from "../../../design-system/components/ToolButton/ToolButton";
import { Toolbox } from "../../../design-system/components/Toolbox/Toolbox";

export const EditorLayoutExample = (): ReactElement => (
  <div data-ds-example-layout="">
    <EditorLayout
      header={<div data-ds-example-placeholder="">Header: house name, save status</div>}
      toolbox={
        <Toolbox label="Tools">
          <ToolButton icon="pointer" label="Select" active onPress={() => undefined} />
          <ToolButton icon="rectangle" label="Rectangle" onPress={() => undefined} />
        </Toolbox>
      }
      viewport={<div data-ds-example-placeholder="">Viewport</div>}
      overview={<Panel title="House">Tree</Panel>}
      properties={<Panel title="Properties">Property panel</Panel>}
      status={<div data-ds-example-placeholder="">Status bar</div>}
    />
  </div>
);
