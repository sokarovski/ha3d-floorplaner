// Repeatable checks for the owner's selection/Auto-select contract using the actual tool controller.
// No browser, server, or saved house is involved; runtime projections are deterministic plan coordinates.
import assert from "node:assert/strict";
import { createArea, createHouseDocument, createWall } from "../shared/domain/house/defaults.ts";
import { createId } from "../shared/domain/ids.ts";
import { createLight } from "../shared/domain/commands/furnishingCommands.ts";
import { WallableInstance } from "../shared/domain/schemas/instances.ts";
import { withTemplateParameters } from "../shared/domain/templates/instanceSchema.ts";
import { createHouseClient } from "../src/api/houseClient.ts";
import { createHttpClient } from "../src/api/httpClient.ts";
import { registerInstanceSchema } from "../src/features/floor-builder/services/instanceSchemas.ts";
import { selectedObjectsOverlay } from "../src/features/floor-builder/services/objectSelectionOverlay.ts";
import { viewportSelectionFor } from "../src/features/floor-builder/services/viewportSelection.ts";
import { createEditorSession } from "../src/features/floor-builder/services/editorSession.ts";
import { createToolController } from "../src/features/floor-builder/tools/toolController.ts";
import { createInertRuntime } from "../src/renderer/inertRuntime.ts";
import { floorPlacementOf } from "../shared/domain/house/floorPlacement.ts";
import { floorOutlineInHouse, snapFloorMove } from "../shared/geometry/floorMove.ts";
import { enterAreaEditor, enterRoof, openFloor } from "../src/features/floor-builder/services/treeActions.ts";
import { leaveEditLevel } from "../src/features/floor-builder/services/editContext.ts";
import { applyViewportDoubleClick } from "../src/features/floor-builder/services/viewportDoubleClick.ts";
import { floorBoxOverlay } from "../src/features/floor-builder/services/houseOverlay.ts";
import { floorSlabOf, tallestWallMm } from "../shared/domain/house/floorPlacement.ts";
import { buildMultiStoreyHouse } from "./fixtures/multiStoreyHouse.ts";
import { createToolPointer } from "../src/features/floor-builder/tools/toolPointer.ts";
import { clickSlopPx, dragHoldMs, touchClickSlopPx } from "../src/renderer/pointerSlop.ts";
import { addCanopyCommand } from "../shared/domain/commands/roofCommands.ts";

const noop = () => undefined;

const fixture = (tool, autoSelect, mode = "overview", runtimeOverrides = () => ({})) => {
  const house = createHouseDocument(createId("h"), "Selection check");
  const [floor] = house.floors;
  const a = createArea("A", { x: 0, y: 0 });
  const b = createArea("B", { x: 7000, y: 0 });
  for (const area of [a, b]) {
    area.floor.shapes.push({
      id: createId("s"),
      type: "rectangle",
      positionMm: { x: 0, y: 0 },
      rotationDeg: 0,
      widthMm: 4000,
      heightMm: 3000,
    });
    area.lights.push(createLight(`${area.name} light`, { x: 0, y: 0 }));
  }
  floor.areas.push(a, b);
  const client = createHouseClient(
    createHttpClient("http://unused.invalid", () => {
      throw new Error("Selection checks must not call the API.");
    }),
  );
  const session = createEditorSession(house.id, house, 0, client);
  session.ui.setState({
    tool,
    autoSelect,
    mode,
    focusAreaId: mode === "area" ? a.id : undefined,
    selection: [a.id],
    magnetic: false,
  });
  const previews = new Map();
  const runtime = {
    ...createInertRuntime("selection check"),
    planPointAt: (x, y, h = 0) => ({ x, y: y + h }),
    screenPointOf: ({ x, y, h }) => ({ x, y: y - h }),
    setAreaPreviewTransform: (id, transform) => {
      if (transform === null) previews.delete(id);
      else previews.set(id, transform);
    },
    ...runtimeOverrides(session),
  };
  const controller = createToolController(session, runtime, {
    setOverlay: noop,
    setReadout: noop,
    setHint: noop,
    setCue: noop,
    setCursor: noop,
  });
  const send = (phase, x, y, hit = { kind: "floor", areaId: b.id, pointMm: { x, y, h: 0 } }, extra = {}) =>
    controller.pointer({
      type: "pointer",
      phase,
      screen: { x, y },
      plan: { x, y },
      hit,
      button: phase === "move" ? -1 : 0,
      buttons: phase === "down" ? 1 : 0,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      ...extra,
    });
  return {
    a,
    b,
    session,
    previews,
    send,
    controller,
    runtime,
    count: () => session.history.getState().past.length,
    document: () => session.documents.getState().document,
    dispose: () => {
      controller.dispose();
      session.dispose();
    },
  };
};

let scenarios = 0;
const check = (name, run) => {
  run();
  scenarios += 1;
  process.stdout.write(`PASS ${name}\n`);
};

// Rotate starts only from a grip of a selected room (Phase 4.0): grips sit at the side midpoints of a
// room's bounding box, so the right grip of a 4000 × 3000 room at x is (x + 2000, 0). Nudge acts from any
// point. Where a press lands to act on a room, and where the gesture ends:
const actPoint = (tool, f, id) => {
  const x = id === f.a.id ? 0 : 7000;
  return tool === "rotateArea" ? { x: x + 2000, y: 0 } : { x: 7100, y: 0 };
};
const endPoint = (tool, f, id) =>
  tool === "rotateArea" ? { x: id === f.a.id ? 0 : 7000, y: 2000 } : { x: 7000, y: 100 };
const hitOn = (id, point) => ({ kind: "floor", areaId: id, pointMm: { ...point, h: 0 } });

