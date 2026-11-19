// npm run app:check: the Home Assistant app packaging at the repository root is consistent
// (spec/home-assistant/publishing.md#app-packaging-and-ingress). Exits 1 on any problem.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isRecord, parseJson } from "../server/lib/json";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const problems: string[] = [];
const warnings: string[] = [];
const read = (name: string): string =>
  existsSync(resolve(root, name)) ? readFileSync(resolve(root, name), "utf8") : "";

for (const name of ["repository.yaml", "config.yaml", "Dockerfile", ".dockerignore", "DOCS.md", "LICENSE"])
  if (!existsSync(resolve(root, name))) problems.push(`${name} is missing`);
// Generated from brand/ha3d-logo.svg by the brand-icon script; the image build does not need them.
for (const name of ["icon.png", "logo.png"])
  if (!existsSync(resolve(root, name))) warnings.push(`${name} is missing (generate the brand icons)`);

/** The value of a top-level `key: value` line of config.yaml, without quotes. */
const config = read("config.yaml");
const topLevel = (key: string): string | undefined => {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(config);
  return match?.[1]
    ?.replace(/\s+#.*$/, "")
    .replace(/^["']|["']$/g, "")
    .trim();
};
/** The items of a top-level block list (`key:` followed by `  - item` lines). */
const listOf = (key: string): string[] => {
  const match = new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]+-[^\\n]*\\n?)+)`, "m").exec(config);
  return (match?.[1] ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*-\s*/, "").trim())
    .filter((item) => item !== "");
};

const pkg = parseJson(read("package.json"));
const pkgVersion =
  pkg.ok && isRecord(pkg.value) && typeof pkg.value.version === "string" ? pkg.value.version : "";
if (topLevel("version") !== pkgVersion)
  problems.push(
    `config.yaml version "${topLevel("version") ?? ""}" differs from package.json "${pkgVersion}"`,
  );
if (topLevel("slug") !== "homeplan") problems.push("config.yaml slug must be homeplan");
if (topLevel("image") !== undefined)
  problems.push("config.yaml must not set image (the app builds on the device)");
if (topLevel("ports") !== undefined)
  problems.push("config.yaml must not map ports (the builder opens through ingress)");
if (topLevel("ingress") !== "true") problems.push("config.yaml must enable ingress");
if (!listOf("discovery").includes("homeplan")) problems.push("config.yaml discovery must list homeplan");
const arch = listOf("arch");
for (const required of ["amd64", "aarch64"])
  if (!arch.includes(required)) problems.push(`config.yaml arch must include ${required}`);

const dockerfile = read("Dockerfile");
const args = new Map<string, string>();
for (const match of dockerfile.matchAll(/^ARG\s+(\w+)=(\S+)/gm))
  if (match[1] !== undefined && match[2] !== undefined) args.set(match[1], match[2]);
const bases = [...dockerfile.matchAll(/^FROM\s+(\S+)/gm)]
  .map((match) => match[1] ?? "")
  .map((image) => image.replace(/^\$\{(\w+)\}$/, (_, name: string) => args.get(name) ?? image));
if (bases.length === 0) problems.push("Dockerfile has no FROM");
for (const image of bases) {
  const tag = /^[^@\s]+:([^@\s]+)/.exec(image)?.[1];
  if (tag === undefined || tag === "latest" || !/\d+\.\d+\.\d+/.test(tag))
    problems.push(`Dockerfile base "${image}" must be pinned to an exact version tag`);
  else if (!image.includes("@sha256:")) warnings.push(`Dockerfile base "${image}" has no digest`);
}
const dockerPort = /^\s*PORT=(\d+)/m.exec(dockerfile)?.[1] ?? /ENV\s+PORT[= ](\d+)/.exec(dockerfile)?.[1];
if (dockerPort !== (topLevel("ingress_port") ?? "8099"))
  problems.push(`Dockerfile PORT ${dockerPort ?? "(unset)"} differs from config.yaml ingress_port`);

const ignored = new Set(
  read(".dockerignore")
    .split("\n")
    .map((line) => line.trim()),
);
for (const name of [".git", ".homeplan-data", "node_modules", ".env", ".env.*", ".claude"])
  if (!ignored.has(name)) problems.push(`.dockerignore must exclude ${name}`);

for (const warning of warnings) process.stdout.write(`warning: ${warning}\n`);
if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`error: ${problem}\n`);
  process.exit(1);
}
process.stdout.write(`App packaging OK (version ${pkgVersion}, bases ${bases.join(", ")})\n`);
