// The site's own pages, resolved against the deployment base path.

const base = import.meta.env.BASE_URL;

export const pages = {
  home: base,
  possibilities: `${base}possibilities.html`,
} as const;

export type PageName = keyof typeof pages;
