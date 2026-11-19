// The bubble overlay (Phase 8.5, spec/home-assistant/viewer-mvp.md#bubbles): every room and placed bubble as an
// HTML element over the canvas, always facing the viewer at a fixed screen size, in Home Assistant's theme colours
// with HA's own `ha-icon`. Lit renders the content; positions are written straight to each element after every
// frame of the 3D view (`reposition`), so camera moves cost no Lit render and no extra 3D frame. Bubbles take
// their own pointer events, so they are picked before anything in 3D (bubble → light → object → room) and the
// canvas never sees those presses. In Edit mode a tap opens the bubble and a drag moves a placed one.
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { bubbleActive, bubbleIcon, bubbleText } from "@shared/domain/homeAssistant/bubbles";
import type { HaBubbleAnchorValue, HaBubbleContentValue } from "@shared/domain/schemas/homeAssistant";
import { rowCenters } from "./bubbleLayout";
import type { PlanPoint, RoomFrame, ScreenPoint } from "./bubbleLayout";
import { gestureTiming, TapSequence } from "./gestures";
import type { Gesture } from "./haActions";
import type { HassStore } from "./hassStore";
import { tokens } from "./styles/tokens";

/** One bubble to draw: its content and where it goes (its room's row, or its anchor). */
export type BubbleItem = Readonly<{
  id: string;
  content: HaBubbleContentValue;
  place:
    Readonly<{ kind: "room"; areaId: string }> | Readonly<{ kind: "placed"; anchor: HaBubbleAnchorValue }>;
  /** Edit mode: drawn although its condition does not hold now (faded). */
  dimmed: boolean;
}>;

/** The 3D view's side of the overlay (HouseViewer). */
export type BubbleProjector = Readonly<{
  project: (point: PlanPoint) => ScreenPoint | null;
  anchorPoint: (anchor: HaBubbleAnchorValue) => PlanPoint | null;
  roomFrame: (areaId: string) => RoomFrame | null;
}>;

export type BubbleGestureDetail = Readonly<{ id: string; gesture: Gesture }>;
export type BubbleMoveDetail = Readonly<{ id: string; clientX: number; clientY: number }>;

type Press = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  moved: boolean;
  held: boolean;
  holdTimer: number;
  /** Edit mode: where a dragged placed bubble is now (overlay px). */
  drag: ScreenPoint | null;
};

/** A glyph for an icon name outside Home Assistant (no `ha-icon`): its first letter in a circle. */
const glyphOf = (icon: string): string => (icon.split(":").pop() ?? "?").charAt(0).toUpperCase();

/** The room row's direction: the projection of one metre along the room's longest side. */
const axisLengthMm = 1000;

