import { Fragment } from "react";
import type { ReactElement } from "react";
import { ToolButton } from "../../../design-system/components/ToolButton/ToolButton";
import { Toolbox } from "../../../design-system/components/Toolbox/Toolbox";
import { useSession, useUi } from "../hooks/sessionContext";
import { toolLevelOf, toolsForMode } from "../services/toolCatalog";
import { fitToScreen, requestCameraPreset } from "../services/treeActions";

export const BuilderToolbox = (): ReactElement => {
  const session = useSession();
  const mode = useUi(toolLevelOf);
  const tool = useUi((ui) => ui.tool);
  const magnetic = useUi((ui) => ui.magnetic);
  const carpetOpen = useUi((ui) => ui.focusCarpetId !== undefined);
  const faceOpen = useUi((ui) => ui.focusWallFace !== undefined);
  const featureOpen = useUi((ui) => ui.focusReliefId !== undefined);
  const autoSelect = useUi((ui) => ui.autoSelect);
  // While Shift flips Auto-select for the next press (Nudge/Rotate, idle), show that effective state with a
  // temporary look (Phase 5.3); the stored toggle is unchanged.
  const shiftFlip = useUi((ui) => ui.autoSelectShiftFlip);
  const autoSelectShown = shiftFlip ? !autoSelect : autoSelect;
  return (
    <Toolbox
      label="Tools"
      footer={
        <>
          <ToolButton
            icon="lookDown"
            label="Look straight down (3D), then fit"
            onPress={() => {
              requestCameraPreset(session, "lookDown");
            }}
          />
          <ToolButton
            icon="rotateQuarter"
            label="Rotate the view 90° (3D), then fit"
            onPress={() => {
              requestCameraPreset(session, "turnQuarter");
            }}
          />
          <ToolButton
            icon="frame"
            label="Fit to screen"
            shortcut="F"
            onPress={() => {
              fitToScreen(session);
            }}
          />
        </>
      }
    >
      {toolsForMode(mode, carpetOpen, faceOpen, featureOpen).map((definition, index, tools) => (
        <Fragment key={definition.id}>
          {index > 0 && tools[index - 1]?.group !== definition.group ? (
            <span data-toolbox-separator="" />
          ) : null}
          <ToolButton
            icon={definition.icon}
            label={definition.label}
            shortcut={definition.shortcut}
            active={tool === definition.id}
            onPress={() => {
              session.ui.setState({ tool: definition.id });
            }}
          />
        </Fragment>
      ))}
      <span data-toolbox-separator="" />
      <ToolButton
        icon="magnet"
        label={magnetic ? "Magnetic: on" : "Magnetic: off"}
        active={magnetic}
        onPress={() => {
          session.ui.setState({ magnetic: !magnetic });
        }}
      />
      <ToolButton
        icon="eye"
        label={
          shiftFlip
            ? `Auto-select: ${autoSelectShown ? "on" : "off"} while Shift is held`
            : autoSelect
              ? "Auto-select: on"
              : "Auto-select: off"
        }
        active={autoSelectShown}
        temporary={shiftFlip}
        badge={shiftFlip ? "⇧" : undefined}
        onPress={() => {
          session.ui.setState({ autoSelect: !autoSelect });
        }}
      />
    </Toolbox>
  );
};
