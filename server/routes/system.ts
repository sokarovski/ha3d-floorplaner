// System routes: health and capabilities (spec/architecture/api.md#system).
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { CapabilitiesResponse, HealthResponse } from "../../shared/contracts/system";
import { imageMediaTypes } from "../../shared/contracts/images";
import type { RenderJobService } from "../render/renderJobs";
import { modelMaxBytes } from "../services/houseTemplateService";
import { imageMaxBytes, imageMaxLongestSidePx } from "../services/imageService";
import { haViewerDistDir, producerVersion } from "../runtimePaths";

export const systemRoutes: FastifyPluginAsyncTypebox<{ renders: RenderJobService }> = async (
  app,
  { renders },
) => {
  app.get("/health", { schema: { response: { 200: HealthResponse } } }, async () => ({
    status: "ok" as const,
  }));

  app.get("/capabilities", { schema: { response: { 200: CapabilitiesResponse } } }, async () => {
    const availability = renders.availability;
    return {
      houseSnapshots: {
        formatVersions: [1],
        viewerProtocols: [1],
        producerVersion,
        limits: {
          manifestBytes: 262144,
          houseBytes: 67108864,
          assetBytes: 134217728,
          configBytes: 16777216,
          totalBytes: 1073741824,
          files: 10000,
        },
      },
      viewerFrontend: {
        available: existsSync(resolve(haViewerDistDir, "manifest.json")),
        formatVersions: [1],
        loaderProtocols: [1],
        apiProtocols: [1],
        limits: { totalBytes: 268435456, files: 5000 },
      },
      uploadLimits: {
        image: {
          maxBytes: imageMaxBytes,
          maxLongestSidePx: imageMaxLongestSidePx,
          mediaTypes: [...imageMediaTypes],
        },
        model: { maxBytes: modelMaxBytes },
      },
      photorealRender: availability.available
        ? { available: true, reason: null, renderer: { ...availability.renderer } }
        : { available: false, reason: availability.reason, renderer: null },
    };
  });
};
