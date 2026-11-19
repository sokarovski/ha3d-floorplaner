// Roof editing level tools (Phase 19.1, spec/builder/features/roofs.md#the-roof-editing-level), SketchUp-like:
// - Select picks roof points and break lines (Shift adds or removes); Alt-click on an outline edge inserts a point,
//   on a point deletes it. Hover highlights what a click would pick.
// - Move (M) pulls what is selected (a line pulls its two ends) or, with nothing of the roof selected, what is under
//   the pointer; pressing the roof's surface with nothing selected moves the whole roof (↑: its eave height).
//   Click–lock–type–commit (D16): the first click grabs, the roof previews live, a second click, Enter after a typed
//   distance, or the release of an initial drag commits one undo step; Escape cancels. ↑ locks blue (up and down),
//   → red, ← green (again, or ↓, frees it); Shift locks the dominant red/green axis; Ctrl moves without snapping.
//   Plan moves snap to the roof's points and edges and the floor's walls; blue moves snap to other points' heights.
//   No point goes below the roof's base: a pull down stops there.
// - Line (L) draws break lines: click a start and an end (or type a length and Enter); ends snap to roof points,
//   the outline and other lines, crossings are split at a shared point (roofSheet.ts). The line continues from its
//   end until it lands on an existing point or the outline, or Escape.
import { moveRoofCommand, setRoofSheetCommand } from "@shared/domain/commands/roofCommands";
import { deleteEntitiesCommand } from "@shared/domain/commands/deleteCommands";
import { createId } from "@shared/domain/ids";
import { formatLength } from "@shared/domain/units/lengthUnits";
import type { RoofValue } from "@shared/domain/schemas/roof";
import type { Vec3 } from "@shared/geometry/meshData";
import {
  addBreakLine,
  insertOutlinePoint,
  movePoints,
  roofSnapToleranceMm,
} from "@shared/geometry/roofSheet";
import type { SheetResult } from "@shared/geometry/roofSheet";
import { roofHeightAt, roofSurface, sheetOutlineRing } from "@shared/geometry/roofSurface";
import { pointInRing } from "@shared/geometry/region";
import type { Vec2 } from "@shared/geometry/vector";
import type {
  OverlayPrimitive,
  PlanPoint3,
  RuntimePointerEvent,
  ScreenPoint,
} from "../../../renderer/runtimeTypes";
import { inferPoint, inferenceCapturePx } from "../inference/inferPoint";
import type { CueColor, CueLine } from "../inference/inferenceTypes";
import { openRoofOf, roofInferenceScene } from "../services/roofSpace";
import type { OpenRoof } from "../services/roofSpace";
import { moveAxis } from "./moveModifiers";
import { finishTool, houseOf, magnetic, unitOf } from "./toolContext";
import type { ToolEnv, ToolFactory, ToolHandler } from "./toolTypes";
import { createValueInput, feedValueKey, hasTyped, readoutOf, valueOf } from "./valueInput";
import type { ItemMove } from "./roofItemTools";
import { isRoofItem, planSpaceOf, roofItemAt, startRoofItemMove } from "./roofItemTools";
import { roofItemsOverlay, roofSelectedItemWidthPx } from "../services/roofOverlay";

/** Screen capture of roof points and lines (CSS px, implementation convention). */
const pointPickPx = 10;
const linePickPx = 6;

const sheetIds = { point: () => createId("rp"), line: () => createId("rl") };

const openOf = (env: ToolEnv): OpenRoof | undefined => openRoofOf(houseOf(env), env.session.ui.getState());

/** A sheet point as drawn (the roof's top), floor frame. */
const topOf = (roof: RoofValue, point: Readonly<{ x: number; y: number; heightMm: number }>): PlanPoint3 => ({
  x: point.x,
  y: point.y,
  h: roof.eaveHeightMm + point.heightMm + roof.thicknessMm,
});

