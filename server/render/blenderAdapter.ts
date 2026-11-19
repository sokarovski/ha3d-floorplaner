// Blender/Cycles renderer adapter (spec/delivery/rendering-and-exports.md#main-view-photorealistic-render).
// Blender runs as a separate background process per job: `render_scene.py` imports the scene GLB, sets
// the camera, sun, and sky from the frozen snapshot, and writes a PNG. Configuration:
// BLENDER_PATH (default: the macOS app bundle path, then `blender` on PATH), BLENDER_DEVICE (CPU|GPU,
// default CPU), BLENDER_SAMPLES (default 64).
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type RendererInfo = Readonly<{ name: string; version: string }>;

export type RendererAvailability =
  | Readonly<{ available: true; renderer: RendererInfo; executable: string }>
  | Readonly<{ available: false; reason: string }>;

export type RenderProgress = Readonly<{ progress: number; stage: string }>;

export type RenderRequest = Readonly<{
  /** JSON file read by the script: { scene, output, snapshot, samples, device }. */
  configPath: string;
  onProgress: (progress: RenderProgress) => void;
  /** Called with the renderer's process ID right after it starts (recorded for restart recovery). */
  onSpawn: (pid: number) => void;
  signal: AbortSignal;
}>;

/** Every photorealistic renderer implements this; Blender/Cycles is the only one in MVP. */
export type RendererAdapter = Readonly<{
  info: RendererInfo;
  device: "CPU" | "GPU";
  defaultSamples: number;
  render: (request: RenderRequest) => Promise<void>;
}>;

export const renderScriptPath = resolve(fileURLToPath(new URL(".", import.meta.url)), "render_scene.py");

const macBlender = "/Applications/Blender.app/Contents/MacOS/Blender";

const isExecutable = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const candidates = (env: NodeJS.ProcessEnv): string[] => {
  if (env.BLENDER_PATH !== undefined && env.BLENDER_PATH !== "") return [env.BLENDER_PATH];
  const onPath = (env.PATH ?? "")
    .split(delimiter)
    .filter((dir) => dir !== "")
    .map((dir) => join(dir, "blender"));
  return [macBlender, ...onPath];
};

/** Runs a process to completion, collecting stdout lines; rejects on a non-zero exit or abort. */
/**
 * A renderer process that exited unsuccessfully. `message` is safe to show to clients (no paths, no output);
 * `detail` holds the last output lines for the server log only.
 */
export class RendererExitError extends Error {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
    this.name = "RendererExitError";
  }
}

const run = (
  executable: string,
  args: readonly string[],
  options: Readonly<{
    signal?: AbortSignal;
    timeoutMs?: number;
    onLine?: (line: string) => void;
    onSpawn?: (pid: number) => void;
  }>,
): Promise<string> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(executable, [...args], { stdio: ["ignore", "pipe", "pipe"] });
    if (child.pid !== undefined) options.onSpawn?.(child.pid);
    let output = "";
    let tail = "";
    let pending = "";
    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => child.kill("SIGKILL"), options.timeoutMs);
    const onAbort = (): void => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output = (output + chunk).slice(-20000);
      pending += chunk;
      const lines = pending.split(/\r?\n|\r/);
      pending = lines.pop() ?? "";
      for (const line of lines) options.onLine?.(line);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      tail = (tail + chunk).slice(-4000);
    });
    child.on("error", (error) => {
      if (timer !== undefined) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (options.signal?.aborted === true) reject(new Error("Canceled"));
      else if (code === 0) resolvePromise(output);
      else {
        const lastLines = `${output}\n${tail}`.trim().split("\n").slice(-6).join("\n");
        reject(
          new RendererExitError(
            `Blender exited with ${code === null ? `signal ${signal ?? "?"}` : `code ${code}`}.`,
            lastLines,
          ),
        );
      }
    });
  });

/** Finds Blender and reads its version (`blender --version` → "Blender 4.0.2"). */
export const detectBlender = async (env: NodeJS.ProcessEnv = process.env): Promise<RendererAvailability> => {
  for (const executable of candidates(env)) {
    if (!(await isExecutable(executable))) continue;
    try {
      const output = await run(executable, ["--version"], { timeoutMs: 30000 });
      const version = /Blender\s+(\d+\.\d+(?:\.\d+)?)/.exec(output)?.[1];
      if (version === undefined) continue;
      return { available: true, renderer: { name: "blender-cycles", version }, executable };
    } catch {
      continue;
    }
  }
  return {
    available: false,
    reason:
      env.BLENDER_PATH === undefined
        ? "No render backend configured (Blender not found; set BLENDER_PATH)"
        : `Blender not found at BLENDER_PATH (${env.BLENDER_PATH})`,
  };
};

const parseSamples = (value: string | undefined): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 4096 ? parsed : 64;
};

/** Kills a renderer left running by a previous server process, if that PID still runs our script. */
export const killStaleRenderer = async (pid: number): Promise<boolean> => {
  try {
    const command = await run("/bin/ps", ["-p", String(pid), "-o", "command="], { timeoutMs: 5000 });
    if (!command.includes("render_scene.py")) return false;
    process.kill(pid, "SIGKILL");
    return true;
  } catch {
    return false;
  }
};

const sampleLine = /Sample (\d+)\/(\d+)/;
const stageLine = /^HOMEPLAN stage (\w+)/;

export const createBlenderAdapter = (
  executable: string,
  info: RendererInfo,
  env: NodeJS.ProcessEnv = process.env,
): RendererAdapter => ({
  info,
  device: env.BLENDER_DEVICE === "GPU" ? "GPU" : "CPU",
  defaultSamples: parseSamples(env.BLENDER_SAMPLES),
  render: async ({ configPath, onProgress, onSpawn, signal }) => {
    const stageProgress: Readonly<Record<string, RenderProgress>> = {
      import: { progress: 0.02, stage: "Importing scene" },
      setup: { progress: 0.05, stage: "Preparing Cycles" },
      render: { progress: 0.08, stage: "Rendering" },
      done: { progress: 1, stage: "Writing image" },
    };
    await run(
      executable,
      [
        "-b",
        "--factory-startup",
        "-noaudio",
        "--python-exit-code",
        "1",
        "--python",
        renderScriptPath,
        "--",
        configPath,
      ],
      {
        signal,
        onSpawn,
        onLine: (line) => {
          const stage = stageLine.exec(line)?.[1];
          const known = stage === undefined ? undefined : stageProgress[stage];
          if (known !== undefined) onProgress(known);
          const samples = sampleLine.exec(line);
          if (samples !== null) {
            const done = Number(samples[1]);
            const total = Number(samples[2]);
            if (total > 0)
              onProgress({
                progress: 0.08 + 0.9 * Math.min(1, done / total),
                stage: `Rendering sample ${done}/${total}`,
              });
          }
        },
      },
    );
  },
});
