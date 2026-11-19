// Writes the default colour scheme's derived role tokens into tokens.tw.css (Phase 5.5): the first-paint
// fallback before the theme controller applies the saved scheme. Run through `npm run styles:sync`.
import { readFileSync, writeFileSync } from "node:fs";
import { defaultScheme, deriveTheme } from "../src/design-system/tokens/colorScheme";

const file = "src/design-system/styles/tokens.tw.css";
const source = readFileSync(file, "utf8");

const block = (theme: "light" | "dark"): string =>
  Object.entries(deriveTheme(defaultScheme, theme))
    .map(([role, value]) => `  --ui-color-${role}: ${value};`)
    .join("\n");

const replaceBlock = (text: string, opener: string, theme: "light" | "dark"): string => {
  const start = text.indexOf(opener);
  if (start < 0) throw new Error(`tokens.tw.css: missing ${opener}`);
  const bodyStart = text.indexOf("\n", text.indexOf("color-scheme:", start)) + 1;
  const end = text.indexOf("\n}", bodyStart);
  return `${text.slice(0, bodyStart)}${block(theme)}${text.slice(end)}`;
};

let next = replaceBlock(source, ':root,\n[data-ui-root][data-theme="light"] {', "light");
next = replaceBlock(next, '[data-ui-root][data-theme="dark"] {', "dark");
writeFileSync(file, next);
console.log(`Wrote the default scheme's tokens to ${file}`);
