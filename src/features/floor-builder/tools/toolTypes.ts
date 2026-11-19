// React-free tool handlers. toolPointer adapts viewport clicks/drags to start/commit downs (D16).
import type {
  OverlayPrimitive,
  RuntimePointerEvent,
  ScreenPoint,
  ViewportRuntime,
} from "../../../renderer/runtimeTypes";
import type { InferenceCue } from "../inference/inferenceTypes";
import type { EditorSession } from "../services/editorSession";

export type Readout = Readonly<{ text: string; screen: ScreenPoint }>;

/** The pointer cursor over the viewport, showing what a press would do. */
export type ViewportCursor =
  | "default"
  | "pushPull"
  | "trim"
  | "split"
  | "move"
  /** Resize handles, by their on-screen drag direction (Phase 5.15). */
  | "resizeEW"
  | "resizeNS"
  | "resizeNWSE"
  | "resizeNESW"
  /** Rotate grips. */
  | "rotate"
  /** Camera tools (Phase 5.13): an open hand, and the orbit symbol. */
  | "pan"
  | "orbit";

export type ToolEnv = Readonly<{
  session: EditorSession;
  runtime: ViewportRuntime;
  setOverlay: (overlay: readonly OverlayPrimitive[]) => void;
  setReadout: (readout: Readout | undefined) => void;
  setHint: (hint: string) => void;
  /** The current inference cue (dotted line, marker, label), or undefined to clear it. */
  setCue: (cue: InferenceCue | undefined) => void;
  setCursor: (cursor: ViewportCursor) => void;
}>;

export type ToolHandler = Readonly<{
  /** An unfinished operation; subsequent clicks commit its locked target. */
  isActive: () => boolean;
  /** Existing entity a press would edit. Omit for drawing/creation tools. */
  target?: (event: RuntimePointerEvent) => string | undefined;
  pointer: (event: RuntimePointerEvent) => void;
  /** Returns true when the key was consumed by the active operation. */
  key: (event: KeyboardEvent) => boolean;
  /** Escape or a context change: drop any preview, no history entry. */
  cancel: () => void;
}>;

export type ToolFactory = (env: ToolEnv) => ToolHandler;