export class HomeplanBubbleOverlay extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    items: { attribute: false },
    editing: { attribute: false },
    projector: { attribute: false },
  };

  static override styles = [
    tokens,
    css`
      :host {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }
      .bubble {
        position: absolute;
        left: 0;
        top: 0;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 34px;
        padding: 0 12px 0 7px;
        border-radius: 17px;
        background: var(--hp-surface);
        color: var(--hp-text);
        box-shadow:
          var(--hp-shadow),
          0 1px 4px rgba(0, 0, 0, 0.18);
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        touch-action: none;
        pointer-events: auto;
        will-change: transform;
        visibility: hidden;
      }
      .bubble[data-icon-only] {
        width: 34px;
        padding: 0;
        justify-content: center;
      }
      /* Icon-only style: no background, e.g. a camera icon (owner K14). */
      .bubble[data-bare] {
        background: transparent;
        box-shadow: none;
        padding: 0 4px;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
      }
      /* Choosing sweep corners (8.6): taps go through the bubbles to the house. */
      :host([data-passive]) .bubble {
        pointer-events: none;
      }
      .bubble[data-dimmed] {
        opacity: 0.45;
      }
      .bubble[data-editing] {
        outline: 2px dashed var(--hp-accent);
        outline-offset: 2px;
      }
      .bubble[data-dragging] {
        opacity: 0.7;
        cursor: grabbing;
      }
      ha-icon,
      .glyph {
        --mdc-icon-size: 20px;
        width: 20px;
        height: 20px;
        flex: none;
        color: var(--state-icon-color, var(--hp-accent));
      }
      .bubble[data-active] ha-icon,
      .bubble[data-active] .glyph {
        color: var(--state-active-color, var(--amber-color, #ffc107));
      }
      .glyph {
        display: inline-grid;
        place-items: center;
        border-radius: 50%;
        border: 2px solid currentColor;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
      }
    `,
  ];

  declare store: HassStore | undefined;
  declare items: readonly BubbleItem[];
  declare editing: boolean;
  declare projector: BubbleProjector | null;
  /** Each drawn bubble's size, measured after Lit renders (never during a frame). */
  private sizes = new Map<string, Readonly<{ width: number; height: number }>>();
  private elements = new Map<string, HTMLElement>();
  private press: Press | null = null;
  private readonly taps = new TapSequence();

  constructor() {
    super();
    this.items = [];
    this.editing = false;
    this.projector = null;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.press !== null) window.clearTimeout(this.press.holdTimer);
    this.press = null;
    this.taps.dispose();
  }

  protected override updated(): void {
    this.elements = new Map();
    this.sizes = new Map();
    for (const element of this.renderRoot.querySelectorAll<HTMLElement>(".bubble")) {
      const id = element.dataset.id;
      if (id === undefined) continue;
      this.elements.set(id, element);
      this.sizes.set(id, { width: element.offsetWidth, height: element.offsetHeight });
    }
    this.reposition();
  }

  /** Writes every bubble's screen position from the current camera (called after each 3D frame). */
  reposition(): void {
    const projector = this.projector;
    if (projector === null) return;
    const positions = new Map<string, ScreenPoint>();
    const rooms = new Map<string, BubbleItem[]>();
    for (const item of this.items) {
      if (item.place.kind === "room") {
        const list = rooms.get(item.place.areaId) ?? [];
        list.push(item);
        rooms.set(item.place.areaId, list);
        continue;
      }
      const point = projector.anchorPoint(item.place.anchor);
      const screen = point === null ? null : projector.project(point);
      if (screen !== null) positions.set(item.id, screen);
    }
    for (const [areaId, list] of rooms) {
      const frame = projector.roomFrame(areaId);
      const center = frame === null ? null : projector.project(frame.center);
      if (frame === null || center === null) continue;
      const ahead = projector.project({
        x: frame.center.x + frame.axis.x * axisLengthMm,
        y: frame.center.y + frame.axis.y * axisLengthMm,
        h: frame.center.h,
      });
      const direction = ahead === null ? { x: 1, y: 0 } : { x: ahead.x - center.x, y: ahead.y - center.y };
      const sizes = list.map((item) => this.sizes.get(item.id) ?? { width: 34, height: 34 });
      rowCenters(center, direction, sizes).forEach((screen, index) => {
        const item = list[index];
        if (item !== undefined) positions.set(item.id, screen);
      });
    }
    const dragged = this.press?.drag ?? null;
    for (const [id, element] of this.elements) {
      const screen = dragged !== null && this.press?.id === id ? dragged : positions.get(id);
      const size = this.sizes.get(id) ?? { width: 34, height: 34 };
      if (screen === undefined) {
        element.style.visibility = "hidden";
        continue;
      }
      element.style.visibility = "visible";
      element.style.transform = `translate(${(screen.x - size.width / 2).toFixed(1)}px, ${(screen.y - size.height / 2).toFixed(1)}px)`;
    }
  }

  private emit(name: string, detail: BubbleGestureDetail | BubbleMoveDetail | string): void {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  private hasDoubleTap(item: BubbleItem): boolean {
    const action = item.content.doubleTapAction;
    return action !== undefined && action.action !== "none";
  }

  private pointerDown(event: PointerEvent, item: BubbleItem): void {
    // Bubbles are picked first: the canvas (orbit, 3D picking) never sees this press.
    event.stopPropagation();
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.currentTarget instanceof HTMLElement) event.currentTarget.setPointerCapture(event.pointerId);
    if (this.press !== null) window.clearTimeout(this.press.holdTimer);
    const press: Press = {
      id: item.id,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      held: false,
      holdTimer: 0,
      drag: null,
    };
    press.holdTimer = window.setTimeout(() => {
      if (press.moved || this.editing) return;
      press.held = true;
      this.emit("bubble-gesture", { id: item.id, gesture: "hold" });
    }, gestureTiming.holdMs);
    this.press = press;
  }

  private pointerMove(event: PointerEvent, item: BubbleItem): void {
    event.stopPropagation();
    const press = this.press;
    if (press?.id !== item.id) return;
    if (
      !press.moved &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > gestureTiming.tapSlopPx
    ) {
      press.moved = true;
      window.clearTimeout(press.holdTimer);
    }
    // Edit mode: a placed bubble follows the pointer; its new anchor is found where it is dropped.
    if (!press.moved || !this.editing || item.place.kind !== "placed") return;
    const rect = this.getBoundingClientRect();
    press.drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.elements.get(item.id)?.toggleAttribute("data-dragging", true);
    this.reposition();
  }

  private pointerUp(event: PointerEvent, item: BubbleItem): void {
    event.stopPropagation();
    const press = this.press;
    this.press = null;
    if (press?.id !== item.id) return;
    window.clearTimeout(press.holdTimer);
    this.elements.get(item.id)?.toggleAttribute("data-dragging", false);
    if (event.type === "pointercancel") {
      this.reposition();
      return;
    }
    if (press.drag !== null) {
      this.emit("bubble-move", {
        id: item.id,
        clientX: event.clientX,
        clientY: event.clientY,
      });
      return;
    }
    if (press.moved || press.held) return;
    if (this.editing) {
      this.emit("bubble-edit", item.id);
      return;
    }
    const doubles = this.hasDoubleTap(item);
    this.taps.tap(
      { kind: "bubble", id: item.id },
      doubles,
      () => {
        this.emit("bubble-gesture", { id: item.id, gesture: "tap" });
      },
      () => {
        if (doubles) this.emit("bubble-gesture", { id: item.id, gesture: "doubleTap" });
      },
    );
  }

  private renderIcon(name: string): TemplateResult {
    return customElements.get("ha-icon") === undefined
      ? html`<span class="glyph" aria-hidden="true">${glyphOf(name)}</span>`
      : html`<ha-icon .icon=${name}></ha-icon>`;
  }

  private renderBubble(item: BubbleItem): TemplateResult {
    const content = item.content;
    const entityId = content.stateEntityId ?? null;
    const entity = entityId === null ? undefined : this.store?.entity(entityId);
    const text = bubbleText(content, entity);
    const name = entity?.attributes.friendly_name;
    const label = [typeof name === "string" ? name : entityId, text]
      .filter((part) => part !== null)
      .join(": ");
    return html`<div
      class="bubble"
      role="button"
      tabindex="-1"
      aria-label=${label === "" ? "Bubble" : label}
      title=${label}
      data-id=${item.id}
      ?data-icon-only=${text === null && content.style !== "bare"}
      ?data-bare=${content.style === "bare"}
      ?data-active=${bubbleActive(entity)}
      ?data-dimmed=${item.dimmed}
      ?data-editing=${this.editing}
      @pointerdown=${(event: PointerEvent) => {
        this.pointerDown(event, item);
      }}
      @pointermove=${(event: PointerEvent) => {
        this.pointerMove(event, item);
      }}
      @pointerup=${(event: PointerEvent) => {
        this.pointerUp(event, item);
      }}
      @pointercancel=${(event: PointerEvent) => {
        this.pointerUp(event, item);
      }}
      @contextmenu=${(event: Event) => {
        event.preventDefault();
      }}
    >
      ${this.renderIcon(bubbleIcon(content, entity))} ${text === null ? nothing : html`<span>${text}</span>`}
    </div>`;
  }

  protected override render(): TemplateResult {
    return html`${repeat(
      this.items,
      (item) => item.id,
      (item) => this.renderBubble(item),
    )}`;
  }
}
