// The small typed service set built once at startup and injected into pages (no global locator).
import { createHouseClient } from "../api/houseClient";
import type { HouseClient } from "../api/houseClient";
import { createHttpClient } from "../api/httpClient";
import type { HttpClient } from "../api/httpClient";
import { createImageClient } from "../api/imageClient";
import type { ImageClient } from "../api/imageClient";
import { createPreferencesClient } from "../api/preferencesClient";
import { createPreferencesService } from "../features/preferences/services/preferencesService";
import type { PreferencesService } from "../features/preferences/services/preferencesService";
import { createExportClient } from "../api/exportClient";
import type { ExportClient } from "../api/exportClient";
import { createRenderClient } from "../api/renderClient";
import type { RenderClient } from "../api/renderClient";
import { createTemplateClient } from "../api/templateClient";
import type { TemplateClient } from "../api/templateClient";
import type { RuntimeConfig } from "./runtimeConfig";
import { createThemeController } from "./theme/themeController";

export type AppServices = Readonly<{
  http: HttpClient;
  houses: HouseClient;
  images: ImageClient;
  preferences: PreferencesService;
  templates: TemplateClient;
  exports: ExportClient;
  renders: RenderClient;
}>;

export const createAppServices = (config: RuntimeConfig): AppServices => {
  const http = createHttpClient(config.apiBaseUrl);
  const theme = createThemeController(
    document.documentElement,
    window.matchMedia("(prefers-color-scheme: dark)"),
  );
  const preferences = createPreferencesService(createPreferencesClient(http), theme, window.localStorage);
  return {
    http,
    houses: createHouseClient(http),
    images: createImageClient(http),
    preferences,
    templates: createTemplateClient(http),
    exports: createExportClient(http),
    renders: createRenderClient(http),
  };
};
