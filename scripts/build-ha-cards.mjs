// Builds the HA cards bundle of the website's live demo (spec/product/showcase-website.md#live-demo): real Home
// Assistant Lovelace cards from home-assistant/frontend at a pinned commit, compiled with HA's own toolchain
// around Homeplan's small entry (packaging/ha-cards/frontend/). Writes dist/live-demo-public/ha-cards/, which the
// live demo build (vite.live-demo.config.ts) copies to live-demo/ha-cards/ (ha-cards.js, its chunks,
// static/ with fonts, icons and Intl data, LICENSE.md and NOTICE.md); nothing generated is committed.
//
// - The checkout is .cache/ha-frontend/ (cloned at the pinned commit on first use), or an existing checkout of
//   that commit given by HOMEPLAN_HA_FRONTEND_DIR.
// - HA's toolchain runs on Node 24 with pnpm 12.21.0 through npx, so CI and local builds behave the same.
// - ha-cards/BUILD-INFO.json records the commit and a hash of the inputs; an output that matches is kept.
//
// Run: npm run demo:ha-cards
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** home-assistant/frontend commit the bundle is built from (2026-11-19). */
const frontendCommit = "4d8eca2229633c545926fd0a1cec32f35768949d";
const frontendRepository = "https://github.com/home-assistant/frontend";
const toolchain = ["-y", "-p", "node@24", "-p", "pnpm@12.21.0"];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sources = join(root, "packaging/ha-cards/frontend");
const out = join(root, "dist/live-demo-public/ha-cards");
const checkout = resolve(process.env.HOMEPLAN_HA_FRONTEND_DIR ?? join(root, ".cache/ha-frontend"));
const started = Date.now();

const run = (command, args, cwd, env = {}) => {
  console.log(`$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
};
const toolchainRun = (script, env = {}) => run("npx", [...toolchain, "sh", "-c", script], checkout, env);

const inputsHash = (() => {
  const hash = createHash("sha256").update(frontendCommit);
  for (const name of readdirSync(sources).sort()) hash.update(name).update(readFileSync(join(sources, name)));
  return hash.update(readFileSync(fileURLToPath(import.meta.url))).digest("hex");
})();
const infoPath = join(out, "BUILD-INFO.json");
if (existsSync(infoPath) && JSON.parse(readFileSync(infoPath, "utf8")).inputs === inputsHash) {
  console.log(
    `OK   dist/live-demo-public/ha-cards is up to date (home-assistant/frontend ${frontendCommit.slice(0, 12)}).`,
  );
  process.exit(0);
}

// 1. The checkout at the pinned commit.
if (!existsSync(join(checkout, ".git"))) {
  mkdirSync(checkout, { recursive: true });
  run("git", ["init", "--quiet"], checkout);
  run("git", ["remote", "add", "origin", frontendRepository], checkout);
  run("git", ["fetch", "--depth", "1", "origin", frontendCommit], checkout);
  run("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"], checkout);
}
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).trim();
if (head !== frontendCommit)
  throw new Error(`${checkout} is at ${head}, not the pinned home-assistant/frontend ${frontendCommit}.`);

// 2. HA's dependencies (once per checkout), then its generated icons, translations and Intl locale data.
if (!existsSync(join(checkout, "node_modules/.modules.yaml")))
  toolchainRun("pnpm install --frozen-lockfile --ignore-scripts");
toolchainRun("./node_modules/.bin/gulp gen-icons-json build-translations build-locale-data", {
  NODE_ENV: "production",
});

// 3. Homeplan's entry inside the checkout, with HA's English core and dashboard translations.
const entry = join(checkout, "homeplan-cards");
rmSync(entry, { recursive: true, force: true });
cpSync(sources, entry, { recursive: true });
const translations = join(checkout, "build/translations/output");
const english = (directory) => {
  const name = readdirSync(directory).find((file) => /^en-[0-9a-f]+\.json$/.test(file));
  if (name === undefined) throw new Error(`No English translation in ${directory}.`);
  return join(directory, name);
};
mkdirSync(join(entry, "translations"), { recursive: true });
cpSync(english(translations), join(entry, "translations/core-en.json"));
cpSync(english(join(translations, "lovelace")), join(entry, "translations/lovelace-en.json"));

// 4. The rspack build, then the static files the cards request.
rmSync(out, { recursive: true, force: true });
toolchainRun("node homeplan-cards/build.cjs", { NODE_ENV: "production", HOMEPLAN_HA_CARDS_OUT: out });
const staticDir = join(out, "static");
const roboto = join(checkout, "node_modules/roboto-fontface/fonts/roboto");
mkdirSync(join(staticDir, "fonts/roboto"), { recursive: true });
for (const font of readdirSync(roboto).filter((name) => /^Roboto-.*\.woff2$/.test(name)))
  cpSync(join(roboto, font), join(staticDir, "fonts/roboto", font));
mkdirSync(join(staticDir, "images"), { recursive: true });
cpSync(
  join(checkout, "public/static/images/card_media_player_bg.png"),
  join(staticDir, "images/card_media_player_bg.png"),
);
const localeData = join(checkout, "build/locale-data");
for (const name of readdirSync(localeData)) {
  const file = join(localeData, name, "en.json");
  if (existsSync(file)) cpSync(file, join(staticDir, "locale-data", name, "en.json"));
}
cpSync(join(checkout, "build/mdi"), join(staticDir, "mdi"), { recursive: true });

// 5. Licences: HA frontend (Apache-2.0), the Roboto font and the Material Design Icons it ships; the bundled
// packages' notices are in the *.LICENSE.txt files next to the chunks.
cpSync(join(checkout, "LICENSE.md"), join(out, "LICENSE.md"));
const licenceOf = (directory) => {
  const name = readdirSync(directory).find((file) => /^licen[sc]e/i.test(file));
  if (name === undefined) throw new Error(`No licence file in ${directory}.`);
  return readFileSync(join(directory, name), "utf8");
};
writeFileSync(
  join(out, "NOTICE.md"),
  [
    "# Home Assistant cards in the Homeplan live demo",
    "",
    `These files are built from Home Assistant's frontend, ${frontendRepository}, commit ${frontendCommit},`,
    "licensed under the Apache License 2.0 (LICENSE.md). Homeplan adds a small entry that exposes the card",
    "factory and fills a simulated Home Assistant connection; the Home Assistant code itself is not modified.",
    "Homeplan is not affiliated with or endorsed by Home Assistant or the Open Home Foundation.",
    "",
    "The notices of the packages bundled by Home Assistant's build are in the `*.LICENSE.txt` files next to",
    "the scripts.",
    "",
    "## Roboto (static/fonts/roboto)",
    "",
    licenceOf(join(checkout, "node_modules/roboto-fontface")),
    "",
    "## Material Design Icons (static/mdi)",
    "",
    licenceOf(join(checkout, "node_modules/@mdi/svg")),
    "",
  ].join("\n"),
);

let bytes = 0;
let files = 0;
const measure = (directory) => {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) measure(path);
    else {
      files += 1;
      bytes += readFileSync(path).length;
    }
  }
};
measure(out);
writeFileSync(
  infoPath,
  `${JSON.stringify({ repository: frontendRepository, commit: frontendCommit, inputs: inputsHash }, null, 2)}\n`,
);
console.log(
  `OK   dist/live-demo-public/ha-cards: ${String(files)} files, ${(bytes / 1048576).toFixed(1)} MB in ${String(
    Math.round((Date.now() - started) / 1000),
  )} s`,
);
