// Photorealistic render jobs: persisted JSON state, one job at a time, cancel, restart recovery
// (spec/architecture/api.md#exports-and-renders). Job folders live in exports/renders/<jobId>/ (git-ignored).
import { readFile, rm, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { RenderJobDocument, RenderSnapshot } from "../../shared/contracts/renders";
import type {
  RenderJobDocumentValue,
  RenderJobResponseValue,
  RenderSnapshotValue,
} from "../../shared/contracts/renders";
import type { ExportEntryValue } from "../../shared/contracts/exports";
import { createId, isId } from "../../shared/domain/ids";
import { compileValidator, toIssues } from "../../shared/domain/validation/ajv";
import { ApiError, validationError } from "../http/errors";
import { parseJson, toJsonText } from "../lib/json";
import { atomicWriteFile } from "../repositories/atomic";
import { listChildDirectories, readTextIfExists } from "../repositories/files";
import type { ServiceContext } from "../services/context";
import { houseLock } from "../services/context";
import { requireHouse } from "../services/houseService";
import { RendererExitError, killStaleRenderer } from "./blenderAdapter";
import type { RendererAdapter, RendererAvailability, RenderProgress } from "./blenderAdapter";

const validateSnapshot = compileValidator(RenderSnapshot);
const validateJobDocument = compileValidator(RenderJobDocument);

/** Implementation conventions. */
export const renderSceneMaxBytes = 256 * 1024 * 1024;
const previewMaxSidePx = 512;
const progressWriteIntervalMs = 1000;

type QueueEntry = Readonly<{ houseId: string; jobId: string }>;

const isTerminal = (status: RenderJobResponseValue["status"]): boolean =>
  status === "completed" || status === "failed" || status === "canceled";

export class RenderJobService {
  private readonly queue: QueueEntry[] = [];
  private readonly active = new Map<string, RenderJobDocumentValue>();
  private running: { entry: QueueEntry; controller: AbortController; rendered: Promise<void> } | undefined;
  /** Jobs of trashed houses: their final state was written before the move; later bookkeeping is skipped. */
  private readonly abandoned = new Map<string, RenderJobResponseValue>();

  constructor(
    private readonly context: ServiceContext,
    readonly availability: RendererAvailability,
    private readonly adapter: RendererAdapter | undefined,
  ) {
    context.houseRemoval.add((houseId) => this.abandonHouse(houseId));
  }

  private jobFile(houseId: string, jobId: string): string {
    return this.context.paths.inside(this.context.paths.renderJobDir(houseId, jobId), "job.json");
  }

  /** Writes job.json; the caller holds the house lock and the house exists. Never recreates the house folder. */
  private async write(houseId: string, document: RenderJobDocumentValue): Promise<void> {
    await atomicWriteFile(this.jobFile(houseId, document.job.id), toJsonText(document), {
      parentsBelow: this.context.paths.houseDir(houseId),
    });
  }

  /** Saves job.json under the house lock; skipped when the job was abandoned or the house left data/. */
  private async save(houseId: string, document: RenderJobDocumentValue): Promise<void> {
    await this.context.queue.run(houseLock(houseId), async () => {
      if (this.abandoned.has(document.job.id) || !(await this.context.houses.exists(houseId))) return;
      await this.write(houseId, document);
    });
  }

  /**
   * House-removal hook (runs under the house lock, before the folder moves to the trash): drops the house's
   * queued jobs, stops its running renderer and waits for the process to exit, then records every unfinished
   * job as canceled so a restored house shows no phantom running job.
   */
  private async abandonHouse(houseId: string): Promise<void> {
    for (let index = this.queue.length - 1; index >= 0; index -= 1)
      if (this.queue[index]?.houseId === houseId) this.queue.splice(index, 1);
    const running = this.running;
    if (running?.entry.houseId === houseId) {
      running.controller.abort();
      await running.rendered;
    }
    for (const document of [...this.active.values()].filter((item) => item.job.houseId === houseId)) {
      const job: RenderJobResponseValue = {
        ...document.job,
        status: "canceled",
        stage: "Canceled",
        error: null,
        finishedAt: new Date().toISOString(),
        resultExportId: null,
      };
      this.abandoned.set(job.id, job);
      this.active.delete(job.id);
      await this.write(houseId, { ...document, job });
      await this.removeWorkFiles(houseId, job.id);
    }
  }

  private async removeWorkFiles(houseId: string, jobId: string): Promise<void> {
    const directory = this.context.paths.renderJobDir(houseId, jobId);
    for (const name of ["scene.glb", "output.png", "config.json", "renderer.pid"])
      await rm(this.context.paths.inside(directory, name), { force: true });
  }

  private async load(houseId: string, jobId: string): Promise<RenderJobDocumentValue | undefined> {
    const text = await readTextIfExists(await this.context.paths.contained(this.jobFile(houseId, jobId)));
    if (text === undefined) return undefined;
    const parsed = parseJson(text);
    const value = parsed.ok ? parsed.value : undefined;
    return validateJobDocument(value) ? value : undefined;
  }

  async submit(
    houseId: string,
    scene: Buffer | undefined,
    snapshotText: string | undefined,
  ): Promise<string> {
    await requireHouse(this.context, houseId);
    if (this.adapter === undefined) {
      throw new ApiError(
        "unavailable",
        this.availability.available ? "The renderer is not ready." : this.availability.reason,
      );
    }
    if (scene === undefined) throw validationError([{ pointer: "/body/scene", message: "is required" }]);
    if (scene.byteLength < 12 || scene.subarray(0, 4).toString("latin1") !== "glTF") {
      throw new ApiError("unsupportedMedia", "The scene part is not a GLB file.");
    }
    if (snapshotText === undefined)
      throw validationError([{ pointer: "/body/snapshot", message: "is required" }]);
    const parsed = parseJson(snapshotText);
    if (!parsed.ok) throw validationError([{ pointer: "/body/snapshot", message: "must be JSON" }]);
    const snapshot: unknown = parsed.value;
    if (!validateSnapshot(snapshot)) {
      throw validationError(
        toIssues(validateSnapshot.errors).map((issue) => ({
          pointer: `/body/snapshot${issue.pointer}`,
          message: issue.message,
        })),
      );
    }
    const jobId = createId("job");
    const document: RenderJobDocumentValue = {
      schemaVersion: 1,
      job: {
        id: jobId,
        houseId,
        floorId: snapshot.floorId,
        status: "pending",
        progress: 0,
        stage: "Waiting",
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        error: null,
        resultExportId: null,
      },
      snapshot,
    };
    const directory = await this.context.paths.contained(this.context.paths.renderJobDir(houseId, jobId));
    // Under the house lock so a concurrent trash either sees this job (and cancels it) or wins and 404s here.
    await this.context.queue.run(houseLock(houseId), async () => {
      await requireHouse(this.context, houseId);
      await atomicWriteFile(this.context.paths.inside(directory, "scene.glb"), scene, {
        parentsBelow: this.context.paths.houseDir(houseId),
      });
      await this.write(houseId, document);
      this.active.set(jobId, document);
      this.queue.push({ houseId, jobId });
    });
    void this.pump();
    return jobId;
  }

  async get(houseId: string, jobId: string): Promise<RenderJobResponseValue> {
    await requireHouse(this.context, houseId);
    const live = this.active.get(jobId);
    if (live?.job.houseId === houseId) return live.job;
    const stored = await this.load(houseId, jobId);
    if (stored === undefined) throw new ApiError("notFound", `Render job ${jobId} does not exist.`);
    return stored.job;
  }

  /** Cancels a pending or running job; a finished job is returned unchanged. */
  async cancel(houseId: string, jobId: string): Promise<RenderJobResponseValue> {
    const current = await this.get(houseId, jobId);
    if (isTerminal(current.status)) return current;
    const index = this.queue.findIndex((entry) => entry.jobId === jobId);
    if (index >= 0) {
      this.queue.splice(index, 1);
      return this.finish(houseId, jobId, { status: "canceled", stage: "Canceled", error: null });
    }
    if (this.running?.entry.jobId === jobId) {
      this.running.controller.abort();
      return { ...current, status: "canceled", stage: "Canceling" };
    }
    return current;
  }

  private async finish(
    houseId: string,
    jobId: string,
    patch: Readonly<{
      status: "completed" | "failed" | "canceled";
      stage: string;
      error: string | null;
      resultExportId?: string;
    }>,
  ): Promise<RenderJobResponseValue> {
    const abandoned = this.abandoned.get(jobId);
    if (abandoned !== undefined) return abandoned;
    const document = this.active.get(jobId) ?? (await this.load(houseId, jobId));
    if (document === undefined) throw new ApiError("notFound", `Render job ${jobId} does not exist.`);
    const next: RenderJobDocumentValue = {
      ...document,
      job: {
        ...document.job,
        status: patch.status,
        stage: patch.stage,
        error: patch.error,
        progress: patch.status === "completed" ? 1 : document.job.progress,
        finishedAt: new Date().toISOString(),
        resultExportId: patch.resultExportId ?? null,
      },
    };
    await this.save(houseId, next);
    this.active.delete(jobId);
    await this.removeWorkFiles(houseId, jobId);
    return next.job;
  }

  private async pump(): Promise<void> {
    if (this.running !== undefined || this.adapter === undefined) return;
    const entry = this.queue.shift();
    if (entry === undefined) return;
    const controller = new AbortController();
    this.running = { entry, controller, rendered: Promise.resolve() };
    try {
      await this.execute(entry, this.adapter, controller.signal);
    } catch (error: unknown) {
      this.context.log.error({ err: error, jobId: entry.jobId }, "Render job bookkeeping failed");
    } finally {
      this.running = undefined;
      void this.pump();
    }
  }

  private async execute(entry: QueueEntry, adapter: RendererAdapter, signal: AbortSignal): Promise<void> {
    const { houseId, jobId } = entry;
    const document = this.active.get(jobId);
    if (document === undefined) return;
    let current: RenderJobDocumentValue = {
      ...document,
      job: {
        ...document.job,
        status: "running",
        stage: "Starting Blender",
        startedAt: new Date().toISOString(),
      },
    };
    this.active.set(jobId, current);
    await this.save(houseId, current);
    // The house may have been trashed while this save waited for its lock; the job was already closed then.
    if (this.abandoned.has(jobId)) return;

    const directory = this.context.paths.renderJobDir(houseId, jobId);
    const output = this.context.paths.inside(directory, "output.png");
    const configPath = this.context.paths.inside(directory, "config.json");
    const samples = document.snapshot.samples ?? adapter.defaultSamples;
    await writeFile(
      configPath,
      JSON.stringify({
        scene: this.context.paths.inside(directory, "scene.glb"),
        output,
        snapshot: document.snapshot,
        samples,
        device: adapter.device,
      }),
    );
    let lastWrite = 0;
    const onProgress = (progress: RenderProgress): void => {
      if (this.abandoned.has(jobId)) return;
      current = {
        ...current,
        job: {
          ...current.job,
          progress: Math.max(current.job.progress, progress.progress),
          stage: progress.stage,
        },
      };
      this.active.set(jobId, current);
      const now = Date.now();
      if (now - lastWrite >= progressWriteIntervalMs) {
        lastWrite = now;
        this.save(houseId, current).catch((error: unknown) => {
          this.context.log.warn({ err: error, jobId }, "Could not save render progress");
        });
      }
    };
    try {
      const pidFile = this.context.paths.inside(directory, "renderer.pid");
      const rendering = adapter.render({
        configPath,
        onProgress,
        signal,
        onSpawn: (pid) => {
          writeFile(pidFile, String(pid)).catch((error: unknown) => {
            this.context.log.warn({ err: error, jobId }, "Could not record the renderer PID");
          });
        },
      });
      if (this.running !== undefined)
        this.running.rendered = rendering.then(
          () => undefined,
          () => undefined,
        );
      await rendering;
      const exportId = await this.saveExport(
        houseId,
        document.snapshot,
        samples,
        adapter,
        await readFile(output),
      );
      await this.finish(houseId, jobId, {
        status: "completed",
        stage: "Completed",
        error: null,
        resultExportId: exportId,
      });
    } catch (error: unknown) {
      if (signal.aborted)
        await this.finish(houseId, jobId, { status: "canceled", stage: "Canceled", error: null });
      else {
        // Clients get a fixed message; paths, Blender output, and tracebacks go to the server log only.
        this.context.log.error(
          { err: error, detail: error instanceof RendererExitError ? error.detail : undefined, jobId },
          "Render job failed",
        );
        await this.finish(houseId, jobId, {
          status: "failed",
          stage: "Failed",
          error:
            error instanceof RendererExitError
              ? `${error.message} See the server log for details.`
              : "The render failed. See the server log for details.",
        });
      }
    }
  }

  /** Stores the render as an ordinary export: final.png, a downscaled preview.png, and metadata.json. */
  private async saveExport(
    houseId: string,
    snapshot: RenderSnapshotValue,
    samples: number,
    adapter: RendererAdapter,
    final: Buffer,
  ): Promise<string> {
    const finalMeta = await sharp(final).metadata();
    const preview = await sharp(final)
      .resize(previewMaxSidePx, previewMaxSidePx, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    const previewMeta = await sharp(preview).metadata();
    const entry: ExportEntryValue = {
      schemaVersion: 1,
      id: createId("x"),
      houseId,
      createdAt: new Date().toISOString(),
      files: [
        {
          name: "preview.png",
          widthPx: previewMeta.width,
          heightPx: previewMeta.height,
          byteSize: preview.byteLength,
        },
        {
          name: "final.png",
          widthPx: finalMeta.width,
          heightPx: finalMeta.height,
          byteSize: final.byteLength,
        },
      ],
      metadata: {
        houseRevision: snapshot.houseRevision,
        floorId: snapshot.floorId,
        camera: { ...snapshot.camera },
        renderSettings: {
          widthPx: snapshot.widthPx,
          heightPx: snapshot.heightPx,
          samples,
          device: adapter.device,
          engine: "cycles",
          environment: { ...snapshot.environment },
        },
        renderer: { ...adapter.info },
        simulationInstant: snapshot.environment.timeInstant,
        ...(snapshot.assetVersions === undefined ? {} : { assetVersions: snapshot.assetVersions }),
      },
    };
    const images = new Map<string, Uint8Array>([
      ["preview.png", preview],
      ["final.png", final],
    ]);
    await this.context.queue.run(houseLock(houseId), async () => {
      await requireHouse(this.context, houseId);
      await this.context.exports.write(houseId, entry, images);
    });
    return entry.id;
  }

  /** Startup: jobs left pending or running by a previous process are failed. */
  async recoverInterrupted(): Promise<void> {
    for (const houseId of (await listChildDirectories(this.context.paths.dataDir)).filter(isId)) {
      for (const jobId of (await listChildDirectories(this.context.paths.rendersDir(houseId))).filter(isId)) {
        const document = await this.load(houseId, jobId);
        if (document === undefined || isTerminal(document.job.status)) continue;
        const pidText = await readTextIfExists(
          this.context.paths.inside(this.context.paths.renderJobDir(houseId, jobId), "renderer.pid"),
        );
        const pid = Number(pidText);
        if (Number.isInteger(pid) && pid > 0 && (await killStaleRenderer(pid)))
          this.context.log.warn({ jobId, pid }, "Killed a renderer left by a previous process");
        await this.finish(houseId, jobId, {
          status: "failed",
          stage: "Failed",
          error: "Interrupted by a server restart",
        });
        this.context.log.warn({ houseId, jobId }, "Marked an interrupted render job as failed");
      }
    }
  }
}