/** The height of the roof's top over a plan point (its base where it has no face). */
const topAt = (roof: RoofValue, at: Vec2): number =>
  roof.eaveHeightMm + (roofHeightAt(roofSurface(roof), at) ?? 0) + roof.thicknessMm;

type RoofTarget =
  | Readonly<{ kind: "point"; id: string; at: PlanPoint3 }>
  | Readonly<{ kind: "line"; id: string; at: PlanPoint3 }>
  | Readonly<{ kind: "edge"; index: number; at: PlanPoint3 }>
  /** A hole or roof window (19.3). */
  | Readonly<{ kind: "item"; id: string; at: PlanPoint3 }>
  | Readonly<{ kind: "surface"; at: PlanPoint3 }>;

const screenDistanceToSegment = (
  p: ScreenPoint,
  a: ScreenPoint,
  b: ScreenPoint,
): Readonly<{ d: number; t: number }> => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return { d: Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)), t };
};

const lerp3 = (a: PlanPoint3, b: PlanPoint3, t: number): PlanPoint3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  h: a.h + (b.h - a.h) * t,
});

/** What is under the pointer: a point, a break line, an outline edge, the roof's surface, or nothing. */
const targetAt = (env: ToolEnv, roof: RoofValue, event: RuntimePointerEvent): RoofTarget | undefined => {
  const screenOf = (point: PlanPoint3): ScreenPoint | null => env.runtime.screenPointOf(point);
  let best: { target: RoofTarget; d: number } | undefined;
  for (const point of roof.points) {
    const at = topOf(roof, point);
    const screen = screenOf(at);
    if (screen === null) continue;
    const d = Math.hypot(screen.x - event.screen.x, screen.y - event.screen.y);
    if (d <= pointPickPx && (best === undefined || d < best.d))
      best = { target: { kind: "point", id: point.id, at }, d };
  }
  if (best !== undefined) return best.target;
  const byId = new Map(roof.points.map((point) => [point.id, point]));
  for (const line of roof.lines) {
    const a = byId.get(line.a);
    const b = byId.get(line.b);
    if (a === undefined || b === undefined) continue;
    const ta = topOf(roof, a);
    const tb = topOf(roof, b);
    const sa = screenOf(ta);
    const sb = screenOf(tb);
    if (sa === null || sb === null) continue;
    const { d, t } = screenDistanceToSegment(event.screen, sa, sb);
    if (d <= linePickPx && (best === undefined || d < best.d))
      best = { target: { kind: "line", id: line.id, at: lerp3(ta, tb, t) }, d };
  }
  if (best !== undefined) return best.target;
  for (let index = 0; index < roof.outline.length; index += 1) {
    const a = byId.get(roof.outline[index] ?? "");
    const b = byId.get(roof.outline[(index + 1) % roof.outline.length] ?? "");
    if (a === undefined || b === undefined) continue;
    const ta = topOf(roof, a);
    const tb = topOf(roof, b);
    const sa = screenOf(ta);
    const sb = screenOf(tb);
    if (sa === null || sb === null) continue;
    const { d, t } = screenDistanceToSegment(event.screen, sa, sb);
    if (d <= linePickPx && (best === undefined || d < best.d))
      best = { target: { kind: "edge", index, at: lerp3(ta, tb, t) }, d };
  }
  if (best !== undefined) return best.target;
  // Holes and roof windows (19.3) under the pointer, on the plan.
  const plan =
    event.hit?.kind === "roof" && event.hit.roofId === roof.id
      ? event.hit.pointMm
      : planUnder(env, roof, event.screen);
  const item = plan === null ? undefined : roofItemAt(roof, plan);
  if (item !== undefined && plan !== null)
    return { kind: "item", id: item, at: { x: plan.x, y: plan.y, h: topAt(roof, plan) } };
  if (event.hit?.kind === "roof" && event.hit.roofId === roof.id)
    return { kind: "surface", at: event.hit.pointMm };
  return undefined;
};