for (const tool of ["nudge", "rotateArea"]) {
  for (const gesture of ["click", "drag"]) {
    for (const autoSelect of [false, true]) {
      check(`${tool}: A selected, press B; Auto-select ${autoSelect ? "on" : "off"}; ${gesture}`, () => {
        const f = fixture(tool, autoSelect);
        try {
          const original = structuredClone(f.document());
          f.send("move", 7100, 0);
          assert.deepEqual(f.session.ui.getState().selection, [f.a.id], "Hover must not select B.");
          f.send("down", 7100, 0);
          const editedId = autoSelect ? f.b.id : f.a.id;
          assert.deepEqual(f.session.ui.getState().selection, [editedId], "Wrong first-click selection.");
          if (autoSelect || tool === "rotateArea") {
            // Auto-select: a selection-only click. Rotate with Auto-select off: B's body is not a grip of
            // the selection, so nothing starts and nothing is selected.
            f.send("move", 7000, 100, undefined, { buttons: 1 });
            f.send("up", 7000, 100);
            f.send("move", 7100, 0);
            assert.equal(f.count(), 0, "A press that is not an action must return without editing.");
            assert.equal(
              f.previews.size,
              0,
              "A press that is not an action must not leave a running operation.",
            );
            assert.deepEqual(f.document(), original, "A press that is not an action changed the document.");
            assert.deepEqual(f.session.ui.getState().selection, [editedId]);
          }
          const start = actPoint(tool, f, editedId);
          const end = endPoint(tool, f, editedId);
          if (autoSelect || tool === "rotateArea") f.send("down", start.x, start.y, hitOn(editedId, start));
          if (gesture === "click") f.send("up", start.x, start.y, hitOn(editedId, start));
          f.send("move", end.x, end.y, undefined, { buttons: gesture === "drag" ? 1 : 0 });
          assert.equal(f.previews.has(editedId), true, "Preview targets the wrong entity.");
          if (gesture === "click") f.send("down", end.x, end.y);
          f.send("up", end.x, end.y);
          assert.equal(f.count(), 1, "The operation must commit exactly once.");
          assert.deepEqual(f.session.ui.getState().selection, [editedId], "Action changed selection.");
          const [nextA, nextB] = f.document().floors[0].areas;
          if (autoSelect) {
            assert.deepEqual(nextA, original.floors[0].areas[0], "A must remain unchanged.");
            assert.notDeepEqual(nextB, original.floors[0].areas[1], "B must be edited.");
          } else {
            assert.notDeepEqual(nextA, original.floors[0].areas[0], "A must be edited.");
            assert.deepEqual(nextB, original.floors[0].areas[1], "B must remain unchanged.");
          }
        } finally {
          f.dispose();
        }
      });
    }
  }
  for (const autoSelect of [false, true]) {
    check(`${tool}: no selection; Auto-select ${autoSelect ? "on" : "off"}`, () => {
      const f = fixture(tool, autoSelect);
      try {
        f.session.ui.setState({ selection: [] });
        f.send("move", 7100, 0);
        assert.deepEqual(f.session.ui.getState().selection, [], "Hover acquired a target.");
        f.send("down", 7100, 0);
        f.send("move", 7000, 100, undefined, { buttons: 1 });
        f.send("up", 7000, 100);
        assert.deepEqual(f.session.ui.getState().selection, autoSelect ? [f.b.id] : []);
        assert.equal(f.count(), 0, "Empty-selection click must not edit anything.");
        assert.equal(f.previews.size, 0);
      } finally {
        f.dispose();
      }
    });
    check(`${tool}: clicked target already selected; Auto-select ${autoSelect ? "on" : "off"}`, () => {
      const f = fixture(tool, autoSelect);
      try {
        f.session.ui.setState({ selection: [f.b.id] });
        const start = actPoint(tool, f, f.b.id);
        const end = endPoint(tool, f, f.b.id);
        f.send("down", start.x, start.y, hitOn(f.b.id, start));
        f.send("move", end.x, end.y, undefined, { buttons: 1 });
        f.send("up", end.x, end.y);
        assert.equal(f.count(), 1, "An already-selected target must act immediately.");
        assert.deepEqual(f.session.ui.getState().selection, [f.b.id]);
      } finally {
        f.dispose();
      }
    });
  }
}

for (const kind of ["shape", "light"]) {
  for (const autoSelect of [false, true]) {
    check(`Nudge ${kind}: selected A versus clicked B; Auto-select ${autoSelect ? "on" : "off"}`, () => {
      const f = fixture("nudge", autoSelect, "area");
      try {
        // Both targets belong to the focused room; the pointer is over an unselected light.
        const a = kind === "shape" ? f.a.floor.shapes[0] : f.a.lights[0];
        const b = createLight("Other light", { x: 1000, y: 0 });
        const document = structuredClone(f.document());
        document.floors[0].areas[0].lights.push(b);
        f.session.replaceDocument(document, 0);
        f.session.ui.setState({ selection: [a.id] });
        const hit = { kind: "light", lightId: b.id, areaId: f.a.id, pointMm: { x: 1000, y: 0, h: 0 } };
        f.send("move", 1000, 0, hit);
        assert.deepEqual(f.session.ui.getState().selection, [a.id]);
        f.send("down", 1000, 0, hit);
        f.send("move", 1300, 120, hit, { buttons: 1, ctrlKey: true });
        f.send("up", 1300, 120, hit, { ctrlKey: true });
        assert.deepEqual(f.session.ui.getState().selection, [autoSelect ? b.id : a.id]);
        assert.equal(f.count(), autoSelect ? 0 : 1);
      } finally {
        f.dispose();
      }
    });
  }
}
// Shift held at the press flips Auto-select in Nudge and Rotate (owner, Phase 4 follow-up).
for (const tool of ["nudge", "rotateArea"]) {
  check(`${tool}: Shift flips Auto-select off → selects B without editing`, () => {
    const f = fixture(tool, false);
    try {
      const original = structuredClone(f.document());
      f.send("down", 7100, 0, undefined, { shiftKey: true });
      f.send("up", 7100, 0, undefined, { shiftKey: true });
      assert.deepEqual(f.session.ui.getState().selection, [f.b.id], "Shift-click must select B.");
      assert.equal(f.count(), 0);
      assert.equal(f.previews.size, 0);
      assert.deepEqual(f.document(), original);
    } finally {
      f.dispose();
    }
  });
  check(`${tool}: Shift flips Auto-select on → edits the selection A`, () => {
    const f = fixture(tool, true);
    try {
      const start = actPoint(tool, f, f.a.id);
      const end = endPoint(tool, f, f.a.id);
      const hit = tool === "rotateArea" ? hitOn(f.a.id, start) : undefined;
      f.send("down", start.x, start.y, hit, { shiftKey: true });
      f.send("move", end.x, end.y, undefined, { buttons: 1, shiftKey: true });
      f.send("up", end.x, end.y, undefined, { shiftKey: true });
      assert.deepEqual(f.session.ui.getState().selection, [f.a.id], "Shift-click must keep A selected.");
      assert.equal(f.count(), 1, "Shift-click on A's operation must commit once.");
    } finally {
      f.dispose();
    }
  });
}

