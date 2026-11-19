import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactElement, ReactNode } from "react";

type EditorLayoutProps = Readonly<{
  header: ReactNode;
  toolbox: ReactNode;
  viewport: ReactNode;
  overview: ReactNode;
  properties: ReactNode;
  status?: ReactNode;
  /** The overview's share of the right column, 0.15–0.85 (Phase 7.4); defaults to 0.4. */
  sideSplit?: number;
  /** Called when a splitter drag or arrow key ends with a new share. Without it the splitter is not shown. */
  onSideSplitChange?: (share: number) => void;
}>;

const minShare = 0.15;
const maxShare = 0.85;
const keyStep = 0.05;

const clampShare = (share: number): number => Math.min(maxShare, Math.max(minShare, share));

export const EditorLayout = ({
  header,
  toolbox,
  viewport,
  overview,
  properties,
  status,
  sideSplit = 0.4,
  onSideSplitChange,
}: EditorLayoutProps): ReactElement => {
  const side = useRef<HTMLDivElement | null>(null);
  const [dragShare, setDragShare] = useState<number | undefined>(undefined);
  const share = clampShare(dragShare ?? sideSplit);
  const shareAt = (clientY: number): number => {
    const rect = side.current?.getBoundingClientRect();
    return rect === undefined || rect.height === 0 ? share : clampShare((clientY - rect.top) / rect.height);
  };
  return (
    <div data-editor-layout="">
      <div data-editor-layout-header="">{header}</div>
      <main data-editor-layout-viewport="">{viewport}</main>
      <div data-editor-layout-toolbox="">{toolbox}</div>
      <div
        data-editor-layout-side=""
        ref={(element) => {
          side.current = element;
          element?.style.setProperty("--side-split", `${String(share * 100)}%`);
        }}
      >
        <div data-editor-layout-overview="">{overview}</div>
        {onSideSplitChange === undefined ? null : (
          <div
            data-editor-layout-splitter=""
            data-dragging={dragShare === undefined ? undefined : ""}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize the tree and properties"
            aria-valuemin={Math.round(minShare * 100)}
            aria-valuemax={Math.round(maxShare * 100)}
            aria-valuenow={Math.round(share * 100)}
            tabIndex={0}
            onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragShare(shareAt(event.clientY));
            }}
            onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
              if (dragShare !== undefined) setDragShare(shareAt(event.clientY));
            }}
            onPointerUp={(event: PointerEvent<HTMLDivElement>) => {
              if (dragShare === undefined) return;
              const next = shareAt(event.clientY);
              setDragShare(undefined);
              onSideSplitChange(Math.round(next * 100) / 100);
            }}
            onPointerCancel={() => {
              setDragShare(undefined);
            }}
            onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              event.preventDefault();
              const next = clampShare(share + (event.key === "ArrowDown" ? keyStep : -keyStep));
              onSideSplitChange(Math.round(next * 100) / 100);
            }}
          />
        )}
        <div data-editor-layout-properties="">{properties}</div>
      </div>
      {status === undefined ? null : <div data-editor-layout-status="">{status}</div>}
    </div>
  );
};
