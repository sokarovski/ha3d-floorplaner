// Frame scheduling and staged loading (Phases 15.3, 15.1): the viewport frame scheduler, the state
// animator and the ambient effects' timer under continuous frames (an orbit drag), and the asset load queue, all on a
// fake clock; and the whole house's static batching (Phase 18.1, src/renderer/staticBatch.ts), which keeps a whole-house
// frame to a few hundred draw calls. No browser or WebGL. Run: npm run frames:check
import {
  Group,
  Mesh,
  BufferGeometry,
  MeshBasicMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  SpotLight,
  Object3D,
} from "three";
import { createFrameScheduler } from "../src/renderer/frameScheduler.ts";
import { createStateAnimator, stateAnimationMs } from "../src/renderer/stateAnimation.ts";
import { createLoadQueue } from "../src/renderer/loadQueue.ts";
import {
  floorSlideChannel,
  floorSlideMs,
  slidePose,
  startFloorSlide,
} from "../ha-viewer/three/floorTransition.ts";
import { captureFloorGhost } from "../ha-viewer/three/floorGhost.ts";
import { createPlanRoot } from "../src/renderer/planFrame.ts";
import { BoxGeometry, MeshStandardMaterial, Vector3 } from "three";
import { batchBucketName, batchedLayer, createStaticBatch } from "../src/renderer/staticBatch.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `  (${detail})`}`);
};

// ---- a fake clock: timers and animation frames ---------------------------------------------------------------