// Wall items select as themselves (Phase 15.8, owner report): a door shows its own box and stretch handles, never
// its wall's highlight; a handle drag changes its width or height within the template's limits in one undo
// step; the wall itself still highlights. Room A's bottom wall runs along y = −1500 from x = −2000 (its span
// start) to 2000; the door is 900 × 2100 at 2000 mm along it (centre x = 0). The test runtime's screen is the
// plan with height subtracted from y, so the handle at (x, y, h) is on screen at (x, y − h).
registerInstanceSchema(
  "check-door",
  1,
  withTemplateParameters(WallableInstance, {
    parameterProperties: {
      widthMm: { type: "number", minimum: 700, maximum: 1200 },
      heightMm: { type: "number", minimum: 1900, maximum: 2400 },
    },
  }),
);
const doorFixture = (tool = "select") => {
  let ids;
  const f = fixture(tool, false, "area", (session) => {
    const openingOf = () =>
      session.documents
        .getState()
        .document.floors[0].areas[0].walls[0].objects.find((opening) => opening.id === ids?.opening);
    return {
      // The door's box from its current parameters, as the built model would give it (corners: bottom 4, top 4).
      instanceBounds: (id) => {
        const opening = openingOf();
        if (opening === undefined || id !== opening.id) return null;
        const x = -2000 + opening.placement.distanceAlongWallMm;
        const half = opening.parameters.widthMm / 2;
        const bottom = opening.placement.bottomMm;
        const top = bottom + opening.parameters.heightMm;
        const ring = [
          [x - half, -1400],
          [x + half, -1400],
          [x + half, -1600],
          [x - half, -1600],
        ];
        return [bottom, top].flatMap((h) => ring.map(([px, py]) => ({ x: px, y: py, h })));
      },
      heightOnVertical: (_x, y, at) => at.y - y,
      worldUnitsPerPixel: () => 1,
    };
  });
  const document = structuredClone(f.document());
  const area = document.floors[0].areas[0];
  const wall = createWall(area.floor.shapes[0].id, "bottom");
  const opening = {
    id: createId("o"),
    name: "Door",
    templateId: "check-door",
    templateVersion: 1,
    placement: { distanceAlongWallMm: 2000, bottomMm: 0 },
    parameters: { widthMm: 900, heightMm: 2100 },
    flip: { x: false, z: false },
    materialOverrides: {},
  };
  wall.objects.push(opening);
  area.walls.push(wall);
  f.session.replaceDocument(document, 0);
  ids = { opening: opening.id, wall: wall.id };
  f.session.ui.setState({ selection: [] });
  const door = () => f.document().floors[0].areas[0].walls[0].objects[0];
  const doorHit = {
    kind: "object",
    instanceId: opening.id,
    areaId: f.a.id,
    wallId: wall.id,
    pointMm: { x: 0, y: -1500, h: 1000 },
  };
  return { ...f, ids, door, doorHit };
};
const view3d = { topView: false, wallsVisible: true, wallItemHandles: true };
const countKinds = (overlay) => ({
  segments: overlay.filter((primitive) => primitive.kind === "segment").length,
  dots: overlay.filter((primitive) => primitive.kind === "point" && primitive.marker === "dot").length,
  crosses: overlay.filter((primitive) => primitive.kind === "point" && primitive.marker === "cross").length,
});

check("Wall items: clicking a door selects it with its own box and handles, not the wall", () => {
  const f = doorFixture();
  try {
    f.send("down", 0, -2500, f.doorHit);
    f.send("up", 0, -2500, f.doorHit);
    assert.deepEqual(f.session.ui.getState().selection, [f.ids.opening], "The door must be selected.");
    const highlight = viewportSelectionFor(f.document(), [f.ids.opening]);
    assert.deepEqual(highlight.wallIds, [], "A selected door must not highlight its wall.");
    const overlay = selectedObjectsOverlay(f.document(), [f.ids.opening], f.runtime, view3d);
    assert.deepEqual(
      countKinds(overlay),
      { segments: 12, dots: 8, crosses: 1 },
      "Door box: 12 edges, 4 corners + 4 sides, Move.",
    );
    const top = selectedObjectsOverlay(f.document(), [f.ids.opening], f.runtime, {
      ...view3d,
      topView: true,
    });
    assert.deepEqual(
      countKinds(top),
      { segments: 12, dots: 2, crosses: 1 },
      "Top view: the two width handles and Move.",
    );
    const hidden = selectedObjectsOverlay(f.document(), [f.ids.opening], f.runtime, {
      ...view3d,
      wallsVisible: false,
    });
    assert.equal(hidden.length, 0, "With walls off the door is not drawn, nor its box.");
  } finally {
    f.dispose();
  }
});

