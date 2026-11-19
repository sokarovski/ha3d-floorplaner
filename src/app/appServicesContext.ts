// One narrow provider for the stable application service set.
import { createContext, useContext } from "react";
import type { AppServices } from "./appServices";

export const AppServicesContext = createContext<AppServices | undefined>(undefined);

export const useAppServices = (): AppServices => {
  const services = useContext(AppServicesContext);
  if (services === undefined) throw new Error("useAppServices must be used inside AppServicesContext");
  return services;
};