const createClock = () => {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  let frameRequests = new Map();
  const clock = {
    now: () => now,
    setTimeout: (fn, ms = 0) => {
      const id = nextId++;
      timers.set(id, { due: now + Math.max(0, ms), fn });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
    request: (fn) => {
      const id = nextId++;
      frameRequests.set(id, fn);
      return id;
    },
    cancel: (id) => {
      frameRequests.delete(id);
    },
    pendingFrames: () => frameRequests.size,
    /** Runs timers due up to `target` in order, the clock at each timer's due time. */
    advanceTo: (target) => {
      for (;;) {
        let first = null;
        for (const [id, timer] of timers)
          if (timer.due <= target && (first === null || timer.due < first[1].due)) first = [id, timer];
        if (first === null) break;
        timers.delete(first[0]);
        now = Math.max(now, first[1].due);
        first[1].fn();
      }
      now = Math.max(now, target);
    },
    /** One display refresh: the frames requested so far run (requests made meanwhile wait for the next one). */
    vsync: () => {
      const callbacks = [...frameRequests.values()];
      frameRequests = new Map();
      for (const callback of callbacks) callback();
      return callbacks.length;
    },
  };
  return clock;
};

/** Runs the display at `hz` from the clock's time for `ms`; `beforeVsync` is the input of each refresh. */
const runDisplay = (clock, hz, ms, beforeVsync = () => undefined) => {
  const period = 1000 / hz;
  const end = clock.now() + ms;
  let frames = 0;
  for (let t = clock.now() + period; t <= end + 1e-6; t += period) {
    clock.advanceTo(t);
    beforeVsync(t);
    frames += clock.vsync();
  }
  return frames;
};

const scheduler = (clock, render = () => undefined) =>
  createFrameScheduler(clock, render, (error) => {
    throw error;
  });

// ---- 15.3: a state animation survives an orbit drag -------------------------------------------------------------

{
  const clock = createClock();
  let renders = 0;
  const frames = scheduler(clock, () => {
    renders += 1;
  });
  const animator = createStateAnimator();
  // As the viewer: the door is known closed, then HA reports it open.
  animator.update(new Map([["door", { angle: 0 }]]), clock.now(), true);
  animator.update(new Map([["door", { angle: 90 }]]), clock.now(), true);
  let lastPose = null;
  const states = frames.start({
    channel: "states",
    step: (now) => {
      const poses = animator.poses(now);
      lastPose = poses.get("door") ?? null;
      return poses.size > 0;
    },
  });
  // A camera spring that the drag grabs (cancels) a third of the way in.
  let cameraSteps = 0;
  const camera = frames.start({
    channel: "camera",
    step: () => {
      cameraSteps += 1;
      return true;
    },
  });
  let dragging = false;
  runDisplay(clock, 120, 1500, (t) => {
    if (t > stateAnimationMs / 3 && t < stateAnimationMs * 2) {
      // Every pointer move of the orbit drag: the first grabs the camera, each invalidates the view.
      if (!dragging) {
        dragging = true;
        frames.cancelChannel("camera");
      }
      frames.invalidate();
    }
  });
  check("orbit drag: the state animation completes", states.status() === "completed", states.status());
  check("orbit drag: the door ends on its target (no blend left)", lastPose === null);
  check("orbit drag: the camera move was cancelled by the grab", camera.status() === "cancelled");
  check(
    "orbit drag: the cancelled camera move is not stepped again",
    cameraSteps > 0 && cameraSteps < 60,
    String(cameraSteps),
  );
  check(
    "orbit drag: rendering settles afterwards (no frame requested)",
    !frames.pending() && clock.pendingFrames() === 0,
  );
  const rendered = renders;
  frames.invalidate();
  runDisplay(clock, 120, 100);
  check(
    "after idle a new change wakes exactly one frame",
    renders === rendered + 1,
    String(renders - rendered),
  );
}

// ---- 15.3: several animations; one ends, is cancelled, or throws; the others go on -----------------------------

{
  const clock = createClock();
  const errors = [];
  const frames = createFrameScheduler(
    clock,
    () => undefined,
    (error) => errors.push(error),
  );
  const until = (endMs) => (now) => now < endMs;
  const a = frames.start({ channel: "states", step: until(300) });
  const b = frames.start({ channel: "assets", step: until(900) });
  const c = frames.start({ channel: "camera", step: until(5000) });
  let thrown = 0;
  const d = frames.start({
    channel: "effects",
    step: () => {
      thrown += 1;
      throw new Error("broken step");
    },
  });
  runDisplay(clock, 60, 400);
  check("a finished animation completes", a.status() === "completed");
  check(
    "a throwing animation is cancelled once and reported",
    d.status() === "cancelled" && thrown === 1 && errors.length === 1,
  );
  c.cancel();
  check("cancelling one leaves the others active", c.status() === "cancelled" && b.status() === "active");
  runDisplay(clock, 60, 700);
  check("the remaining animation still completes", b.status() === "completed");
  check("idle once all ended", !frames.active() && !frames.pending());
}

// ---- 15.3 → 15.1: the opening-settled signal ignores other channels --------------------------------------------

{
  const clock = createClock();
  const frames = scheduler(clock);
  let settledAt = null;
  frames.start({ channel: "camera", step: (now) => now < 800 });
  // A state animation that keeps restarting (a blind reporting positions), and ambient frames every 125 ms.
  frames.start({ channel: "states", step: () => true });
  const effectTimer = () => {
    frames.invalidate();
    clock.setTimeout(effectTimer, 125);
  };
  effectTimer();
  frames.whenIdle(["camera"], () => {
    settledAt = clock.now();
  });
  runDisplay(clock, 60, 1200);
  check(
    "settled fires after the camera move, despite other running work",
    settledAt !== null && settledAt >= 800 && settledAt < 850,
    String(settledAt),
  );
  frames.dispose();
  const before = clock.pendingFrames();
  runDisplay(clock, 60, 300);
  check("dispose: no frame after it", before === 0 && clock.pendingFrames() === 0 && !frames.pending());
}

// ---- 15.3: a hidden tab (no frames for a while) does not strand an animation ------------------------------------

{
  const clock = createClock();
  const frames = scheduler(clock);
  const animator = createStateAnimator();
  animator.update(new Map([["blind", { closed: 0 }]]), 0, true);
  animator.update(new Map([["blind", { closed: 1 }]]), 0, true);
  const states = frames.start({ channel: "states", step: (now) => animator.poses(now).size > 0 });
  runDisplay(clock, 60, 100);
  clock.advanceTo(clock.now() + 5000); // the tab is hidden: no refreshes
  runDisplay(clock, 60, 50);
  check(
    "after a hidden tab the animation completes on its first frame back",
    states.status() === "completed",
  );
}

// ---- 16.11: an off-screen viewport draws nothing; one frame on return -------------------------------------------

{
  const clock = createClock();
  let drawn = 0;
  const frames = scheduler(clock, () => {
    drawn += 1;
  });
  const animator = createStateAnimator();
  animator.update(new Map([["blind", { closed: 0 }]]), 0, true);
  animator.update(new Map([["blind", { closed: 1 }]]), 0, true);
  const states = frames.start({ channel: "states", step: (now) => animator.poses(now).size > 0 });
  runDisplay(clock, 60, 100);
  const beforePause = drawn;
  frames.setPaused(true);
  check("pause: the requested frame is dropped", !frames.pending() && clock.pendingFrames() === 0);
  runDisplay(clock, 60, 500, () => {
    frames.invalidate(); // HA state updates and effect ticks while off screen
  });
  check(
    "pause: nothing is stepped or drawn while off screen",
    drawn === beforePause && states.status() === "active",
  );
  frames.setPaused(false);
  runDisplay(clock, 60, 50);
  check(
    "resume: frames return and the animation settles",
    drawn > beforePause && states.status() === "completed",
  );
  runDisplay(clock, 60, 200);
  const settled = drawn;
  runDisplay(clock, 60, 200);
  check("resume: idle again afterwards", drawn === settled && !frames.pending());

  frames.setPaused(true);
  frames.invalidate();
  runDisplay(clock, 60, 100);
  const hiddenDraws = drawn;
  frames.setPaused(false);
  const backFrames = runDisplay(clock, 60, 100);
  check(
    "an invalidation while paused draws exactly one frame on return",
    hiddenDraws === settled && backFrames === 1,
  );
}

// ---- 15.3: ambient effects keep ticking while frames run continuously (orbit at 60 and 120 Hz) -------------------

const effectFrames = async (modulePath, hz) => {
  const clock = createClock();
  const saved = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    now: performance.now,
  };
  globalThis.setTimeout = clock.setTimeout;
  globalThis.clearTimeout = clock.clearTimeout;
  performance.now = clock.now;
  try {
    const { createEffectsLayer } = await import(modulePath);
    let requested = 0;
    const effects = createEffectsLayer(() => {
      requested += 1;
    });
    const parent = new Group();
    const root = new Group();
    root.add(new Mesh(new BufferGeometry(), new MeshBasicMaterial()));
    parent.add(root);
    const effect = {
      id: "e1",
      kind: "swirl",
      enabled: true,
      direction: "up",
      offsetMm: { x: 0, y: 0, h: 0 },
      color: [226, 72, 52],
      sizeMm: 600,
    };
    effects.sync({ id: "f1", areas: [{ id: "a1", objects: [{ id: "o1", effects: [effect] }] }] }, () => root);
    effects.playAll();
    requested = 0;
    // Continuous frames (an orbit drag): each renders, and the glass reflection hides and shows the effects.
    runDisplay(clock, hz, 3000, () => {
      effects.beforeRender();
      effects.setShown(false);
      effects.setShown(true);
    });
    effects.dispose();
    return requested;
  } finally {
    globalThis.setTimeout = saved.setTimeout;
    globalThis.clearTimeout = saved.clearTimeout;
    performance.now = saved.now;
  }
};

