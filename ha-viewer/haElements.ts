// Home Assistant's own form elements (ha-form with entity and ui_action selectors) are lazy-loaded by the HA
// frontend. Building a card's config editor once makes HA load them; custom cards commonly do this through the
// public window.loadCardHelpers(). Resolves false outside HA (for example in the harness), and callers then
// fall back to plain controls.

const definedWithin = async (name: string, timeoutMs: number): Promise<boolean> => {
  if (customElements.get(name) !== undefined) return true;
  const timeout = new Promise<false>((resolve) => {
    window.setTimeout(() => {
      resolve(false);
    }, timeoutMs);
  });
  return Promise.race([customElements.whenDefined(name).then(() => true), timeout]);
};

let loading: Promise<boolean> | null = null;

const load = async (): Promise<boolean> => {
  if (customElements.get("ha-form") !== undefined) return true;
  const loader: unknown = Reflect.get(window, "loadCardHelpers");
  if (typeof loader !== "function") return false;
  try {
    const helpers: unknown = await Reflect.apply(loader, window, []);
    const create: unknown =
      typeof helpers === "object" && helpers !== null ? Reflect.get(helpers, "createCardElement") : undefined;
    if (typeof create !== "function") return false;
    // The button card's editor uses ha-form with entity and ui_action selectors.
    const card: unknown = Reflect.apply(create, helpers, [{ type: "button", entity: "sun.sun" }]);
    // A lazily loaded card type (the dev harness's cards bundle) is created before its class is defined: its
    // class is the registered one, once defined.
    const constructor: unknown =
      card instanceof HTMLElement
        ? await Promise.race([
            customElements.whenDefined(card.localName),
            new Promise<undefined>((resolve) => {
              window.setTimeout(() => {
                resolve(undefined);
              }, 5000);
            }),
          ])
        : undefined;
    const getConfigElement: unknown =
      typeof constructor === "function" ? Reflect.get(constructor, "getConfigElement") : undefined;
    if (typeof getConfigElement === "function") await Reflect.apply(getConfigElement, constructor, []);
  } catch {
    return false;
  }
  return definedWithin("ha-form", 5000);
};

/** True when HA's ha-form is available (loads it on first call). */
export const loadHaForm = (): Promise<boolean> => {
  loading ??= load();
  return loading;
};
