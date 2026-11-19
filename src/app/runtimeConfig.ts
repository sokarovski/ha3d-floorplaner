// One validated runtime configuration for router basename and API/asset base URLs.
// The base comes from the page's <base href>, which the server sets per request, so the same build runs at `/`, under
// HOMEPLAN_BASE_PATH, or behind Home Assistant ingress's per-install prefix (spec/home-assistant/publishing.md).

export type RuntimeConfig = Readonly<{
  routerBasename: string;
  apiBaseUrl: string;
}>;

const normalizeBase = (base: string): string => (base.endsWith("/") ? base : `${base}/`);

export const loadRuntimeConfig = (): RuntimeConfig => {
  const base = normalizeBase(new URL(document.baseURI).pathname);
  return {
    routerBasename: base === "/" ? "/" : base.replace(/\/$/, ""),
    apiBaseUrl: `${base}api`,
  };
};