const effectsModule = process.env.EFFECTS_MODULE ?? "../src/renderer/effectsLayer.ts";
for (const hz of [60, 120]) {
  const ticks = await effectFrames(effectsModule, hz);
  // 8 frames per second while running: about 24 ticks in 3 s.
  check(
    `effects keep ticking under continuous ${String(hz)} Hz frames`,
    ticks >= 20,
    `${String(ticks)} tick frames in 3 s`,
  );
}

// ---- 16.3: the floor switch's slide: lifecycle, early finish, rapid switching, pause, failure, disposal --------

{
  const slideWith = (frames, log, extra = {}) =>
    startFloorSlide({
      frames,
      apply: (eased) => {
        log.applied.push(eased);
      },
      settle: (end) => {
        log.ends.push(end);
      },
      ...extra,
    });
  const newLog = () => ({ applied: [], ends: [] });

  const clock = createClock();
  const frames = scheduler(clock);
  const log = newLog();
  const slide = slideWith(frames, log);
  const steps = runDisplay(clock, 60, floorSlideMs + 200);
  check(
    "slide: runs on its channel about 0.6 s, eased from 0 to exactly 1, then settles once",
    log.ends.join() === "completed" &&
      log.applied[0] === 0 &&
      log.applied[log.applied.length - 1] === 1 &&
      log.applied.every((value, index) => index === 0 || value >= log.applied[index - 1]) &&
      !slide.active() &&
      !frames.active(floorSlideChannel) &&
      log.applied.length >= 30 &&
      log.applied.length <= 45,
    `${String(log.applied.length)} steps, ${String(steps)} frames`,
  );

  // Rapid switching: a new switch finishes the running slide at its end state, then its own slide runs alone.
  const rapidClock = createClock();
  const rapidFrames = scheduler(rapidClock);
  const first = newLog();
  const second = newLog();
  const a = slideWith(rapidFrames, first);
  runDisplay(rapidClock, 60, 200);
  a.finish();
  const b = slideWith(rapidFrames, second);
  runDisplay(rapidClock, 60, floorSlideMs + 100);
  check(
    "slide: finishing early snaps to the end state, settles once, and is not stepped again",
    first.ends.join() === "finished" &&
      first.applied[first.applied.length - 1] === 1 &&
      first.applied.filter((value) => value === 1).length === 1 &&
      second.ends.join() === "completed" &&
      !b.active(),
  );
  a.finish();
  a.cancel();
  check("slide: finishing or cancelling a settled slide does nothing", first.ends.length === 1);

  // Off screen (16.11): a paused scheduler holds the slide; on return it ends on the first frame.
  const pauseClock = createClock();
  const pauseFrames = scheduler(pauseClock);
  const paused = newLog();
  slideWith(pauseFrames, paused);
  runDisplay(pauseClock, 60, 150);
  pauseFrames.setPaused(true);
  const before = paused.applied.length;
  runDisplay(pauseClock, 60, 3000);
  const heldStill = paused.applied.length === before && paused.ends.length === 0;
  pauseFrames.setPaused(false);
  runDisplay(pauseClock, 60, 50);
  check(
    "slide: off screen it waits; on return it completes on the next frame (timed from its first frame)",
    heldStill && paused.ends.join() === "completed" && paused.applied[paused.applied.length - 1] === 1,
  );

  // A failing step (an exception while drawing) cancels the slide, and it still settles once.
  const failClock = createClock();
  const failFrames = createFrameScheduler(
    failClock,
    () => undefined,
    () => undefined,
  );
  const failing = newLog();
  let calls = 0;
  startFloorSlide({
    frames: failFrames,
    apply: (eased) => {
      calls += 1;
      if (calls === 3) throw new Error("draw failed");
      failing.applied.push(eased);
    },
    settle: (end) => {
      failing.ends.push(end);
    },
  });
  runDisplay(failClock, 60, floorSlideMs + 100);
  check("slide: a failing step cancels it and it settles once", failing.ends.join() === "cancelled");

  // Disposal cancels it; the opening watch (15.1) waits for the floor channel like the camera.
  const disposeClock = createClock();
  const disposeFrames = scheduler(disposeClock);
  const disposed = newLog();
  let idleAt = null;
  slideWith(disposeFrames, disposed);
  disposeFrames.whenIdle(["camera", floorSlideChannel], () => {
    idleAt = disposeClock.now();
  });
  runDisplay(disposeClock, 60, 300);
  const idleDuringSlide = idleAt === null;
  disposeFrames.dispose();
  check(
    "slide: the opening watch is not idle while it slides; disposal cancels and settles it",
    idleDuringSlide && disposed.ends.join() === "cancelled" && !disposeFrames.active(),
  );
}

