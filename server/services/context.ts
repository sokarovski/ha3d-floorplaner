// Dependencies shared by the services. Built once in app.ts.
import type { FastifyBaseLogger } from "fastify";
import { BuiltinImageRepository } from "../repositories/builtinImages";
import { BuiltinTemplateRepository } from "../repositories/builtinTemplates";
import { ExportRepository } from "../repositories/exportRepository";
import { HouseRepository } from "../repositories/houseRepository";
import { ImageRepository } from "../repositories/imageRepository";
import { KeyedQueue } from "../repositories/locks";
import type { StoragePaths } from "../repositories/paths";
import { PreferencesRepository } from "../repositories/preferencesRepository";

/**
 * Tasks run under a house's lock right before its folder leaves data/ (trash). Each must finish without taking
 * the same house lock (it is already held). Used by render jobs to stop work for the house.
 */
export class HouseRemovalHooks {
  private readonly hooks: ((houseId: string) => Promise<void>)[] = [];

  add(hook: (houseId: string) => Promise<void>): void {
    this.hooks.push(hook);
  }

  async run(houseId: string): Promise<void> {
    for (const hook of this.hooks) await hook(houseId);
  }
}

export type ServiceContext = Readonly<{
  paths: StoragePaths;
  queue: KeyedQueue;
  houses: HouseRepository;
  images: ImageRepository;
  preferences: PreferencesRepository;
  exports: ExportRepository;
  builtinTemplates: BuiltinTemplateRepository;
  builtinImages: BuiltinImageRepository;
  houseRemoval: HouseRemovalHooks;
  /** The application base path, for example "/" or "/homeplan/". */
  basePath: string;
  log: FastifyBaseLogger;
}>;

export const createServiceContext = (
  paths: StoragePaths,
  basePath: string,
  log: FastifyBaseLogger,
  builtinTemplatesDir?: string,
  builtinMaterialsDir?: string,
): ServiceContext => ({
  paths,
  queue: new KeyedQueue(),
  houses: new HouseRepository(paths),
  images: new ImageRepository(paths),
  preferences: new PreferencesRepository(paths),
  exports: new ExportRepository(paths),
  builtinTemplates: new BuiltinTemplateRepository(builtinTemplatesDir),
  builtinImages: new BuiltinImageRepository(builtinMaterialsDir),
  houseRemoval: new HouseRemovalHooks(),
  basePath,
  log,
});

/** All writes to one house (document, images, exports, Git, folder moves) run through this key. */
export const houseLock = (houseId: string): string => `house:${houseId}`;
export const preferencesLock = "preferences";