check("Wall items: selecting the wall itself still highlights the wall", () => {
  const f = doorFixture();
  try {
    const wallHit = {
      kind: "wall",
      wallId: f.ids.wall,
      areaId: f.a.id,
      side: "exterior",
      pointMm: { x: 1500, y: -1500, h: 1000 },
    };
    f.send("down", 1500, -2500, wallHit);
    f.send("up", 1500, -2500, wallHit);
    assert.deepEqual(f.session.ui.getState().selection, [f.ids.wall]);
    assert.deepEqual(viewportSelectionFor(f.document(), [f.ids.wall]).wallIds, [f.ids.wall]);
    assert.equal(selectedObjectsOverlay(f.document(), [f.ids.wall], f.runtime, view3d).length, 0);
  } finally {
    f.dispose();
  }
});

check("Wall items: side and top handles resize the door within its limits, one undo step each", () => {
  const f = doorFixture();
  try {
    f.session.ui.setState({ selection: [f.ids.opening] });
    // Right side handle (450, −1500, 1050): click–move–click to x = 650 widens it to 1100 with the left side fixed.
    f.send("down", 450, -2550, f.doorHit);
    f.send("up", 450, -2550, f.doorHit);
    f.send("move", 650, -2550, null);
    assert.equal(f.count(), 0, "A running resize only previews.");
    f.send("down", 650, -2550, null);
    f.send("up", 650, -2550, null);
    assert.equal(f.count(), 1, "One resize is one undo step.");
    assert.equal(f.door().parameters.widthMm, 1100);
    assert.equal(f.door().placement.distanceAlongWallMm, 2100, "The left side stays where it was.");
    // Top handle (100, −1500, 2100) dragged far up stops at the template's 2400 mm maximum.
    f.send("down", 100, -3600, f.doorHit);
    f.send("move", 100, -5000, null, { buttons: 1 });
    f.send("up", 100, -5000, null);
    assert.equal(f.count(), 2, "A drag–release resize commits once.");
    assert.equal(f.door().parameters.heightMm, 2400, "Height is limited by the template.");
    assert.equal(f.door().placement.bottomMm, 0);
    assert.deepEqual(f.session.ui.getState().selection, [f.ids.opening], "Resizing keeps the door selected.");
    // Left side dragged far past the span start: the width stops at the template maximum, inside the wall.
    f.send("down", -450, -2700, f.doorHit);
    f.send("move", -3000, -2700, null, { buttons: 1 });
    f.send("up", -3000, -2700, null);
    assert.equal(f.door().parameters.widthMm, 1200, "Width is limited by the template's maximum.");
    // Typed size at a corner (top right at x 650, h 2400): "1000 x 2000" then Enter.
    f.send("down", 650, -3900, f.doorHit);
    f.send("up", 650, -3900, f.doorHit);
    for (const key of [..."1000x2000", "Enter"])
      f.controller.key({
        key,
        type: "keydown",
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
      });
    assert.equal(f.count(), 4);
    assert.equal(f.door().parameters.widthMm, 1000);
    assert.equal(f.door().parameters.heightMm, 2000);
  } finally {
    f.dispose();
  }
});
check("Wall items: a stretched door stays on its wall's span", () => {
  const f = doorFixture();
  try {
    const document = structuredClone(f.document());
    document.floors[0].areas[0].walls[0].objects[0].placement.distanceAlongWallMm = 3500;
    f.session.replaceDocument(document, 0);
    f.session.ui.setState({ selection: [f.ids.opening] });
    // The box runs 1050..1950 on a span ending at 2000: the right side cannot pass the wall's end.
    f.send("down", 1950, -2550, f.doorHit);
    f.send("move", 3000, -2550, null, { buttons: 1 });
    f.send("up", 3000, -2550, null);
    assert.equal(f.count(), 1);
    assert.equal(f.door().parameters.widthMm, 950);
    assert.equal(f.door().placement.distanceAlongWallMm, 3525);
  } finally {
    f.dispose();
  }
});
// ---- Whole-house overview and floor Move (Phase 16.4) -------------------------------------------------------
// The runtime stub is in the house frame: screen (x, y) is plan (x, y) on any plane, and a screen y is the height
// −y on a vertical line (so the blue lock reads heights from the pointer).
const houseFixture = () => {
  const house = buildMultiStoreyHouse(createId("h"));
  const client = createHouseClient(
    createHttpClient("http://unused.invalid", () => {
      throw new Error("Floor move checks must not call the API.");
    }),
  );
  const session = createEditorSession(house.id, house, 0, client);
  session.ui.setState({ magnetic: true, autoSelect: false });
  const offsets = [];
  const runtime = {
    ...createInertRuntime("floor move check"),
    planPointAt: (x, y) => ({ x, y }),
    heightOnVertical: (_x, y) => -y,
    setFloorPreviewOffsets: (next) => {
      offsets.push(next === null ? null : new Map(next));
    },
  };
  const controller = createToolController(session, runtime, {
    setOverlay: noop,
    setReadout: noop,
    setHint: noop,
    setCue: noop,
    setCursor: noop,
  });
  const floor = (name) => session.documents.getState().document.floors.find((value) => value.name === name);
  const hitOn = (name, point) => ({ kind: "buildingFloor", floorId: floor(name).id, pointMm: point });
  const send = (phase, x, y, hit = null, extra = {}) =>
    controller.pointer({
      type: "pointer",
      phase,
      screen: { x, y },
      plan: { x, y },
      hit,
      button: phase === "move" ? -1 : 0,
      buttons: phase === "down" ? 1 : 0,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      ...extra,
    });
  const keys = (sequence) => {
    for (const key of sequence)
      controller.key({
        key,
        type: "keydown",
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
      });
  };
  return {
    session,
    floor,
    hitOn,
    send,
    keys,
    offsets,
    placement: (name) => floorPlacementOf(floor(name)),
    count: () => session.history.getState().past.length,
    dispose: () => {
      controller.dispose();
      session.dispose();
    },
  };
};