const targetId = (target: RoofTarget | undefined): string | undefined =>
  target?.kind === "point" || target?.kind === "line" || target?.kind === "item" ? target.id : undefined;

/** Whether a plan point lies on an existing roof point, outline edge or break line. */
const landsOnSheet = (roof: RoofValue, at: Vec2): boolean => {
  const byId = new Map(roof.points.map((point) => [point.id, point]));
  const near = (a: Vec2, b: Vec2): boolean => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / lengthSq));
    return Math.hypot(at.x - (a.x + dx * t), at.y - (a.y + dy * t)) <= roofSnapToleranceMm;
  };
  const pairs = [
    ...roof.outline.map((id, index) => [id, roof.outline[(index + 1) % roof.outline.length] ?? ""] as const),
    ...roof.lines.map((line) => [line.a, line.b] as const),
  ];
  return pairs.some(([aId, bId]) => {
    const a = byId.get(aId);
    const b = byId.get(bId);
    return a !== undefined && b !== undefined && near(a, b);
  });
};

/** Hover highlight of a target. */
const hoverOverlay = (roof: RoofValue, target: RoofTarget | undefined): OverlayPrimitive[] => {
  if (target === undefined || target.kind === "surface") return [];
  if (target.kind === "item")
    return roofItemsOverlay(roof, [target.id]).filter((primitive) => primitive.tone === "accentStrong");
  if (target.kind === "point")
    return [{ kind: "point", at: target.at, marker: "dotBold", tone: "accentStrong" }];
  const byId = new Map(roof.points.map((point) => [point.id, point]));
  const ends =
    target.kind === "line"
      ? (() => {
          const line = roof.lines.find((candidate) => candidate.id === target.id);
          return line === undefined ? [] : [byId.get(line.a), byId.get(line.b)];
        })()
      : [
          byId.get(roof.outline[target.index] ?? ""),
          byId.get(roof.outline[(target.index + 1) % roof.outline.length] ?? ""),
        ];
  const [a, b] = ends;
  return a === undefined || b === undefined
    ? []
    : [
        {
          kind: "segment",
          from: topOf(roof, a),
          to: topOf(roof, b),
          tone: "accentStrong",
          widthPx: roofSelectedItemWidthPx,
        },
      ];
};

/** The plan point under the pointer on the roof's base top (in Top view the same as the plan). */
const planUnder = (env: ToolEnv, roof: RoofValue, screen: ScreenPoint, heightMm?: number): Vec2 | null =>
  env.runtime.planPointAt(screen.x, screen.y, heightMm ?? roof.eaveHeightMm + roof.thicknessMm);

/** Snaps a plan point to the roof and the floor (Magnetic on, Ctrl off) and publishes the cue. */
const inferOnRoof = (
  env: ToolEnv,
  open: OpenRoof,
  point: Vec2,
  options: Readonly<{ from?: Vec2; ctrl: boolean }>,
): Readonly<{ point: Vec2; kind: string | undefined }> => {
  if (!magnetic(env) || options.ctrl) {
    env.setCue(undefined);
    return { point, kind: undefined };
  }
  const inference = inferPoint(
    roofInferenceScene(open.floor, open.roof),
    point,
    env.runtime.worldUnitsPerPixel(),
    { ...(options.from === undefined ? {} : { from: options.from }), hMm: topAt(open.roof, point) },
  );
  env.setCue(inference?.cue);
  return { point: inference?.point ?? point, kind: inference?.kind };
};

/** The roof points of the selection (a line counts as its two ends). */
const selectedPointIds = (roof: RoofValue, selection: readonly string[]): string[] => {
  const ids = new Set<string>();
  const chosen = new Set(selection);
  for (const point of roof.points) if (chosen.has(point.id)) ids.add(point.id);
  for (const line of roof.lines)
    if (chosen.has(line.id)) {
      ids.add(line.a);
      ids.add(line.b);
    }
  return [...ids];
};

