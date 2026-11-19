// Regenerates the @import list in src/design-system/styles/app.tw.css from every *.tw.css file under src/.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const entry = "src/design-system/styles/app.tw.css";
const fixed = new Set([
  "src/design-system/styles/app.tw.css",
  "src/design-system/styles/tokens.tw.css",
  "src/design-system/styles/base.tw.css",
]);

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".tw.css") ? [path] : [];
  });

const files = walk("src")
  .filter((file) => !fixed.has(file))
  .sort((a, b) =>
    a.startsWith("src/design-system") === b.startsWith("src/design-system")
      ? a.localeCompare(b)
      : a.startsWith("src/design-system")
        ? -1
        : 1,
  );

const header = readFileSync(entry, "utf8")
  .split("\n")
  .filter((line) => !line.startsWith('@import "../') && !line.startsWith('@import "../../'))
  .join("\n")
  .trimEnd();
const imports = files.map((file) => `@import "${relative("src/design-system/styles", file)}";`);
writeFileSync(entry, `${header}\n${imports.join("\n")}\n`);
console.log(`app.tw.css imports ${String(imports.length)} stylesheets`);
