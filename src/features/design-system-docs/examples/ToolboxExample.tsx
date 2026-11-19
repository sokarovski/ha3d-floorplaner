import { useState } from "react";
import type { ReactElement } from "react";
import { ToolButton } from "../../../design-system/components/ToolButton/ToolButton";
import { Toolbox } from "../../../design-system/components/Toolbox/Toolbox";

export const ToolboxExample = (): ReactElement => {
  const [tool, setTool] = useState("select");
  return (
    <div data-ds-example-toolbox="">
      <Toolbox
        label="Tools"
        footer={
          <>
            <ToolButton icon="lookDown" label="Look straight down (3D), then fit" onPress={() => undefined} />
            <ToolButton
              icon="rotateQuarter"
              label="Rotate the view 90° (3D), then fit"
              onPress={() => undefined}
            />
            <ToolButton icon="frame" label="Fit to screen" shortcut="F" onPress={() => undefined} />
          </>
        }
      >
        <ToolButton
          icon="pointer"
          label="Select"
          shortcut="V"
          active={tool === "select"}
          onPress={() => {
            setTool("select");
          }}
        />
        <ToolButton
          icon="rectangle"
          label="Rectangle"
          shortcut="R"
          active={tool === "rectangle"}
          onPress={() => {
            setTool("rectangle");
          }}
        />
        <ToolButton
          icon="polygon"
          label="Polygon pencil"
          shortcut="P"
          active={tool === "polygon"}
          onPress={() => {
            setTool("polygon");
          }}
        />
        <ToolButton
          icon="ruler"
          label="Measuring tape"
          shortcut="T"
          active={tool === "tape"}
          onPress={() => {
            setTool("tape");
          }}
        />
        <ToolButton icon="magnet" label="Magnetic" disabled onPress={() => undefined} />
        <ToolButton
          icon="eye"
          label="Auto-select: on while Shift is held"
          active
          temporary
          badge="⇧"
          onPress={() => undefined}
        />
      </Toolbox>
      <Toolbox label="Horizontal tools" orientation="horizontal">
        <ToolButton icon="top" label="Top view" active onPress={() => undefined} />
        <ToolButton icon="cube" label="3D view" onPress={() => undefined} />
      </Toolbox>
    </div>
  );
};
