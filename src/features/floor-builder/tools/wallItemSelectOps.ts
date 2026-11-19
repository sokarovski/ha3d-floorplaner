// Wall items in Select (Phase 15.8, owner report): a selected door, window, or wall-hung object shows its own
// box (drawn by the viewport) with stretch handles and a Move cross (wallItemBox.ts). A side handle changes the
// width or height, a corner both, with the opposite side fixed (Option: about the centre); the size stays within
// the template's limits and the box on its wall's span, floor to top. The pointer is read on the box's plane:
// along the wall at the handle's height, and up the vertical through the handle. With Magnetic on, widths
// snap like other points (Ctrl: no snapping) and heights to the wall top, the roof's underside over the item, and the
// other items' sills and heads. Under a roof (Phase 19.2) the top stops at the underside and a wider box that would
// reach above it is refused; the limit is drawn across the box.
// Typed values are the panel's sizes: one for a side, "W x H" for a corner. It previews live and commits as
// one undo step; Escape cancels. The Move cross slides the item along its wall as Nudge does.
import { setPropertiesCommand } from "@shared/domain/commands/propertyCommands";
import { formatLength, parseLength } from "@shared/domain/units/lengthUnits";
import type { OverlayPrimitive, PlanPoint3, RuntimePointerEvent } from "../../../renderer/runtimeTypes";
import { inferFloorPoint } from "../inference/toolInference";
import { hoveredHandle } from "../services/handleHover";
import { startInstanceDrag } from "./instanceDrag";
import type { InstanceDrag } from "./instanceDrag";
import { splitPair } from "./shapeDrawing";
import { finishTool, houseOf, unitOf } from "./toolContext";
import type { ToolEnv, ViewportCursor } from "./toolTypes";
import {
  isCornerHandle,
  stretchWallItem,
  wallItemBox,
  wallItemHandlePoint,
  wallItemHandles,
  wallItemOutline,
  wallItemRefOf,
  wallItemResizeUpdates,
} from "./wallItemBox";
import type { WallItemBox, WallItemHandle, WallItemResize } from "./wallItemBox";

const handleHitPx = 11;
const heightSnapPx = 10;

type StretchOp = {
  kind: "stretch";
  box: WallItemBox;
  handle: WallItemHandle;
  screen: Readonly<{ x: number; y: number }>;
  alternate: boolean;
  ctrl: boolean;
  /** The last pointer on the box's plane. */
  alongMm: number | undefined;
  hMm: number | undefined;
  result: WallItemResize | undefined;
};

type MoveOp = { kind: "move"; drag: InstanceDrag; hMm: number };

export type WallItemSelectOps = Readonly<{
  isActive: () => boolean;
  hover: (event: RuntimePointerEvent) => boolean;
  down: (event: RuntimePointerEvent) => boolean;
  pointer: (event: RuntimePointerEvent) => void;
  key: (event: KeyboardEvent) => boolean;
  cancel: () => void;
}>;

/** The single selected wall item's box, when its handles are shown. */
export const selectedWallItemBox = (env: ToolEnv): WallItemBox | undefined => {
  const { selection, wallsVisible, focusWallFace } = env.session.ui.getState();
  // The wall face view has its own tools for the wall's face.
  if (selection.length !== 1 || selection[0] === undefined || focusWallFace !== undefined) return undefined;
  const house = houseOf(env);
  const ref = wallItemRefOf(house, selection[0]);
  // With walls off, openings are not drawn (Phase 4.5); wall-hung objects still are.
  if (ref === undefined || (ref.kind === "opening" && !wallsVisible)) return undefined;
  return wallItemBox(house, env.runtime, ref);
};