check("House overview: a multi-floor house opens on it, a one-floor house on its floor", () => {
  const f = houseFixture();
  const single = fixture("select", false);
  try {
    assert.equal(f.session.ui.getState().houseOverview, true);
    assert.equal(single.session.ui.getState().houseOverview, false);
    assert.equal(leaveEditLevel(single.session), false, "A one-floor house has no level above its floor.");
  } finally {
    f.dispose();
    single.dispose();
  }
});

check(
  "House overview: Select picks whole floors (Shift adds); double-click enters; Escape-level leave selects it",
  () => {
    const f = houseFixture();
    try {
      f.send("down", 3000, 2000, f.hitOn("Ground", { x: 3000, y: 2000, h: 0 }));
      f.send("up", 3000, 2000);
      assert.deepEqual(f.session.ui.getState().selection, [f.floor("Ground").id]);
      f.send("down", 3000, 1500, f.hitOn("Attic", { x: 3000, y: 1500, h: 5450 }), { shiftKey: true });
      assert.deepEqual(f.session.ui.getState().selection, [f.floor("Ground").id, f.floor("Attic").id]);
      f.send("down", 50000, 50000, null);
      assert.deepEqual(f.session.ui.getState().selection, [], "Empty space clears the selection.");
      openFloor(f.session, f.floor("First").id);
      let ui = f.session.ui.getState();
      assert.equal(ui.houseOverview, false);
      assert.equal(ui.activeFloorId, f.floor("First").id);
      assert.equal(ui.mode, "overview");
      // Inside a room of the floor, leaving goes one level at a time: room → floor → whole house.
      enterAreaEditor(f.session, f.floor("First").areas[0].id);
      assert.equal(leaveEditLevel(f.session), true);
      assert.equal(f.session.ui.getState().mode, "overview");
      assert.equal(f.session.ui.getState().houseOverview, false);
      assert.equal(leaveEditLevel(f.session), true);
      ui = f.session.ui.getState();
      assert.equal(ui.houseOverview, true);
      assert.deepEqual(ui.selection, [f.floor("First").id], "Closing a floor selects it (SketchUp groups).");
      assert.equal(leaveEditLevel(f.session), false, "Nothing is above the whole house.");
    } finally {
      f.dispose();
    }
  },
);

check("Floor Move: click–move–click with a corner snap, preview only until commit, one undo step", () => {
  const f = houseFixture();
  try {
    const first = f.floor("First");
    const ground = f.floor("Ground");
    const c1 = floorOutlineInHouse(first)[0][0];
    // Ground's corner farthest along x (Kitchen's), well away from where First's corners are now.
    const c0 = floorOutlineInHouse(ground)
      .flat()
      .reduce((best, point) => (point.x > best.x ? point : best));
    f.session.ui.setState({ selection: [first.id], tool: "nudge" });
    const before = f.placement("First");
    f.send("down", c1.x, c1.y, f.hitOn("First", { x: c1.x, y: c1.y, h: before.elevationMm }));
    f.send("up", c1.x, c1.y);
    // Within the 10 mm capture of a Ground slab corner: the corner lands on it exactly.
    const target = { x: c0.x + 3, y: c0.y - 4 };
    f.send("move", target.x, target.y);
    assert.equal(f.count(), 0, "A running move only previews.");
    const last = f.offsets[f.offsets.length - 1];
    assert.ok(last instanceof Map && last.has(first.id), "The moving floor is previewed.");
    // Snap to Ground's nearest corner (not necessarily c0): check the committed corner sits on a Ground corner.
    f.send("down", target.x, target.y);
    f.send("up", target.x, target.y);
    assert.equal(f.count(), 1, "One move is one undo step.");
    assert.equal(f.offsets[f.offsets.length - 1], null, "The preview ends at the commit.");
    const moved = floorOutlineInHouse(f.floor("First"));
    const groundCorners = floorOutlineInHouse(f.floor("Ground")).flat();
    assert.ok(
      moved
        .flat()
        .some((point) =>
          groundCorners.some((corner) => Math.hypot(corner.x - point.x, corner.y - point.y) <= 0.1),
        ),
      "A First corner lies exactly on a Ground corner.",
    );
    assert.equal(f.placement("First").elevationMm, before.elevationMm, "A plan move keeps the elevation.");
    assert.deepEqual(f.placement("Ground"), floorPlacementOf(ground), "Other floors do not follow.");
    assert.equal(f.session.history.getState().past[0].label, "Move floor First");
    f.session.undo();
    assert.deepEqual(f.placement("First"), before, "Undo restores the placement.");
    f.session.redo();
    assert.notDeepEqual(f.placement("First"), before);
  } finally {
    f.dispose();
  }
});