/** Commits a sheet edit (one undo step) and selects `select`, or says why it was refused. */
const apply = (
  env: ToolEnv,
  open: OpenRoof,
  result: SheetResult,
  label: string,
  select?: readonly string[],
): boolean => {
  if (!result.ok) {
    env.session.notify("warning", result.message);
    return false;
  }
  const outcome = env.session.execute(setRoofSheetCommand(open.floor.id, open.roof.id, result.sheet, label));
  if (outcome.ok && select !== undefined) env.session.ui.setState({ selection: [...select] });
  return outcome.ok;
};

// ---- Select -----------------------------------------------------------------------------------------

export const createRoofSelectTool = (): ToolFactory => (env) => {
  env.setHint(
    "Click a roof point or line to select it (Shift adds); Alt-click an outline edge adds a point, Alt-click a point deletes it. Move (M) pulls the selection; Line (L) draws break lines.",
  );
  return {
    isActive: () => false,
    target: (event) => {
      const open = openOf(env);
      return open === undefined ? undefined : targetId(targetAt(env, open.roof, event));
    },
    pointer: (event) => {
      const open = openOf(env);
      if (open === undefined) return;
      const target = event.phase === "leave" ? undefined : targetAt(env, open.roof, event);
      if (event.phase === "move" || event.phase === "leave") {
        env.setOverlay(hoverOverlay(open.roof, target));
        env.setCursor(target === undefined || target.kind === "surface" ? "default" : "move");
        return;
      }
      if (event.phase !== "down" || event.button !== 0) return;
      const { selection } = env.session.ui.getState();
      if (event.altKey && target?.kind === "edge") {
        const id = createId("rp");
        apply(env, open, insertOutlinePoint(open.roof, target.at, id), `Add point to ${open.roof.name}`, [
          id,
        ]);
        return;
      }
      if (event.altKey && target?.kind === "point") {
        env.session.execute(deleteEntitiesCommand(houseOf(env), [target.id]));
        env.session.ui.setState({ selection: selection.filter((id) => id !== target.id) });
        return;
      }
      const id = targetId(target);
      if (event.shiftKey) {
        if (id === undefined) return;
        env.session.ui.setState({
          selection: selection.includes(id) ? selection.filter((each) => each !== id) : [...selection, id],
        });
        return;
      }
      env.session.ui.setState({ selection: id === undefined ? [] : [id] });
    },
    key: () => false,
    cancel: () => {
      finishTool(env);
    },
  };
};

// ---- Move -------------------------------------------------------------------------------------------

type Lock = "plane" | "x" | "y" | "vertical";

const lockKeys: Readonly<Record<string, Lock>> = { ArrowUp: "vertical", ArrowRight: "x", ArrowLeft: "y" };
const lockLabel: Readonly<Record<Lock, string>> = {
  plane: "",
  x: "Red axis",
  y: "Green axis",
  vertical: "Blue axis",
};
const lockColor: Readonly<Record<Lock, CueColor>> = {
  plane: "edge",
  x: "axisX",
  y: "axisY",
  vertical: "vertical",
};

const constrained = (raw: Vec3, lock: Lock): Vec3 =>
  lock === "vertical"
    ? { x: 0, y: 0, h: raw.h }
    : lock === "x"
      ? { x: raw.x, y: 0, h: 0 }
      : lock === "y"
        ? { x: 0, y: raw.y, h: 0 }
        : { x: raw.x, y: raw.y, h: 0 };

type MoveOperation = Readonly<{
  pointer: (event: RuntimePointerEvent) => void;
  key: (event: KeyboardEvent) => boolean;
  cancel: () => void;
}>;

/**
 * One Move: the moving points (or the whole roof) from a grab point. Also used by the floor view's Move for a
 * selected canopy (19.5), which moves it whole without entering it.
 */
