// The effective sun of the house environment; in current-time mode it refreshes every minute.
import { useEffect, useMemo, useState } from "react";
import { environmentSun } from "@shared/domain/environment/sun";
import type { SunResult } from "@shared/domain/environment/sun";
import { useHouse } from "./sessionContext";

export const useHouseSun = (): SunResult => {
  const environment = useHouse((house) => house.environment);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (environment.sun.timeMode !== "current") return undefined;
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => {
      clearInterval(timer);
    };
  }, [environment.sun.timeMode]);
  return useMemo(() => environmentSun(environment, now), [environment, now]);
};
