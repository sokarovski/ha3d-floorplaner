// Opt-in load timing of the HA viewer's staged opening (Phase 15.1): per-stage timings of template fetch and parse,
// texture fetch/decode and GPU upload, shader compilation, the first shadow pass, and the frames of each stage, logged
// to the console. Off unless the viewer is in dev mode (the harness) or `localStorage["homeplan.loadTiming"]` is "1"
// (or the page URL has `homeplanTiming`). It adds no timer, loop, or UI: it only reads performance.now() at points
// the viewer passes anyway. Framework-free. Light switches are timed too (Phase 16.6, src/renderer/switchTiming.ts).
import { createSwitchTiming, switchTimingRequested } from "../../src/renderer/switchTiming";
import type { TemplateTiming } from "../../src/renderer/templateCache";
import type { TextureTiming } from "../../src/renderer/textureCache";

export type LoadStage = "preparing" | "opening" | "loading" | "done";

/** Whether timing was asked for outside dev mode (a localStorage flag or a URL parameter); never throws. */
export const loadTimingRequested = (): boolean => switchTimingRequested();

type FrameStats = {
  frames: number;
  renderMs: number;
  worstRenderMs: number;
  longGaps: number;
  worstGapMs: number;
};

export type LoadTiming = Readonly<{
  /** A stage begins (logged with the time since the house was shown). */
  stage: (stage: LoadStage) => void;
  template: (timing: TemplateTiming) => void;
  texture: (timing: TextureTiming) => void;
  upload: (ms: number) => void;
  compile: (label: string, ms: number) => void;
  /** Any other timed step (Phase 18.1: a floor merged), logged as it is. */
  note: (label: string, ms: number) => void;
  /** One batch of objects added: its instance sync. */
  admit: (templates: number, ms: number) => void;
  /** A rendered frame: its render time, whether it redrew the shadow maps, and the gap since the previous frame. */
  frame: (renderMs: number, shadows: boolean, gapMs: number | null) => void;
  /**
   * New light states from Home Assistant (Phase 16.6), with the renderer's program count now; returns the call to
   * make after the next rendered frame (logs the time to it and whether it compiled programs).
   */
  lightStates: (programs: number) => (programs: number) => void;
}>;

const round = (ms: number): string => ms.toFixed(1);

export const createLoadTiming = (): LoadTiming => {
  let started = performance.now();
  let current: LoadStage = "preparing";
  let stats: FrameStats = { frames: 0, renderMs: 0, worstRenderMs: 0, longGaps: 0, worstGapMs: 0 };
  let firstShadow = true;
  const totals = {
    templates: 0,
    fetchParseMs: 0,
    worstFetchParseMs: 0,
    flattenMs: 0,
    worstFlattenMs: 0,
    textures: 0,
    decodeMs: 0,
    uploads: 0,
    uploadMs: 0,
    worstUploadMs: 0,
    admits: 0,
    admitMs: 0,
    worstAdmitMs: 0,
    shadowPasses: 0,
    shadowMs: 0,
    worstShadowMs: 0,
  };
  const log = (message: string): void => {
    console.info(`[homeplan load +${round(performance.now() - started)} ms] ${message}`);
  };
  const switches = createSwitchTiming(log);
  const flushFrames = (): void => {
    if (stats.frames === 0) return;
    log(
      `${current}: ${String(stats.frames)} frames, render avg ${round(stats.renderMs / stats.frames)} ms, worst ${round(
        stats.worstRenderMs,
      )} ms; ${String(stats.longGaps)} gaps > 34 ms (worst ${round(stats.worstGapMs)} ms)`,
    );
    stats = { frames: 0, renderMs: 0, worstRenderMs: 0, longGaps: 0, worstGapMs: 0 };
  };
  return {
    stage: (stage) => {
      flushFrames();
      if (stage === "preparing") {
        started = performance.now();
        firstShadow = true;
      }
      current = stage;
      log(`stage ${stage}`);
      if (stage !== "done") return;
      log(
        `templates ${String(totals.templates)}: fetch+parse ${round(totals.fetchParseMs)} ms (worst ${round(
          totals.worstFetchParseMs,
        )}), flatten ${round(totals.flattenMs)} ms (worst ${round(totals.worstFlattenMs)}); ` +
          `textures ${String(totals.textures)}: fetch+decode ${round(totals.decodeMs)} ms wall, uploads ${String(
            totals.uploads,
          )} ${round(totals.uploadMs)} ms (worst ${round(totals.worstUploadMs)}); ` +
          `object batches ${String(totals.admits)} ${round(totals.admitMs)} ms (worst ${round(totals.worstAdmitMs)}); ` +
          `shadow frames ${String(totals.shadowPasses)} ${round(totals.shadowMs)} ms (worst ${round(totals.worstShadowMs)})`,
      );
    },
    template: (timing) => {
      totals.templates += 1;
      totals.fetchParseMs += timing.fetchParseMs;
      totals.flattenMs += timing.flattenMs;
      totals.worstFetchParseMs = Math.max(totals.worstFetchParseMs, timing.fetchParseMs);
      totals.worstFlattenMs = Math.max(totals.worstFlattenMs, timing.flattenMs);
      log(
        `template ${timing.key}: fetch+parse ${round(timing.fetchParseMs)} ms, flatten ${round(timing.flattenMs)} ms`,
      );
    },
    texture: (timing) => {
      if (timing.step === "fetch+decode") {
        totals.textures += 1;
        totals.decodeMs += timing.ms;
      }
      log(`texture ${timing.imageId}: ${timing.step} ${round(timing.ms)} ms`);
    },
    upload: (ms) => {
      totals.uploads += 1;
      totals.uploadMs += ms;
      totals.worstUploadMs = Math.max(totals.worstUploadMs, ms);
    },
    compile: (label, ms) => {
      log(`compile ${label}: ${round(ms)} ms`);
    },
    note: (label, ms) => {
      log(`${label}: ${round(ms)} ms`);
    },
    admit: (templates, ms) => {
      totals.admits += 1;
      totals.admitMs += ms;
      totals.worstAdmitMs = Math.max(totals.worstAdmitMs, ms);
      log(`objects of ${String(templates)} templates added: sync ${round(ms)} ms`);
    },
    frame: (renderMs, shadows, gapMs) => {
      stats.frames += 1;
      stats.renderMs += renderMs;
      stats.worstRenderMs = Math.max(stats.worstRenderMs, renderMs);
      if (gapMs !== null && gapMs > 34) {
        stats.longGaps += 1;
        stats.worstGapMs = Math.max(stats.worstGapMs, gapMs);
      }
      if (!shadows) return;
      totals.shadowPasses += 1;
      totals.shadowMs += renderMs;
      totals.worstShadowMs = Math.max(totals.worstShadowMs, renderMs);
      if (firstShadow) {
        firstShadow = false;
        log(`first frame with a shadow pass: ${round(renderMs)} ms`);
      }
    },
    lightStates: (programs) => switches.begin("light states", programs),
  };
};
