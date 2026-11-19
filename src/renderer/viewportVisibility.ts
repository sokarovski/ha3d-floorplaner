// Whether a viewport is on screen (Phase 16.11, spec/architecture/renderer.md#lifecycle-and-performance-rules).
// Framework-free; browser only. A viewport is off screen while the page is hidden (another browser tab, the HA app in
// the background), while its element is not in the document or has no size (another HA panel or dashboard is shown),
// or while it is scrolled or laid out out of view. The host pauses its frames, animations and timers meanwhile.

export type ViewportVisibility = Readonly<{
  /** True while the viewport is on screen. */
  onScreen: () => boolean;
  dispose: () => void;
}>;

/** Watches `element`; `onChange` is called with the new value whenever it changes (not for the initial one). */
export const watchViewportVisibility = (
  element: Element,
  onChange: (onScreen: boolean) => void,
): ViewportVisibility => {
  // Until the observer reports, the element counts as in view: a viewport created visible draws at once.
  let inView = true;
  let current = !document.hidden;
  const update = (): void => {
    const next = !document.hidden && inView && element.isConnected;
    if (next === current) return;
    current = next;
    onChange(next);
  };
  const onPageVisibility = (): void => {
    update();
  };
  document.addEventListener("visibilitychange", onPageVisibility);
  // An element removed from the document, hidden with display: none, or sized to zero reports no intersection.
  const observer = new IntersectionObserver((entries) => {
    const last = entries[entries.length - 1];
    if (last === undefined) return;
    inView = last.isIntersecting;
    update();
  });
  observer.observe(element);
  return {
    onScreen: () => current,
    dispose: () => {
      document.removeEventListener("visibilitychange", onPageVisibility);
      observer.disconnect();
    },
  };
};