export const startRoofMove = (
  env: ToolEnv,
  open: OpenRoof,
  moving: readonly string[],
  wholeRoof: boolean,
  grab: PlanPoint3,
  event: RuntimePointerEvent,
  onDone: () => void,
): MoveOperation => {
  const { roof, floor } = open;
  const input = createValueInput("length");
  const movingSet = new Set(moving);
  const movingPoints = roof.points.filter((point) => movingSet.has(point.id));
  /** The lowest the moving points may go (the guard rail: none below the base); the whole roof: the floor. */
  const minDown = wholeRoof ? -roof.eaveHeightMm : -Math.min(...movingPoints.map((point) => point.heightMm));
  const otherHeights = [
    ...new Set(roof.points.filter((point) => !movingSet.has(point.id)).map((point) => point.heightMm)),
  ];
  const startScreen = event.screen;
  let screen = event.screen;
  let raw: Vec3 = { x: 0, y: 0, h: 0 };
  let explicitLock: Lock | undefined;
  let shift = event.shiftKey;
  let ctrl = event.ctrlKey;
  let offset: Vec3 = { x: 0, y: 0, h: 0 };
  let label = "";
  let marker: PlanPoint3 | undefined;

  const lockNow = (): Lock => {
    if (explicitLock !== undefined) return explicitLock;
    if (!shift || ctrl) return "plane";
    return moveAxis({ x: raw.x, y: raw.y }).x === 1 ? "x" : "y";
  };

  const readPointer = (): void => {
    if (lockNow() === "vertical") {
      const height = env.runtime.heightOnVertical(screen.x, screen.y, grab);
      // Top view sees the vertical end-on: the pointer's screen movement up or down reads as height.
      raw = {
        x: 0,
        y: 0,
        h: height === null ? (startScreen.y - screen.y) * env.runtime.worldUnitsPerPixel() : height - grab.h,
      };
      return;
    }
    const plan = planUnder(env, roof, screen, grab.h);
    if (plan !== null) raw = { x: plan.x - grab.x, y: plan.y - grab.y, h: 0 };
  };

  /** The offset after the lock, typed value, snapping and the guard rail. */
  const place = (): void => {
    const lock = lockNow();
    const base = constrained(raw, lock);
    label = lockLabel[lock];
    marker = undefined;
    if (hasTyped(input)) {
      const length = Math.hypot(base.x, base.y, base.h);
      const distance = Math.abs(valueOf(input, length, unitOf(env)));
      if (lock === "vertical") offset = { x: 0, y: 0, h: base.h < 0 ? -distance : distance };
      else {
        const size = Math.hypot(base.x, base.y);
        offset =
          size === 0
            ? lock === "y"
              ? { x: 0, y: distance, h: 0 }
              : { x: distance, y: 0, h: 0 }
            : { x: (base.x / size) * distance, y: (base.y / size) * distance, h: 0 };
      }
    } else if (lock === "vertical") {
      offset = base;
      // Height inference: another point's height (SketchUp's blue inference), when Magnetic.
      if (magnetic(env) && !ctrl && !wholeRoof && movingPoints.length > 0) {
        const anchor =
          movingPoints.find((point) => Math.abs(point.x - grab.x) < 1 && Math.abs(point.y - grab.y) < 1) ??
          movingPoints[0];
        const radius = inferenceCapturePx * env.runtime.worldUnitsPerPixel();
        const target = (anchor?.heightMm ?? 0) + base.h;
        const snap = otherHeights
          .map((height) => ({ height, d: Math.abs(height - target) }))
          .filter((entry) => entry.d <= radius)
          .sort((a, b) => a.d - b.d)[0];
        if (snap !== undefined && anchor !== undefined) {
          offset = { x: 0, y: 0, h: snap.height - anchor.heightMm };
          label = `Blue axis · Height of a point (${formatLength(snap.height, unitOf(env))})`;
        }
      }
    } else if (lock === "plane" && !wholeRoof) {
      const inferred = inferOnRoof(
        env,
        open,
        { x: grab.x + base.x, y: grab.y + base.y },
        { from: grab, ctrl },
      );
      offset = { x: inferred.point.x - grab.x, y: inferred.point.y - grab.y, h: 0 };
    } else offset = base;
    if (lock !== "plane" || wholeRoof) env.setCue(undefined);
    if (offset.h < minDown) {
      offset = { ...offset, h: minDown };
      label = wholeRoof ? "Blue axis · On the floor" : "Blue axis · At the eave height (no point goes lower)";
    }
  };

  /** The command for the current offset (undefined when nothing moves). */
  const commandOf = (): ReturnType<typeof setRoofSheetCommand> | undefined => {
    if (Math.hypot(offset.x, offset.y, offset.h) < 0.01) return undefined;
    // The whole roof (19.5: with its holes and roof windows, and its eave height on ↑).
    if (wholeRoof) return moveRoofCommand(floor.id, roof.id, offset, `Move ${roof.name}`);
    const result = movePoints(roof, moving, offset);
    if (!result.ok) return undefined;
    const count = moving.length;
    const what =
      offset.h !== 0
        ? `Pull ${count === 1 ? "point" : `${String(count)} points`}`
        : `Move ${count === 1 ? "point" : `${String(count)} points`}`;
    return setRoofSheetCommand(floor.id, roof.id, result.sheet, what);
  };

  const preview = (): void => {
    place();
    const lock = lockNow();
    const moved = { x: grab.x + offset.x, y: grab.y + offset.y, h: grab.h + offset.h };
    const command = commandOf();
    env.session.preview(command);
    const refused =
      command === undefined && Math.hypot(offset.x, offset.y, offset.h) >= 0.01
        ? (() => {
            const result = movePoints(roof, moving, offset);
            return result.ok ? "" : result.message;
          })()
        : "";
    env.setOverlay([
      lock === "vertical"
        ? { kind: "verticalLine", at: grab, fromHMm: grab.h, toHMm: moved.h, dashed: true, tone: "neutral" }
        : {
            kind: "segment",
            from: grab,
            to: moved,
            dashed: true,
            tone: refused === "" ? "neutral" : "danger",
          },
      { kind: "point", at: moved, marker: "dotBold", tone: refused === "" ? "accentStrong" : "danger" },
    ]);
    if (lock !== "plane" || wholeRoof) {
      const lines: CueLine[] = lock === "plane" ? [] : [{ from: grab, to: moved, color: lockColor[lock] }];
      env.setCue(lines.length === 0 && label === "" ? undefined : { lines, marker: marker ?? moved, label });
    }
    const unit = unitOf(env);
    const value = Math.hypot(offset.x, offset.y, offset.h);
    env.setReadout({
      text:
        refused !== ""
          ? refused
          : `${readoutOf(input, value, unit)}${offset.h !== 0 ? `  (↑ ${formatLength(offset.h, unit)})` : ""}`,
      screen,
    });
  };

  const finish = (): void => {
    input.typed = "";
    env.session.preview(undefined);
    finishTool(env);
    onDone();
  };

  const commit = (): void => {
    place();
    const command = commandOf();
    finish();
    if (command !== undefined) env.session.execute(command);
  };

  env.setCursor("move");
  preview();
  return {
    pointer: (next) => {
      shift = next.shiftKey;
      ctrl = next.ctrlKey;
      if (next.phase === "move") {
        screen = next.screen;
        readPointer();
        preview();
      } else if (next.phase === "down" && next.button === 0) commit();
    },
    key: (keyEvent) => {
      if (keyEvent.key === "Shift" || keyEvent.key === "Control") {
        shift = keyEvent.shiftKey;
        ctrl = keyEvent.ctrlKey;
        readPointer();
        preview();
        return false;
      }
      if (keyEvent.type !== "keydown") return false;
      const lock = lockKeys[keyEvent.key];
      if (lock !== undefined || keyEvent.key === "ArrowDown") {
        explicitLock = lock === undefined || explicitLock === lock ? undefined : lock;
        readPointer();
        preview();
        return true;
      }
      const action = feedValueKey(input, keyEvent.key);
      if (action === "cancel") finish();
      else if (action === "commit") commit();
      else if (action === "consumed") preview();
      return action !== "none";
    },
    cancel: finish,
  };
};