check("Floor Move: several selected floors move together (Ctrl: no snapping); Escape cancels", () => {
  const f = houseFixture();
  try {
    const ids = [f.floor("First").id, f.floor("Attic").id];
    f.session.ui.setState({ selection: ids, tool: "nudge" });
    const before = {
      first: f.placement("First"),
      attic: f.placement("Attic"),
      ground: f.placement("Ground"),
    };
    f.send("down", 0, 0, null);
    f.send("up", 0, 0);
    f.send("move", 503, -7);
    f.keys(["Escape"]);
    assert.equal(f.count(), 0, "Escape cancels without history.");
    assert.equal(f.offsets[f.offsets.length - 1], null, "Escape drops the preview.");
    assert.equal(
      f.session.ui.getState().houseOverview,
      true,
      "Escape first cancels the move, not the level.",
    );
    f.send("down", 0, 0, null, { ctrlKey: true });
    f.send("move", 503, -7, null, { ctrlKey: true, buttons: 1 });
    f.send("up", 503, -7, null, { ctrlKey: true });
    assert.equal(f.count(), 1, "A drag–release move commits once.");
    assert.equal(f.session.history.getState().past[0].label, "Move 2 floors");
    for (const [name, key] of [
      ["First", "first"],
      ["Attic", "attic"],
    ]) {
      const now = f.placement(name);
      assert.equal(now.xMm, before[key].xMm + 503);
      assert.equal(now.yMm, before[key].yMm - 7);
      assert.equal(now.elevationMm, before[key].elevationMm);
    }
    assert.deepEqual(f.placement("Ground"), before.ground, "An unselected floor stays.");
  } finally {
    f.dispose();
  }
});

check(
  "Floor Move: ↑ locks blue; a typed height is exact; the slab underside snaps onto lower wall tops",
  () => {
    const f = houseFixture();
    try {
      const attic = f.floor("Attic");
      f.session.ui.setState({ selection: [attic.id], tool: "nudge" });
      const before = f.placement("Attic");
      // The fixture's attic sits with its 150 mm slab on First's 2500 mm walls (2800 + 2500 + 150).
      assert.equal(before.elevationMm, 5450);
      const grab = { x: 3000, y: 1500, h: before.elevationMm };
      f.send("down", 3000, -grab.h, f.hitOn("Attic", grab));
      f.send("up", 3000, -grab.h);
      f.keys(["ArrowUp", ..."1000", "Enter"]);
      assert.equal(f.count(), 1);
      assert.equal(f.placement("Attic").elevationMm, 6450, "Typed: exactly 1000 mm up.");
      assert.equal(f.placement("Attic").xMm, before.xMm, "Blue moves keep the plan position.");
      // Back down with the pointer to 6 mm above First's wall tops: it snaps to rest on them.
      const lifted = { x: 3000, y: 1500, h: 6450 };
      f.send("down", 3000, -lifted.h, f.hitOn("Attic", lifted));
      f.send("up", 3000, -lifted.h);
      f.keys(["ArrowUp"]);
      f.send("move", 3000, -(lifted.h - 994));
      f.send("down", 3000, -(lifted.h - 994));
      assert.equal(f.count(), 2);
      assert.equal(f.placement("Attic").elevationMm, 5450, "Slab on the walls of First.");
    } finally {
      f.dispose();
    }
  },
);

check(
  "Floor Move snaps: a corner on another floor's slab edge, then a second edge (corner registration)",
  () => {
    const house = buildMultiStoreyHouse(createId("h"));
    const [ground, first] = house.floors;
    const groundRing = floorOutlineInHouse(ground)[0];
    const firstRing = floorOutlineInHouse(first)[0];
    // Ground's bottom edge (lowest y) and First's lowest corner: aim that corner 6 mm under the edge's middle.
    const edgeY = Math.min(...groundRing.map((point) => point.y));
    const corner = firstRing.reduce((best, point) =>
      point.y < best.y || (point.y === best.y && point.x < best.x) ? point : best,
    );
    const midX = (Math.min(...groundRing.map((p) => p.x)) + Math.max(...groundRing.map((p) => p.x))) / 2;
    const raw = { x: midX - corner.x + 0.3, y: edgeY - corner.y - 6, h: 0 };
    const snap = snapFloorMove({
      house,
      moving: [first],
      others: [ground],
      raw,
      lock: "plane",
      radiusMm: 10,
    });
    assert.ok(Math.abs(corner.y + snap.offset.y - edgeY) < 1e-6, "The corner lands on the edge line.");
    assert.match(snap.label, /^Edges? of Ground/);
    const free = snapFloorMove({
      house,
      moving: [first],
      others: [ground],
      raw: { x: 100000, y: 0, h: 0 },
      lock: "plane",
      radiusMm: 10,
    });
    assert.equal(free.label, "", "Far from every outline nothing snaps.");
  },
);

check("Floor Move: → locks red with an exact typed distance", () => {
  const f = houseFixture();
  try {
    const ground = f.floor("Ground");
    f.session.ui.setState({ selection: [ground.id], tool: "nudge" });
    const before = f.placement("Ground");
    f.send("down", 0, 0, f.hitOn("Ground", { x: 0, y: 0, h: 0 }));
    f.send("up", 0, 0);
    f.send("move", 300, 900);
    f.keys(["ArrowRight", ..."750", "Enter"]);
    assert.equal(f.placement("Ground").xMm, before.xMm + 750);
    assert.equal(f.placement("Ground").yMm, before.yMm, "The red lock drops the green component.");
  } finally {
    f.dispose();
  }
});

