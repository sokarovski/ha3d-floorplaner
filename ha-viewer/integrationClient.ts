// The integration side of HouseSource's transport boundary; every private byte uses current HA auth.
import type { Static, TSchema } from "typebox";
import {
  Bootstrap,
  ClientAddressResponse,
  ConnectionResponse,
  ConnectResponse,
  CopyMetadata,
  FrontendStatus,
  SourceStatus,
  IntegrationConfigResponse,
  IntegrationJobResponse,
  ArchiveImportResponse,
  IntegrationJobsResponse,
  PeekResponse,
  UseHouseResponse,
} from "@shared/contracts/homeplanIntegration";
import type { BootstrapValue } from "@shared/contracts/homeplanIntegration";
import { compileValidator } from "@shared/domain/validation/ajv";
import type { Hass } from "./hassStore";
import { SourceError } from "./houseSource";

export const integrationUrl = (...segments: readonly string[]): string =>
  new URL(`/api/homeplan/${segments.map(encodeURIComponent).join("/")}`, location.origin).href;

export const createIntegrationClient = (currentHass: () => Hass | null) => {
  const fetchPrivate = async (url: string, init?: RequestInit): Promise<Response> => {
    const resolved = new URL(url, location.origin);
    if (resolved.origin !== location.origin || !resolved.pathname.startsWith("/api/homeplan/"))
      throw new SourceError("Private resources must be served by this HA integration.", null);
    const fetcher = currentHass()?.fetchWithAuth;
    if (fetcher === undefined)
      throw new SourceError("Waiting for Home Assistant's authenticated transport.", null);
    const response = await fetcher(resolved.pathname + resolved.search, { cache: "no-store", ...init });
    if (!response.ok) {
      let message = `Homeplan answered HTTP ${String(response.status)}.`;
      try {
        const payload: unknown = await response.json();
        if (
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "object" &&
          payload.error !== null &&
          "message" in payload.error &&
          typeof payload.error.message === "string"
        )
          message = payload.error.message;
      } catch {
        /* Retain the HTTP error if HA supplied a non-JSON response. */
      }
      throw new SourceError(message, response.status);
    }
    return response;
  };
  const request = async <S extends TSchema>(
    schema: S,
    path: readonly string[],
    body?: unknown,
    method = "POST",
  ): Promise<Static<S>> => {
    const response = await fetchPrivate(
      integrationUrl(...path),
      body === undefined
        ? undefined
        : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    );
    const payload: unknown = await response.json();
    if (!compileValidator(schema)(payload))
      throw new SourceError(
        "Homeplan returned an incompatible response; update the integration or reload.",
        null,
      );
    return payload;
  };
  return {
    request,
    fetchPrivate,
    bootstrap: () => request(Bootstrap, ["bootstrap"]),
    config: () => request(IntegrationConfigResponse, ["config"]),
    connection: () => request(ConnectionResponse, ["connection"]),
    clientAddress: () => request(ClientAddressResponse, ["client-address"]),
    saveConnection: (
      expectedRevision: number,
      patch: Readonly<{ builderUrl?: string | null; devMode?: boolean; servers?: string[] }>,
    ) => request(ConnectionResponse, ["connection"], { expectedRevision, patch }, "PATCH"),
    /** Removes Home Assistant's copy of a house (not the shown one; Phase 21). */
    removeCopy: async (houseId: string): Promise<void> => {
      await fetchPrivate(integrationUrl("houses", houseId), { method: "DELETE" });
    },
    /** A local copy as a house archive (.zip, Phase 21). */
    houseArchive: async (houseId: string): Promise<Blob> =>
      (await fetchPrivate(integrationUrl("houses", houseId, "archive"))).blob(),
    /** Uploads a house archive as a local copy; `replace` replaces an existing copy of the same house. */
    importArchive: async (archive: Blob, replace: boolean): Promise<Static<typeof ArchiveImportResponse>> => {
      const response = await fetchPrivate(
        `${integrationUrl("houses", "import")}${replace ? "?replace=1" : ""}`,
        {
          method: "POST",
          headers: { "content-type": "application/zip" },
          body: archive,
        },
      );
      const payload: unknown = await response.json();
      if (!compileValidator(ArchiveImportResponse)(payload))
        throw new SourceError(
          "Homeplan returned an incompatible response; update the integration or reload.",
          null,
        );
      return payload;
    },
    /** Another floor planner's houses, read only (Phase 21). */
    peek: (url: string) => request(PeekResponse, ["source", "peek"], { url }),
    connect: (expectedRevision: number) =>
      request(ConnectResponse, ["source", "connect"], { expectedRevision }),
    useHouse: (houseId: string, expectedRevision: number, generation: number) =>
      request(UseHouseResponse, ["source", "houses", houseId, "use"], { expectedRevision, generation }),
    copy: (houseId: string) => request(CopyMetadata, ["houses", houseId]),
    sourceStatus: (houseId: string) => request(SourceStatus, ["source", "houses", houseId]),
    upgradeHouse: (houseId: string, generation: number, expectedSourceRevisionId?: string) =>
      request(IntegrationJobResponse, ["houses", houseId, "upgrade"], {
        generation,
        ...(expectedSourceRevisionId === undefined ? {} : { expectedSourceRevisionId }),
      }),
    frontend: () => request(FrontendStatus, ["frontend"]),
    upgradeFrontend: (generation: number) =>
      request(IntegrationJobResponse, ["frontend", "upgrade"], { generation }),
    /** The previous panel again (Phase 21, Settings → Panels); it swaps places with the current one. */
    usePreviousFrontend: async (expectedRevision: number): Promise<void> => {
      await fetchPrivate(integrationUrl("frontend", "use-previous"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision }),
      });
    },
    restoreFrontend: async (expectedRevision: number): Promise<void> => {
      await fetchPrivate(integrationUrl("frontend", "restore-packaged"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision }),
      });
    },
    job: (jobId: string) => request(IntegrationJobResponse, ["jobs", jobId]),
    jobs: () => request(IntegrationJobsResponse, ["jobs"]),
    cancel: (jobId: string) => request(IntegrationJobResponse, ["jobs", jobId], {}, "DELETE"),
    moduleUrl: (bootstrap: BootstrapValue, remote: boolean): string => {
      if (remote) {
        const base = bootstrap.connection.builderUrl;
        if (base === null) throw new SourceError("DEV MODE needs a Floor Builder URL.", null);
        return new URL("ha-viewer/entry.ts", base).href;
      }
      const active = bootstrap.frontend.active;
      return active === null
        ? new URL("/homeplan-static/viewer.js", location.origin).href
        : new URL(`/homeplan/frontend/${active.bundleId}/files/${active.entry}`, location.origin).href;
    },
  };
};
export type IntegrationClient = ReturnType<typeof createIntegrationClient>;
