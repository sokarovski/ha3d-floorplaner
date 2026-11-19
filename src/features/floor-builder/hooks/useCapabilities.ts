// Server capabilities (upload limits, optional photorealistic renderer), read once per builder.
import { useEffect, useState } from "react";
import type { CapabilitiesResponseValue } from "@shared/contracts/system";
import { useAppServices } from "../../../app/appServicesContext";

export const useCapabilities = (): CapabilitiesResponseValue | undefined => {
  const services = useAppServices();
  const [capabilities, setCapabilities] = useState<CapabilitiesResponseValue | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    services.renders.capabilities(controller.signal).then(setCapabilities, () => undefined);
    return () => {
      controller.abort();
    };
  }, [services]);
  return capabilities;
};