// ---- 16.13: the floor switch as a camera move between the floors at their real heights ---------------------------

{
  const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
  const projection = (n) => [1.2, 0, 0, 0, 0, 2.1, 0, 0, 0.1 * n, 0.05, -1.02, -1, 0, 0, -0.2 * n, 0];
  const turned = [0, Math.sin(0.4), 0, Math.cos(0.4)];
  const from = { position: [2, 1.5, 9], quaternion: turned, projection: projection(1) };
  // Up one floor: same angles and fit, 2.8 m higher (the floor-to-floor distance).
  const to = { position: [2, 4.3, 9], quaternion: turned, projection: projection(1) };
  const start = slidePose(from, to, 0);
  const middle = slidePose(from, to, 0.5);
  const end = slidePose(from, to, 1);
  check(
    "move: starts at the departing camera, ends at the destination's framing",
    start.position.every((v, i) => near(v, from.position[i])) &&
      end.position.every((v, i) => near(v, to.position[i])) &&
      end.projection.every((v, i) => near(v, to.projection[i])),
  );
  check(
    "move: with the same angles and fit it is a pure vertical translation by the floor-to-floor distance",
    near(middle.position[0], 2) &&
      near(middle.position[1], 2.9) &&
      near(middle.position[2], 9) &&
      middle.quaternion.every((v, i) => near(v, turned[i])) &&
      middle.projection.every((v, i) => near(v, from.projection[i])),
  );
  const other = slidePose(
    from,
    { ...to, quaternion: [0, Math.sin(-0.3), 0, Math.cos(-0.3)], projection: projection(3) },
    0.5,
  );
  check(
    "move: a turn and a projection change (insets, depth) are interpolated evenly, the orientation stays unit",
    near(Math.hypot(...other.quaternion), 1) &&
      near(other.quaternion[1], Math.sin(0.05)) &&
      near(other.projection[8], 0.2) &&
      near(other.projection[14], -0.4),
  );
  check(
    "move: progress outside 0..1 is clamped",
    slidePose(from, to, 2).position[1] === 4.3 && slidePose(from, to, -1).position[1] === 1.5,
  );

  // The departing view's copy (ha-viewer/three/floorGhost.ts): what it draws, its own lights, its real place.
  const planRoot = createPlanRoot();
  planRoot.position.set(-3, 0, 2);
  const sunRoot = new Group();
  sunRoot.position.copy(planRoot.position);
  const scene = new Scene();
  scene.add(planRoot, sunRoot);
  const content = new Group();
  planRoot.add(content);
  const wallGeometry = new BufferGeometry();
  const wallMaterial = new MeshBasicMaterial();
  const wall = new Mesh(wallGeometry, wallMaterial);
  wall.position.set(1000, 2000, 0);
  const hidden = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
  hidden.visible = false;
  const effect = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
  effect.layers.set(3);
  const lamp = new PointLight(0xffffff, 10);
  lamp.castShadow = true;
  const spot = new SpotLight(0xffffff, 10);
  const spotTarget = new Object3D();
  spotTarget.position.set(0, 0, -1000);
  spot.target = spotTarget;
  content.add(wall, hidden, effect, lamp, spot, spotTarget);
  const camera = new PerspectiveCamera(40, 1.5, 0.5, 60);
  camera.position.set(4, 6, 10);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  // Departing: floor 1 (placed at x 500 mm, 2800 mm up); destination: the ground floor at the house's zero.
  const ghost = captureFloorGhost({
    planRoot,
    sunRoot,
    origin: { x: 500, y: 0, h: 2800 },
    camera,
    scene,
    width: 8,
    height: 8,
    samples: 0,
    halfFloat: false,
  });
  const destination = createPlanRoot();
  destination.position.set(-1, 0, 2);
  ghost.place(destination, { x: 0, y: 0, h: 0 });
  const pose = ghost.startPose();
  // The copy's plan root sits at the departing origin relative to the destination: (0.5, 2.8, 0) m from its root.
  const expectedShift = [-1 + 0.5 - -3, 2.8, 0];
  check(
    "copy: the departing camera moves with the floor to its real place (2.8 m up, its plan offset)",
    near(pose.position.x, 4 + expectedShift[0]) &&
      near(pose.position.y, 6 + expectedShift[1]) &&
      near(pose.position.z, 10 + expectedShift[2]) &&
      pose.projection.equals(camera.projectionMatrix),
  );
  const meshes = [];
  const lights = [];
  ghost.scene.traverse((object) => {
    if (object instanceof Mesh) meshes.push(object);
    if (object instanceof PointLight || object instanceof SpotLight) lights.push(object);
  });
  const copiedSpot = lights.find((light) => light instanceof SpotLight);
  let spotTargetInCopy = false;
  ghost.scene.traverse((object) => {
    if (copiedSpot !== undefined && object === copiedSpot.target) spotTargetInCopy = true;
  });
  check(
    "copy: only shown meshes on the default layer, sharing geometry and materials; no hidden or effect mesh",
    meshes.length === 1 &&
      meshes[0] !== wall &&
      meshes[0].geometry === wallGeometry &&
      meshes[0].material === wallMaterial,
  );
  check(
    "copy: it keeps its own lights (new shadow maps drawn once), a spot aimed at its copied target",
    lights.length === 2 &&
      !lights.includes(lamp) &&
      lights.some((light) => light instanceof PointLight && light.shadow.needsUpdate) &&
      spotTargetInCopy &&
      lamp.parent === content,
  );
  const shifted = ghost.shift();
  check(
    "copy: its shift is the camera's (the ride keeps the horizontal place and changes height by the elevations)",
    near(shifted.x, 2.5) && near(shifted.y, 2.8) && near(shifted.z, 0),
  );
  // The fade follows the ride: each frame's eased progress is the blend weight of that same frame (destination in,
  // departing out), from exactly 0 to exactly 1, and only the copy's own scene is drawn into its target.
  const drawnScenes = [];
  const fakeRenderer = {
    autoClear: true,
    shadowMap: { needsUpdate: false },
    target: null,
    getRenderTarget() {
      return this.target;
    },
    setRenderTarget(target) {
      this.target = target;
    },
    clear: () => undefined,
    render(drawn) {
      drawnScenes.push([drawn, this.target !== null]);
    },
  };
  const rideClock = createClock();
  const rideFrames = scheduler(rideClock);
  const weights = [];
  const poses = [];
  startFloorSlide({
    frames: rideFrames,
    apply: (eased) => {
      const pose = slidePose(from, to, eased);
      ghost.draw(fakeRenderer, camera, eased);
      weights.push([eased, ghost.weight()]);
      poses.push(pose.position[1]);
    },
    settle: () => undefined,
  });
  runDisplay(rideClock, 60, floorSlideMs + 200);
  check(
    "fade: each frame's blend weight is that frame's eased ride progress, from exactly 0 to exactly 1",
    weights.length > 30 &&
      weights.every(([eased, weight]) => near(eased, weight)) &&
      weights[0][1] === 0 &&
      weights[weights.length - 1][1] === 1 &&
      weights.every(([, weight], index) => index === 0 || weight >= weights[index - 1][1]),
  );
  check(
    "fade: the ride's height moves with the same progress (fade and move never lead or lag each other)",
    weights.every(([eased], index) => near(poses[index], 1.5 + 2.8 * eased)),
  );
  check(
    "fade: the departing copy is drawn into its own target, the blend over the frame; shadows only on the first",
    drawnScenes[0][0] === ghost.scene &&
      drawnScenes[0][1] &&
      drawnScenes[1][0] !== ghost.scene &&
      !drawnScenes[1][1] &&
      fakeRenderer.autoClear === true,
  );
  const planCopy = ghost.scene.children[0];
  check(
    "copy: placed at the departing floor's real place relative to the destination (floorToHouseOffset difference)",
    near(planCopy.position.x, -0.5) && near(planCopy.position.y, 2.8) && near(planCopy.position.z, 2),
  );
  // The destination's layers dispose the departing wall while the copy still draws it; release disposes it again.
  let disposals = 0;
  wallGeometry.addEventListener("dispose", () => {
    disposals += 1;
  });
  wallGeometry.dispose();
  ghost.dispose();
  check("copy: what a layer disposed meanwhile is disposed again on release", disposals === 2);
  let later = 0;
  wallMaterial.addEventListener("dispose", () => {
    later += 1;
  });
  ghost.dispose();
  check("copy: release runs once and leaves shared materials to their owners", later === 0);
}

