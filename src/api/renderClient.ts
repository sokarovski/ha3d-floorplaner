// Capabilities and photorealistic render jobs (spec/architecture/api.md#exports-and-renders).
import { RenderJobResponse, SubmitRenderResponse } from "@shared/contracts/renders";
import type { RenderJobResponseValue, RenderSnapshotValue } from "@shared/contracts/renders";
import { CapabilitiesResponse } from "@shared/contracts/system";
import type { CapabilitiesResponseValue } from "@shared/contracts/system";
import type { HttpClient } from "./httpClient";

export type RenderClient = ReturnType<typeof createRenderClient>;

export const createRenderClient = (http: HttpClient) => ({
  capabilities: async (signal?: AbortSignal): Promise<CapabilitiesResponseValue> =>
    http.request({ method: "GET", path: ["capabilities"], signal }, CapabilitiesResponse),
  submit: async (houseId: string, scene: Blob, snapshot: RenderSnapshotValue): Promise<string> => {
    const form = new FormData();
    form.append("snapshot", JSON.stringify(snapshot));
    form.append("scene", scene, "scene.glb");
    return (
      await http.request({ method: "POST", path: ["houses", houseId, "renders"], form }, SubmitRenderResponse)
    ).jobId;
  },
  job: async (houseId: string, jobId: string, signal?: AbortSignal): Promise<RenderJobResponseValue> =>
    http.request({ method: "GET", path: ["houses", houseId, "renders", jobId], signal }, RenderJobResponse),
  cancel: async (houseId: string, jobId: string): Promise<void> =>
    http.requestEmpty({ method: "DELETE", path: ["houses", houseId, "renders", jobId] }),
});
