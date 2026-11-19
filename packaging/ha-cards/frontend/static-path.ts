// Must be the first import of entry.ts: HA's modules read __STATIC_PATH__ (fonts, icons, Intl locale data) when
// they are evaluated. The static files sit in a "static/" folder next to the bundle (rspack.config.cjs keeps
// import.meta.url here at runtime, as HA's own demo/src/embed/public-path.ts does). The URL goes through a
// variable so rspack does not take `new URL("./static/", import.meta.url)` for an asset to bundle.
const bundleUrl = import.meta.url;
if (!("__HA_STATIC_PATH__" in globalThis))
  Object.assign(globalThis, { __HA_STATIC_PATH__: new URL("./static/", bundleUrl).href });
