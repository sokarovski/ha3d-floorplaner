// Global preferences routes (spec/architecture/api.md#preferences).
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { PatchPreferencesBody, PreferencesResponse } from "../../shared/contracts/preferences";
import type { ServiceContext } from "../services/context";
import { getPreferences, patchPreferences } from "../services/preferencesService";

export const preferencesRoutes: FastifyPluginAsyncTypebox<{ context: ServiceContext }> = async (
  app,
  { context },
) => {
  app.get("/preferences", { schema: { response: { 200: PreferencesResponse } } }, async () =>
    getPreferences(context),
  );

  app.patch(
    "/preferences",
    { schema: { body: PatchPreferencesBody, response: { 200: PreferencesResponse } } },
    async (request) => patchPreferences(context, request.body.expectedRevision, request.body.patch),
  );
};