export const createWallItemSelectOps = (env: ToolEnv): WallItemSelectOps => {
  let op: StretchOp | MoveOp | undefined;
  let typed = "";
  let showingHover = false;

  const topView = (): boolean => env.session.ui.getState().viewMode === "top";

  /** The handle under the pointer: corners beat sides beat the Move cross. */
  const handleAt = (
    box: WallItemBox,
    screen: Readonly<{ x: number; y: number }>,
  ): WallItemHandle | undefined => {
    const handles = wallItemHandles(box, topView());
    const rank = (handle: WallItemHandle): number =>
      isCornerHandle(handle) ? 0 : handle.sx !== 0 || handle.sy !== 0 ? 1 : 2;
    let best: { handle: WallItemHandle; score: number } | undefined;
    for (const handle of handles) {
      const at = env.runtime.screenPointOf(wallItemHandlePoint(box, handle));
      if (at === null) continue;
      const distance = Math.hypot(at.x - screen.x, at.y - screen.y);
      if (distance > handleHitPx) continue;
      const score = rank(handle) * 1000 + distance;
      if (best === undefined || score < best.score) best = { handle, score };
    }
    return best?.handle;
  };

  const cursorFor = (box: WallItemBox, handle: WallItemHandle): ViewportCursor => {
    if (handle.sx === 0 && handle.sy === 0) return "move";
    const from = env.runtime.screenPointOf(wallItemHandlePoint(box, { sx: 0, sy: 0 }));
    const to = env.runtime.screenPointOf(wallItemHandlePoint(box, handle));
    if (from === null || to === null || Math.hypot(to.x - from.x, to.y - from.y) < 1e-6) return "move";
    const degrees = ((((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI) % 180) + 180) % 180;
    const step = Math.round(degrees / 45) % 4;
    return step === 0 ? "resizeEW" : step === 1 ? "resizeNWSE" : step === 2 ? "resizeNS" : "resizeNESW";
  };

  const labelFor = (box: WallItemBox, handle: WallItemHandle): string =>
    handle.sx === 0 && handle.sy === 0
      ? `Move ${box.ref.value.name} along its wall`
      : `Resize ${box.ref.value.name}: ${isCornerHandle(handle) ? "corner" : "side"}`;

  const clearHover = (): void => {
    if (!showingHover) return;
    showingHover = false;
    env.setOverlay([]);
    env.setCue(undefined);
    env.setCursor("default");
  };

  const end = (): void => {
    op = undefined;
    typed = "";
    finishTool(env);
    env.setHint("");
  };

  /** The pointer at a height on the floor plan (the plane a horizontal drag moves in). */
  const pointerAt = (event: RuntimePointerEvent, hMm: number): RuntimePointerEvent => ({
    ...event,
    plan: env.runtime.planPointAt(event.screen.x, event.screen.y, hMm) ?? event.plan,
  });

  /** Heights a stretch snaps to: the wall's top and the sills and heads of the other items on the wall. */
  const heightSnaps = (box: WallItemBox): number[] => {
    const house = houseOf(env);
    const area = house.floors
      .find((floor) => floor.id === box.ref.floorId)
      ?.areas.find((candidate) => candidate.id === box.ref.areaId);
    const wall = area?.walls.find((candidate) => candidate.id === box.ref.wallId);
    const sizes = (wall?.objects ?? [])
      .filter((opening) => opening.id !== box.ref.id)
      .flatMap((opening) => {
        const height = opening.parameters.heightMm;
        return [
          opening.placement.bottomMm,
          ...(typeof height === "number" ? [opening.placement.bottomMm + height] : []),
        ];
      });
    const roofTop = box.roofTopMm(box.leftMm, box.rightMm);
    return [box.wallHeightMm, ...(roofTop === null ? [] : [roofTop]), ...sizes];
  };

  const typedSizes = (handle: WallItemHandle): { widthMm?: number; heightMm?: number } => {
    if (typed.trim() === "") return {};
    const [first, second] = splitPair(typed);
    const a = parseLength(first, unitOf(env));
    const b = second === undefined ? undefined : parseLength(second, unitOf(env));
    const aMm = a.ok && a.millimeters > 0 ? a.millimeters : undefined;
    const bMm = b?.ok === true && b.millimeters > 0 ? b.millimeters : undefined;
    if (handle.sx === 0) return aMm === undefined ? {} : { heightMm: aMm };
    if (handle.sy === 0) return aMm === undefined ? {} : { widthMm: aMm };
    return {
      ...(aMm === undefined ? {} : { widthMm: aMm }),
      ...(bMm === undefined ? {} : { heightMm: bMm }),
    };
  };

  const readPointer = (current: StretchOp, event: RuntimePointerEvent): void => {
    const { box, handle } = current;
    const grabbed = wallItemHandlePoint(box, handle);
    current.screen = event.screen;
    current.alternate = event.altKey;
    current.ctrl = event.ctrlKey;
    if (handle.sx !== 0) {
      const raw = env.runtime.planPointAt(event.screen.x, event.screen.y, grabbed.h) ?? event.plan;
      if (raw !== null) {
        const point = event.ctrlKey ? raw : inferFloorPoint(env, raw);
        current.alongMm =
          (point.x - box.start.x) * box.direction.x + (point.y - box.start.y) * box.direction.y;
      }
    }
    if (handle.sy !== 0) {
      const pointed = env.runtime.heightOnVertical(event.screen.x, event.screen.y, grabbed);
      if (pointed !== null) {
        const reach = heightSnapPx * env.runtime.worldUnitsPerPixel();
        const snap = event.ctrlKey
          ? undefined
          : heightSnaps(box).find((candidate) => Math.abs(candidate - pointed) <= reach);
        current.hMm = snap ?? pointed;
      }
    }
  };

  const refresh = (current: StretchOp): void => {
    const sizes = typedSizes(current.handle);
    current.result = stretchWallItem(current.box, current.handle, {
      alongMm: current.alongMm,
      hMm: current.hMm,
      typedWidthMm: sizes.widthMm,
      typedHeightMm: sizes.heightMm,
      aboutCentre: current.alternate,
    });
    if (current.result === undefined) return;
    const { box, result } = current;
    // The item stretches live (owner, Phase 5 follow-up).
    env.session.preview(
      setPropertiesCommand(houseOf(env), box.ref.id, wallItemResizeUpdates(box, result), "Resize"),
    );
    const shown = { ...box, ...result };
    // The window limit (Phase 19.2): the roof's lowest underside over the item, drawn across it.
    const roofTop = box.roofTopMm(shown.leftMm, shown.rightMm);
    const limitLine: OverlayPrimitive[] =
      roofTop === null
        ? []
        : [
            {
              kind: "polyline",
              points: [
                wallItemHandlePoint({ ...shown, topMm: roofTop }, { sx: -1, sy: 1 }),
                wallItemHandlePoint({ ...shown, topMm: roofTop }, { sx: 1, sy: 1 }),
              ],
              closed: false,
              dashed: true,
              tone: "warning",
            },
          ];
    const overlay: OverlayPrimitive[] = [
      wallItemOutline(shown),
      ...limitLine,
      hoveredHandle(wallItemHandlePoint(shown, current.handle)),
    ];
    env.setOverlay(overlay);
    const unit = unitOf(env);
    const width = result.widthMm ?? box.width?.valueMm;
    const height = result.heightMm ?? box.height?.valueMm;
    const text = [width, height]
      .flatMap((value) => (value === undefined ? [] : [formatLength(value, unit)]))
      .join(" × ");
    env.setReadout({ text: typed.trim() === "" ? text : `${typed}  =  ${text}`, screen: current.screen });
    env.setHint(
      current.alternate
        ? `Resizing the ${box.ref.value.name} about its centre. Release Option to keep the opposite side. Type ${isCornerHandle(current.handle) ? "W x H" : "a size"}; click to place. Esc cancels.`
        : `Resizing the ${box.ref.value.name} with the opposite side fixed. Option: about the centre. Ctrl: no snapping. Type ${isCornerHandle(current.handle) ? "W x H" : "a size"}; click to place. Esc cancels.`,
    );
  };

  const commit = (): void => {
    const current = op;
    end();
    if (current?.kind !== "stretch" || current.result === undefined) return;
    const { box, result } = current;
    // A press and release without a change makes no undo step.
    if (
      (result.widthMm ?? box.width?.valueMm) === box.width?.valueMm &&
      (result.heightMm ?? box.height?.valueMm) === box.height?.valueMm &&
      result.alongMm === box.alongMm &&
      result.baseMm === box.baseMm
    )
      return;
    env.session.execute(
      setPropertiesCommand(
        houseOf(env),
        box.ref.id,
        wallItemResizeUpdates(box, result),
        `Resize ${box.ref.value.name}`,
      ),
    );
  };

  return {
    isActive: () => op !== undefined,
    hover: (event) => {
      const box = event.phase === "leave" ? undefined : selectedWallItemBox(env);
      const handle = box === undefined ? undefined : handleAt(box, event.screen);
      if (box === undefined || handle === undefined) {
        clearHover();
        return false;
      }
      const at: PlanPoint3 = wallItemHandlePoint(box, handle);
      const move = handle.sx === 0 && handle.sy === 0;
      showingHover = true;
      env.setOverlay([hoveredHandle(at, move ? "cross" : "dot", move ? 12 : 8)]);
      env.setCue({ lines: [], marker: null, label: labelFor(box, handle) });
      env.setCursor(cursorFor(box, handle));
      return true;
    },
    down: (event) => {
      if (event.button !== 0) return false;
      const box = selectedWallItemBox(env);
      const handle = box === undefined ? undefined : handleAt(box, event.screen);
      if (box === undefined || handle === undefined) return false;
      showingHover = false;
      if (handle.sx === 0 && handle.sy === 0) {
        const at = wallItemHandlePoint(box, handle);
        // The move is measured from where the pointer was pressed (at the cross's height), so the item does not
        // jump to the pointer; the press itself moves nothing (Phase 19.6: a quick click never nudges).
        const pressed = pointerAt(event, at.h).plan ?? at;
        const drag = startInstanceDrag(env, box.ref, pressed);
        if (drag === undefined) return false;
        op = { kind: "move", drag, hMm: at.h };
        env.setCursor("move");
        env.setHint(`Moving the ${box.ref.value.name} along its wall: click to place. Esc cancels.`);
        return true;
      }
      const stretch: StretchOp = {
        kind: "stretch",
        box,
        handle,
        screen: event.screen,
        alternate: event.altKey,
        ctrl: event.ctrlKey,
        alongMm: undefined,
        hMm: undefined,
        result: undefined,
      };
      op = stretch;
      // The cursor keeps the direction it started with until commit or Escape.
      env.setCursor(cursorFor(box, handle));
      refresh(stretch);
      return true;
    },
    pointer: (event) => {
      const current = op;
      if (current === undefined) return;
      if (current.kind === "move") {
        if (event.phase === "move") current.drag.move(pointerAt(event, current.hMm));
        else if (event.phase === "down" && event.button === 0) {
          op = undefined;
          env.setHint("");
          current.drag.release();
        }
        return;
      }
      if (event.phase === "move") {
        readPointer(current, event);
        refresh(current);
      } else if (event.phase === "down" && event.button === 0) commit();
    },
    key: (event) => {
      const current = op;
      if (current === undefined) return false;
      if (event.key === "Escape") {
        end();
        return true;
      }
      if (current.kind === "move") return false;
      if (event.key === "Enter") {
        refresh(current);
        commit();
        return true;
      }
      if (event.key === "Backspace") typed = typed.slice(0, -1);
      else if (event.key.length === 1 && /[0-9a-zA-Z.,x× "'*;-]/.test(event.key)) typed += event.key;
      else return false;
      refresh(current);
      return true;
    },
    cancel: end,
  };
};
