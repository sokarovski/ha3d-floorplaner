import { useState } from "react";
import type { ReactElement } from "react";
import { IconSelectMenu } from "../../../design-system/components/IconSelectMenu/IconSelectMenu";

export const IconSelectMenuExample = (): ReactElement => {
  const [controls, setControls] = useState("shown");
  const [lightsOn, setLightsOn] = useState(true);
  const [sun, setSun] = useState("day");
  return (
    <>
      <IconSelectMenu
        label="Lights"
        tooltip="Lights: controls and on/off"
        active={controls !== "hidden"}
        options={[
          { id: "hidden", icon: "eyeOff", label: "Light controls hidden" },
          { id: "shown", icon: "eye", label: "Light controls shown (pins and handles)" },
          { id: "focus", icon: "lightFocus", label: "Lights focus (dim everything else)" },
        ]}
        selectedId={controls}
        onSelect={setControls}
        actions={[
          lightsOn
            ? { id: "lights", icon: "lightOff", label: "Switch all lights off" }
            : { id: "lights", icon: "light", label: "Switch all lights on" },
        ]}
        onAction={() => {
          setLightsOn(!lightsOn);
        }}
      />
      <IconSelectMenu
        label="Sun view"
        options={[
          { id: "house", icon: "home", label: "Sun from the house (location and time)" },
          { id: "day", icon: "sun", label: "Day: a bright daytime sun" },
          { id: "night", icon: "moon", label: "Night: no sun, the lamps light the house" },
        ]}
        selectedId={sun}
        onSelect={setSun}
      />
      <span>
        Controls: {controls} · lights {lightsOn ? "on" : "off"} · sun: {sun}
      </span>
    </>
  );
};