export const createRoofMoveTool =
  (): ToolFactory =>
  (env): ToolHandler => {
    let operation: MoveOperation | ItemMove | undefined;
    env.setHint(
      "Click a point or line (or the selection) and move; click again or type a distance and Enter. ↑ pulls up/down, → red, ← green (again to free); Shift red/green; Ctrl no snapping; Esc cancels. On the roof with nothing selected: moves the whole roof.",
    );
    return {
      isActive: () => operation !== undefined,
      target: (event) => {
        const open = openOf(env);
        return open === undefined ? undefined : targetId(targetAt(env, open.roof, event));
      },
      pointer: (event) => {
        if (operation !== undefined) {
          operation.pointer(event);
          return;
        }
        const open = openOf(env);
        if (open === undefined) return;
        const target = event.phase === "leave" ? undefined : targetAt(env, open.roof, event);
        if (event.phase === "move" || event.phase === "leave") {
          env.setOverlay(hoverOverlay(open.roof, target));
          env.setCursor(target === undefined ? "default" : "move");
          return;
        }
        if (event.phase !== "down" || event.button !== 0) return;
        // Holes and roof windows (19.3) move on the plan (their heights follow the surface under them).
        const selectedItems = env.session.ui
          .getState()
          .selection.filter((each) => isRoofItem(open.roof, each));
        if (target?.kind === "item" || (selectedItems.length > 0 && targetId(target) === undefined)) {
          const items =
            target?.kind === "item" && !selectedItems.includes(target.id) ? [target.id] : selectedItems;
          if (target?.kind === "item" && items.length === 1) env.session.ui.setState({ selection: items });
          const space = planSpaceOf(open.roof, (screen) => planUnder(env, open.roof, screen));
          const grab = space.pointAt(event.screen);
          if (grab === null) return;
          operation = startRoofItemMove(env, open.floor.id, open.roof, items, space, grab, event, () => {
            operation = undefined;
          });
          return;
        }
        const selected = selectedPointIds(open.roof, env.session.ui.getState().selection);
        const pressed =
          target?.kind === "point"
            ? [target.id]
            : target?.kind === "line"
              ? selectedPointIds(open.roof, [target.id])
              : [];
        const id = targetId(target);
        // The selection moves when the press is on it, or (Auto-select off) anywhere with a selection.
        const onSelection = id !== undefined && env.session.ui.getState().selection.includes(id);
        const moving = onSelection || (selected.length > 0 && pressed.length === 0) ? selected : pressed;
        if (moving.length === 0 && target?.kind !== "surface") {
          if (target === undefined) env.session.notify("info", "Press a roof point or line to move it.");
          return;
        }
        if (moving === pressed && id !== undefined) env.session.ui.setState({ selection: [id] });
        const grab = target?.at ?? { x: 0, y: 0, h: 0 };
        operation = startRoofMove(env, open, moving, moving.length === 0, grab, event, () => {
          operation = undefined;
        });
      },
      key: (event) => operation?.key(event) ?? false,
      cancel: () => {
        operation?.cancel();
        operation = undefined;
        finishTool(env);
      },
    };
  };

