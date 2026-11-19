// The site's own pages, resolved against the deployment base path.

const base = import.meta.env.BASE_URL;

export const pages = {
  home: base,
  possibilities: `${base}possibilities.html`,
  install: `${base}install.html`,
  sideCards: `${base}side-cards.html`,
  developers: `${base}developers.html`,
  liveDemo: `${base}live-demo/`,
} as const;

export type PageName = keyof typeof pages;
