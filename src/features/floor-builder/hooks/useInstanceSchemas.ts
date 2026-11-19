// Template-instance schemas (base schema + template parameters); re-renders when a template's schema loads.
import { useCallback } from "react";
import { useStore } from "zustand";
import type { EntityRef } from "@shared/domain/house/entityIndex";
import { instanceSchemaFor, instanceSchemaVersion } from "../services/instanceSchemas";
import { useSession } from "./sessionContext";

export const useInstanceSchemas = (): ((ref: EntityRef) => object | undefined) => {
  const { houseId } = useSession();
  const version = useStore(instanceSchemaVersion, (state) => state.version);
  return useCallback(
    (ref: EntityRef) => (version >= 0 ? instanceSchemaFor(houseId, ref) : undefined),
    [houseId, version],
  );
};