check(
  "Double-click back (16.13): empty space inside a floor returns to the whole house; a room still opens",
  () => {
    const f = houseFixture();
    const single = fixture("select", false);
    const dbl = (session, hit) => applyViewportDoubleClick(session, { screen: { x: 0, y: 0 }, hit }, null);
    try {
      const first = f.floor("First");
      const room = first.areas[0];
      // Whole house: a double-click on a floor enters it.
      dbl(f.session, f.hitOn("First", { x: 0, y: 0, h: 2800 }));
      let ui = f.session.ui.getState();
      assert.equal(ui.houseOverview, false);
      assert.equal(ui.activeFloorId, first.id);
      // A double-click on a room of the open floor opens the Room Editor, not the whole house.
      dbl(f.session, { kind: "floor", areaId: room.id, pointMm: { x: 0, y: 0, h: 0 } });
      ui = f.session.ui.getState();
      assert.equal(ui.mode, "area");
      assert.equal(ui.focusAreaId, room.id);
      assert.equal(ui.houseOverview, false);
      // Empty space in the Room Editor goes back one level, to the floor; again, to the whole house.
      dbl(f.session, null);
      ui = f.session.ui.getState();
      assert.equal(ui.mode, "overview");
      assert.equal(ui.houseOverview, false, "One level per double-click.");
      dbl(f.session, null);
      ui = f.session.ui.getState();
      assert.equal(ui.houseOverview, true, "Empty space inside the floor returns to the whole house.");
      assert.deepEqual(ui.selection, [first.id], "Leaving the floor selects it.");
      // A measurement guide across the background counts as empty space.
      dbl(f.session, f.hitOn("First", { x: 0, y: 0, h: 2800 }));
      dbl(f.session, { kind: "helper", id: "guide", pointMm: { x: 0, y: 0, h: 0 } });
      assert.equal(f.session.ui.getState().houseOverview, true, "A guide under the pointer is empty space.");
      // A wall or a light of the floor is not empty space: it opens its room.
      dbl(f.session, f.hitOn("Ground", { x: 0, y: 0, h: 0 }));
      const wallRoom = f.floor("Ground").areas[0];
      dbl(f.session, {
        kind: "wall",
        wallId: wallRoom.walls[0].id,
        areaId: wallRoom.id,
        side: "exterior",
        pointMm: { x: 0, y: 0, h: 1000 },
      });
      assert.equal(f.session.ui.getState().focusAreaId, wallRoom.id);
      // A one-floor house has no whole house: empty space keeps its floor.
      dbl(single.session, null);
      assert.equal(single.session.ui.getState().houseOverview, false);
      assert.equal(single.session.ui.getState().mode, "overview");
    } finally {
      f.dispose();
      single.dispose();
    }
  },
);

check("Floor box (16.13): twelve edges from the slab underside to the tallest wall top", () => {
  const house = buildMultiStoreyHouse(createId("h"));
  const first = house.floors[1];
  const box = floorBoxOverlay(first, house, "accent");
  assert.equal(box.length, 12);
  assert.ok(box.every((primitive) => primitive.kind === "segment" && primitive.dashed !== true));
  const heights = new Set(box.flatMap((primitive) => [primitive.from.h, primitive.to.h]));
  const elevation = floorPlacementOf(first).elevationMm;
  assert.deepEqual(
    [...heights].sort((a, b) => a - b),
    [elevation - floorSlabOf(first).thicknessMm, elevation + tallestWallMm(first, house)],
  );
  const ring = floorOutlineInHouse(first).flat();
  const xs = new Set(box.flatMap((primitive) => [primitive.from.x, primitive.to.x]));
  assert.deepEqual(
    [...xs].sort((a, b) => a - b),
    [Math.min(...ring.map((p) => p.x)), Math.max(...ring.map((p) => p.x))],
  );
});

// ---- Phase 19.6: a quick click never nudges ----------------------------------------------------------
// The click slop (toolPointer.ts, pointerSlop.ts): a press that starts a move is a click until the pointer has moved
// more than the slop from the press point (6 px mouse, 12 px touch) or was held 250 ms and moved; a second click
// inside the slop cancels; a real drag moves by the pointer's offset from the press point.

const areaPosition = (f, id) => f.document().floors[0].areas.find((area) => area.id === id)?.positionMm;

check("19.6 quick click: press, a few px of jitter, release, click again: nothing changes", () => {
  const f = fixture("nudge", false);
  try {
    const original = structuredClone(f.document());
    f.send("down", 100, 0, hitOn(f.a.id, { x: 100, y: 0 }));
    f.send("move", 104, 2, hitOn(f.a.id, { x: 104, y: 2 }), { buttons: 1 });
    f.send("up", 104, 2);
    f.send("move", 105, 0);
    assert.equal(f.previews.size, 0, "Nothing may move inside the slop.");
    f.send("down", 105, 0);
    f.send("up", 105, 0);
    assert.equal(f.count(), 0, "A quick click made an undo step.");
    assert.deepEqual(f.document(), original, "A quick click changed the document.");
    assert.equal(f.session.ui.getState().toolOperationActive, false, "The click left an operation running.");
  } finally {
    f.dispose();
  }
});

check(
  "19.6 click–lock still works: a quick click, then a move past the slop and a click, moves by the offset",
  () => {
    const f = fixture("nudge", false);
    try {
      const before = structuredClone(areaPosition(f, f.a.id));
      f.send("down", 100, 0, hitOn(f.a.id, { x: 100, y: 0 }));
      f.send("up", 100, 0);
      f.send("move", 100 + clickSlopPx - 1, 0);
      assert.equal(f.previews.size, 0, "Inside the slop nothing previews.");
      f.send("move", 400, 0);
      assert.equal(f.previews.has(f.a.id), true, "Past the slop the room follows the pointer.");
      f.send("down", 400, 0);
      f.send("up", 400, 0);
      assert.equal(f.count(), 1, "One undo step.");
      const after = areaPosition(f, f.a.id);
      assert.equal(after.x - before.x, 300, "The move is the pointer's offset from the press (no jump).");
    } finally {
      f.dispose();
    }
  },
);

