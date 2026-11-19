// Which template picker is open (opened from tree Add menus and the light fixture editor).
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";

/** Doors and windows on room walls; gates (Phase 17.2) on a yard's fences. */
export type OpeningFilter = "door" | "window" | "gate";

export type PickerRequest =
  | Readonly<{ kind: "opening"; filter: OpeningFilter; areaId: string; wallId: string }>
  | Readonly<{ kind: "object"; areaId: string }>
  | Readonly<{ kind: "staircase"; areaId: string }>
  | Readonly<{ kind: "floorOpening"; areaId: string }>
  | Readonly<{ kind: "fixture"; lightId: string }>
  /** A roof window (Phase 19.3) on a roof, centred at `at` (plan) or on its best face. */
  | Readonly<{
      kind: "roofWindow";
      floorId: string;
      roofId: string;
      at?: Readonly<{ x: number; y: number }>;
    }>;

export type PickerState = Readonly<{ request: PickerRequest | undefined }>;

export const pickerStore: StoreApi<PickerState> = createStore<PickerState>(() => ({ request: undefined }));