// ---- 15.1: the load queue -------------------------------------------------------------------------------------------

{
  const started = [];
  const resolvers = new Map();
  const job = (name, lane) => ({
    lane,
    kind: "template",
    run: () =>
      new Promise((resolve) => {
        started.push(name);
        resolvers.set(name, resolve);
      }),
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const queue = createLoadQueue(2);
  queue.enqueue(job("object-1", 2));
  queue.enqueue(job("door", 0));
  queue.enqueue(job("texture-1", 1));
  queue.enqueue(job("object-2", 2));
  queue.enqueue(job("window", 0));
  queue.enqueue(job("door-2", 0));
  check("lane 0 starts at once, at most 2 in flight", started.join(",") === "door,window", started.join(","));
  check("closed lanes wait", !queue.laneSettled(0) && queue.progress().queued === 4);
  resolvers.get("door")();
  await flush();
  check("a free slot takes the next job of the open lane", started.join(",") === "door,window,door-2");
  resolvers.get("window")();
  resolvers.get("door-2")();
  await flush();
  check("lane 0 settled; later lanes still closed", queue.laneSettled(0) && started.length === 3);
  queue.open(2);
  check(
    "opening lanes runs the lowest lane first",
    started.slice(3).join(",") === "texture-1,object-1",
    started.join(","),
  );
  resolvers.get("texture-1")();
  resolvers.get("object-1")();
  await flush();
  resolvers.get("object-2")();
  await flush();
  const progress = queue.progress();
  check(
    "everything settles and is counted",
    progress.total === 6 && progress.settled === 6 && progress.running === 0,
  );
  queue.reset();
  queue.enqueue(job("late", 2));
  check(
    "reset closes the later lanes but keeps waiting jobs",
    queue.progress().queued === 1 && queue.progress().total === 1,
  );
  const failing = createLoadQueue(1);
  failing.enqueue({ lane: 0, kind: "texture", run: () => Promise.reject(new Error("404")) });
  failing.enqueue({
    lane: 0,
    kind: "texture",
    run: () => {
      throw new Error("sync");
    },
  });
  await flush();
  await flush();
  check(
    "failed jobs free their slot and count as settled",
    failing.progress().settled === 2 && failing.progress().running === 0,
  );
}

// ---- static batching (18.1) ----------------------------------------------------------------------------------
{
  const floor = new Group();
  floor.position.set(1, 2, 3);
  const wood = new MeshStandardMaterial();
  const stone = new MeshStandardMaterial();
  const glass = new MeshStandardMaterial({ transparent: true, opacity: 0.3 });
  const object = new Group();
  object.name = "instance:o_chair";
  const fixture = new Group();
  fixture.name = "instance:l_lamp";
  floor.add(object, fixture);
  const legs = Array.from({ length: 4 }, (_, index) => {
    const leg = new Mesh(new BoxGeometry(1, 1, 1), wood);
    leg.position.set(index, 0, 0);
    leg.castShadow = true;
    object.add(leg);
    return leg;
  });
  const mirrored = new Mesh(new BoxGeometry(1, 1, 1), wood);
  mirrored.scale.set(-1, 1, 1);
  mirrored.castShadow = true;
  object.add(mirrored);
  const wall = new Mesh(new BoxGeometry(2, 2, 2), stone);
  floor.add(wall);
  const pane = new Mesh(new BoxGeometry(1, 1, 0.1), glass);
  floor.add(pane);
  const bulb = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), wood);
  fixture.add(bulb);
  const hidden = new Mesh(new BoxGeometry(1, 1, 1), wood);
  hidden.visible = false;
  floor.add(hidden);
  const bucketOf = (mesh) => {
    for (let current = mesh; current !== null && current !== floor; current = current.parent) {
      if (current === fixture) return null;
      if (current === object) return "objects";
    }
    return "house";
  };
  const batch = createStaticBatch();
  floor.add(batch.root);
  batch.build(floor, bucketOf);
  const objects = batch.root.children.find((child) => child.name === batchBucketName("objects"));
  const house = batch.root.children.find((child) => child.name === batchBucketName("house"));
  check(
    "batch: one merged mesh per material and shadow flags, in named buckets",
    batch.stats().sources === 6 &&
      batch.stats().batches === 2 &&
      objects?.children.length === 1 &&
      house?.children.length === 1,
    JSON.stringify(batch.stats()),
  );
  check(
    "batch: sources move to the batched layer; transparent, fixture and hidden meshes stay as they are",
    [...legs, mirrored, wall].every((mesh) => mesh.layers.mask === 1 << batchedLayer) &&
      [pane, bulb, hidden].every((mesh) => mesh.layers.mask === 1),
  );
  const merged = objects?.children[0];
  merged?.geometry.computeBoundingBox();
  const box = merged?.geometry.boundingBox;
  check(
    "batch: geometry is in the floor's frame (the floor's own transform is not baked in)",
    box !== undefined && box !== null && Math.abs(box.min.x + 0.5) < 1e-6 && Math.abs(box.max.x - 3.5) < 1e-6,
    box === undefined || box === null ? "" : `${String(box.min.x)}..${String(box.max.x)}`,
  );
  // The mirrored box's first triangle faces the same way as an unmirrored one after the mirror.
  const triangleNormal = (geometry, offset) => {
    const index = geometry.index;
    const position = geometry.getAttribute("position");
    const corner = (at) => new Vector3().fromBufferAttribute(position, index === null ? at : index.getX(at));
    const [a, b, c] = [corner(offset), corner(offset + 1), corner(offset + 2)];
    return b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  };
  const legIndexCount = legs[0].geometry.index?.count ?? 0;
  const mirroredStart = legIndexCount * 4;
  const faceNormal = triangleNormal(merged.geometry, mirroredStart);
  const stored = new Vector3().fromBufferAttribute(
    merged.geometry.getAttribute("normal"),
    merged.geometry.index.getX(mirroredStart),
  );
  check(
    "batch: a mirrored source keeps its faces front-facing",
    faceNormal.dot(stored) > 0.99,
    faceNormal.dot(stored).toFixed(3),
  );
  check("batch: valid while nothing changed", batch.valid(floor, bucketOf));
  wall.material = new MeshStandardMaterial();
  check("batch: a source with another material makes it stale", !batch.valid(floor, bucketOf));
  wall.material = stone;
  const added = new Mesh(new BoxGeometry(1, 1, 1), wood);
  object.add(added);
  check("batch: a new mesh to draw makes it stale", !batch.valid(floor, bucketOf));
  added.removeFromParent();
  legs[0].visible = false;
  check("batch: a hidden source makes it stale", !batch.valid(floor, bucketOf));
  legs[0].visible = true;
  check("batch: valid again once things are back", batch.valid(floor, bucketOf));
  floor.position.set(5, 5, 5);
  check("batch: moving the floor's root keeps it (it moves with the floor)", batch.valid(floor, bucketOf));
  batch.clear();
  check(
    "batch: clearing gives every source its layer back and removes the merged meshes",
    [...legs, mirrored, wall].every((mesh) => mesh.layers.mask === 1) && batch.root.children.length === 0,
  );
  batch.dispose();
  check("batch: disposal detaches it", batch.root.parent === null);
}

console.log(failures === 0 ? "\nAll frame checks passed." : `\n${String(failures)} frame check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
