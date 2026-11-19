import type { ReactElement } from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { OpeningSizeResolver } from "@shared/geometry/realAllWallsTypes";
import type {
  AreaIsolation,
  HelperSettings,
  NavigationMode,
  OverlayPrimitive,
  RuntimeEvent,
  SunSettings,
  ViewMode,
  ViewportRuntime,
  ViewportSelection,
} from "../../../renderer/runtimeTypes";
import { createViewportRuntime } from "../../../renderer/viewportRuntime";

export type ViewportHostProps = Readonly<{
  /** Accessible name of the viewport region. */
  label: string;
  house: HouseDocument | null;
  floorId: string | null;
  /** Must be referentially stable (RealAllWalls memoization). */
  openingSize: OpeningSizeResolver;
  imageUrl: (imageId: string) => string;
  /** URL of a template version (built-in or house template). */
  templateUrl: (templateId: string, version: number) => string;
  viewMode: ViewMode;
  navigation: NavigationMode;
  selection: ViewportSelection;
  helpers: HelperSettings;
  /** Replace the array to change the overlay; keep it stable otherwise. */
  overlay: readonly OverlayPrimitive[];
  isolation: AreaIsolation | null;
  /** Walls off draws walls as flat traces on the floor (Phase 4.5); on by default. */
  wallsVisible?: boolean;
  /** The builder's whole-house overview (Phase 16.4): every floor stacked at its placement; off by default. */
  houseOverview?: boolean;
  sun?: SunSettings;
  onEvent?: (event: RuntimeEvent) => void;
  onRuntime?: (runtime: ViewportRuntime | null) => void;
}>;

export const ViewportHost = ({
  label,
  house,
  floorId,
  openingSize,
  imageUrl,
  templateUrl,
  viewMode,
  navigation,
  selection,
  helpers,
  overlay,
  isolation,
  wallsVisible = true,
  houseOverview = false,
  sun,
  onEvent,
  onRuntime,
}: ViewportHostProps): ReactElement => {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ViewportRuntime | null>(null);
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(null);

  const handleEvent = useEffectEvent((event: RuntimeEvent) => {
    if (event.type === "unsupported") setUnsupportedReason(event.reason);
    onEvent?.(event);
  });
  const resolveImageUrl = useEffectEvent((imageId: string) => imageUrl(imageId));
  const resolveTemplateUrl = useEffectEvent((templateId: string, version: number) =>
    templateUrl(templateId, version),
  );
  const announceRuntime = useEffectEvent((runtime: ViewportRuntime | null) => {
    onRuntime?.(runtime);
  });

  useEffect(() => {
    const container = surfaceRef.current;
    if (container === null) return;
    const runtime = createViewportRuntime({
      container,
      imageUrl: (imageId) => resolveImageUrl(imageId),
      templateUrl: (templateId, version) => resolveTemplateUrl(templateId, version),
      onEvent: (event) => {
        handleEvent(event);
      },
    });
    runtimeRef.current = runtime;
    announceRuntime(runtime);
    return () => {
      runtimeRef.current = null;
      announceRuntime(null);
      runtime.dispose();
    };
  }, []);

  useEffect(() => {
    runtimeRef.current?.setHelpers(helpers);
  }, [helpers]);

  useEffect(() => {
    runtimeRef.current?.setNavigation(navigation);
  }, [navigation]);

  useEffect(() => {
    runtimeRef.current?.setViewMode(viewMode);
  }, [viewMode]);

  // Before the scene: switching into the overview must not build the single floor first.
  useEffect(() => {
    runtimeRef.current?.setHouseOverview(houseOverview);
  }, [houseOverview]);

  useEffect(() => {
    if (house !== null && floorId !== null) runtimeRef.current?.setScene({ house, floorId, openingSize });
  }, [house, floorId, openingSize]);

  useEffect(() => {
    runtimeRef.current?.setSelection(selection);
  }, [selection]);

  useEffect(() => {
    runtimeRef.current?.setIsolation(isolation);
  }, [isolation]);

  useEffect(() => {
    runtimeRef.current?.setWallsVisible(wallsVisible);
  }, [wallsVisible]);

  useEffect(() => {
    runtimeRef.current?.setOverlay(overlay);
  }, [overlay]);

  useEffect(() => {
    if (sun !== undefined) runtimeRef.current?.setSun(sun);
  }, [sun]);

  return (
    <section data-viewport="" aria-label={label}>
      <div data-viewport-surface="" ref={surfaceRef} />
      {unsupportedReason === null ? null : (
        <p data-viewport-message="" role="alert">
          The 3D viewport needs WebGL2, which is not available here. {unsupportedReason}
        </p>
      )}
    </section>
  );
};
