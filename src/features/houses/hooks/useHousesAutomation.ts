// Mounts the Houses-level window.homeplan bridge while the Houses screen is shown
// (spec/architecture/browser-automation.md#houses-level-bridge).
import { useEffect, useEffectEvent } from "react";
import { useAppServices } from "../../../app/appServicesContext";
import { createHousesAutomation } from "../automation/createHousesAutomation";
import { housesAgentGuides } from "../automation/guides";

export const useHousesAutomation = (onChanged: () => void, onOpen: (houseId: string) => void): void => {
  const { houses } = useAppServices();
  const changed = useEffectEvent(onChanged);
  const open = useEffectEvent(onOpen);
  useEffect(() => {
    const bridge = createHousesAutomation(
      {
        houses,
        onChanged: () => {
          changed();
        },
        onOpen: (houseId) => {
          open(houseId);
        },
      },
      housesAgentGuides,
    );
    window.homeplan = bridge.api;
    return () => {
      bridge.dispose();
      if (window.homeplan === bridge.api) Reflect.deleteProperty(window, "homeplan");
    };
  }, [houses]);
};
