import { useEffect } from "react";

// The pages are rendered by React after the browser has already tried to jump to the URL's #anchor, so a link
// such as possibilities.html#builder-agents would stay at the top. Once the page is in the DOM, scroll to the
// anchor's element (the stylesheet's scroll-padding keeps it clear of the sticky header).
export const useHashTarget = (): void => {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id === "") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
};