check("19.6 drag: a held press past the slop moves on release, by the offset from the press point", () => {
  const f = fixture("nudge", false);
  try {
    const before = structuredClone(areaPosition(f, f.a.id));
    f.send("down", 100, 0, hitOn(f.a.id, { x: 100, y: 0 }));
    f.send("move", 103, 0, undefined, { buttons: 1 });
    assert.equal(f.previews.size, 0, "Inside the slop a held press moves nothing.");
    f.send("move", 250, 0, undefined, { buttons: 1 });
    f.send("up", 250, 0);
    assert.equal(f.count(), 1, "The drag commits once.");
    assert.equal(areaPosition(f, f.a.id).x - before.x, 150);
  } finally {
    f.dispose();
  }
});

check("19.6 slop values: a held press moving 2 px after 250 ms drags; touch has the larger slop", () => {
  let clock = 0;
  const seen = [];
  let active = false;
  const handler = {
    isActive: () => active,
    pointer: (event) => {
      seen.push(`${event.phase}:${String(event.screen.x)}`);
      if (event.phase === "down") active = !active;
    },
    key: () => false,
    cancel: () => {
      active = false;
      seen.push("cancel");
    },
  };
  const f = fixture("nudge", false);
  try {
    const event = (phase, x, extra = {}) => ({
      type: "pointer",
      phase,
      screen: { x, y: 0 },
      plan: { x, y: 0 },
      hit: null,
      button: phase === "move" ? -1 : 0,
      buttons: phase === "up" ? 0 : 1,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      ...extra,
    });
    const env = {
      session: f.session,
      runtime: f.runtime,
      setOverlay: noop,
      setReadout: noop,
      setHint: noop,
      setCue: noop,
      setCursor: noop,
    };
    const pointer = createToolPointer(handler, env, true, () => clock);
    pointer(event("down", 0));
    pointer(event("move", 2));
    assert.deepEqual(seen, ["down:0"], "A 2 px move right away stays a click.");
    clock = dragHoldMs;
    pointer(event("move", 2));
    assert.deepEqual(seen, ["down:0", "move:2"], "Held 250 ms, a 2 px move starts the drag.");
    pointer(event("up", 2));
    seen.length = 0;
    active = false;
    clock = 0;
    pointer(event("down", 0, { pointerType: "touch" }));
    pointer(event("move", clickSlopPx + 2, { pointerType: "touch" }));
    assert.deepEqual(seen, ["down:0"], "A finger may wander past the mouse slop.");
    pointer(event("move", touchClickSlopPx + 1, { pointerType: "touch" }));
    assert.deepEqual(seen, ["down:0", `move:${String(touchClickSlopPx + 1)}`]);
  } finally {
    f.dispose();
  }
});

check("19.6 a light's Move handle: a quick click and a second click change nothing", () => {
  const f = fixture("select", false);
  try {
    const light = f.a.lights[0];
    f.session.ui.setState({ selection: [light.id], lightControls: "shown" });
    const original = structuredClone(f.document());
    const hit = { kind: "light", lightId: light.id, pointMm: { x: 0, y: 0, h: 0 } };
    f.send("down", 0, 0, hit);
    f.send("up", 0, 0, hit);
    f.send("move", 3, 0);
    f.send("down", 3, 0);
    f.send("up", 3, 0);
    assert.equal(f.count(), 0, "No undo step.");
    assert.deepEqual(f.document(), original);
  } finally {
    f.dispose();
  }
});

// ---- Phase 19.5: Move a canopy in the floor view ------------------------------------------------------

check(
  "19.5 canopy: Move in the floor view moves the selected canopy whole (points with it), one undo step",
  () => {
    const f = fixture("nudge", false);
    try {
      const floorId = f.document().floors[0].id;
      const added = addCanopyCommand(f.document(), floorId, f.a.id);
      assert.ok("command" in added);
      f.session.execute(added.command);
      const canopyOf = () => f.document().floors[0].roofs?.find((roof) => roof.id === added.roofId);
      const before = structuredClone(canopyOf());
      f.session.ui.setState({ selection: [added.roofId] });
      const steps = f.count();
      const h = before.eaveHeightMm + before.thicknessMm;
      const hit = { kind: "roof", roofId: added.roofId, floorId, pointMm: { x: 500, y: 500, h } };
      f.send("down", 500, 500 - h, hit);
      f.send("move", 503, 500 - h, undefined, { buttons: 1 });
      f.send("up", 503, 500 - h);
      f.send("down", 503, 500 - h);
      assert.equal(f.count(), steps, "A quick click on the canopy moves nothing.");
      f.send("down", 500, 500 - h, hit);
      f.send("move", 1300, 500 - h, undefined, { buttons: 1 });
      f.send("up", 1300, 500 - h);
      assert.equal(f.count(), steps + 1, "One undo step.");
      const after = canopyOf();
      assert.ok(
        after.points.every((point, index) => Math.abs(point.x - before.points[index].x - 800) < 1e-6),
        "Every point moved by 800 mm.",
      );
      assert.equal(after.eaveHeightMm, before.eaveHeightMm);
    } finally {
      f.dispose();
    }
  },
);

check("19.5 roof level: leaving it gives back the view the user had (3D or Top)", () => {
  const f = fixture("select", false);
  try {
    const floorId = f.document().floors[0].id;
    const added = addCanopyCommand(f.document(), floorId);
    assert.ok("command" in added);
    f.session.execute(added.command);
    for (const view of ["3d", "top"]) {
      f.session.ui.setState({ viewMode: view });
      enterRoof(f.session, added.roofId);
      assert.equal(f.session.ui.getState().viewMode, "top", "The roof level opens in Top.");
      leaveEditLevel(f.session);
      assert.equal(f.session.ui.getState().focusRoofId, undefined);
      assert.equal(f.session.ui.getState().viewMode, view, `Back in ${view}.`);
      assert.deepEqual(f.session.ui.getState().selection, [added.roofId], "The canopy is selected.");
    }
  } finally {
    f.dispose();
  }
});

process.stdout.write(`${scenarios} editor selection scenarios passed.\n`);