// ---- Line -------------------------------------------------------------------------------------------

export const createRoofLineTool = (): ToolFactory => (env) => {
  let start: Vec2 | undefined;
  let current: Vec2 | undefined;
  let screen: ScreenPoint = { x: 0, y: 0 };
  let ctrl = false;
  let snapKind: string | undefined;
  const input = createValueInput("length");

  const end = (): Vec2 | undefined => {
    if (start === undefined || current === undefined) return current;
    if (!hasTyped(input)) return current;
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const size = Math.hypot(dx, dy);
    const length = Math.abs(valueOf(input, size, unitOf(env)));
    return size === 0
      ? { x: start.x + length, y: start.y }
      : { x: start.x + (dx / size) * length, y: start.y + (dy / size) * length };
  };

  const preview = (): void => {
    const open = openOf(env);
    const to = end();
    if (open === undefined || to === undefined) return;
    const { roof } = open;
    const marker: OverlayPrimitive = {
      kind: "point",
      at: { ...to, h: topAt(roof, to) },
      marker: "dotBold",
      tone: "accentStrong",
    };
    if (start === undefined) {
      env.setOverlay([marker]);
      return;
    }
    const valid = addBreakLine(roof, start, to, sheetIds).ok;
    env.setOverlay([
      {
        kind: "segment",
        from: { ...start, h: topAt(roof, start) },
        to: { ...to, h: topAt(roof, to) },
        tone: valid ? "accentStrong" : "danger",
      },
      marker,
    ]);
    env.setReadout({
      text: readoutOf(input, Math.hypot(to.x - start.x, to.y - start.y), unitOf(env)),
      screen,
    });
  };

  const reset = (): void => {
    start = undefined;
    current = undefined;
    input.typed = "";
    finishTool(env);
  };

  /** Whether a plan point lies on the roof (inside, or on its outline, a point or a line). */
  const onRoof = (roof: RoofValue, at: Vec2): boolean =>
    pointInRing(at, sheetOutlineRing(roof)) ||
    roof.points.some((point) => Math.hypot(point.x - at.x, point.y - at.y) <= roofSnapToleranceMm) ||
    snapKind === "endpoint" ||
    snapKind === "onEdge";

  const commit = (): void => {
    const open = openOf(env);
    const to = end();
    if (open === undefined || start === undefined || to === undefined) return;
    const from = start;
    const before = new Set(open.roof.points.map((point) => point.id));
    // It lands on something that exists: a point, the outline or another line (then the Line stops there).
    const lands = landsOnSheet(open.roof, to);
    const result = addBreakLine(open.roof, from, to, sheetIds);
    input.typed = "";
    if (!apply(env, open, result, `Draw break line on ${open.roof.name}`)) return;
    const drawn = result.ok
      ? result.sheet.points.find(
          (point) =>
            !before.has(point.id) && Math.hypot(point.x - to.x, point.y - to.y) <= roofSnapToleranceMm,
        )
      : undefined;
    // SketchUp's Line continues from its end, until it lands on something that already exists.
    if (lands || drawn === undefined) reset();
    else {
      start = to;
      preview();
    }
  };

  env.setHint(
    "Click a start and an end on the roof (or type a length and Enter). Ends snap to roof points, the outline and other lines; crossing lines are joined. Esc stops.",
  );
  return {
    isActive: () => start !== undefined,
    pointer: (event) => {
      const open = openOf(env);
      if (open === undefined) return;
      screen = event.screen;
      ctrl = event.ctrlKey;
      if (event.phase === "leave") {
        env.setOverlay([]);
        return;
      }
      const raw = planUnder(env, open.roof, event.screen);
      if (raw === null) return;
      const inferred = inferOnRoof(env, open, raw, { ...(start === undefined ? {} : { from: start }), ctrl });
      current = inferred.point;
      snapKind = inferred.kind;
      if (event.phase === "move") {
        preview();
        return;
      }
      if (event.phase !== "down" || event.button !== 0) return;
      if (start === undefined) {
        if (!onRoof(open.roof, current)) {
          env.session.notify("info", "Start the break line on the roof.");
          return;
        }
        start = current;
        preview();
        return;
      }
      commit();
    },
    key: (event) => {
      if (start === undefined) return false;
      if (event.type !== "keydown") return false;
      const action = feedValueKey(input, event.key);
      if (action === "cancel") reset();
      else if (action === "commit") commit();
      else if (action === "consumed") preview();
      return action !== "none";
    },
    cancel: reset,
  };
};
