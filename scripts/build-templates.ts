// Built-in object templates (spec/builder/features/object-templates.md, D17, D26): generates each built-in
// procedurally with glTF Transform and writes server/builtin-templates/<id>/{v1.glb, template.json,
// thumbnail.svg}. Families live in scripts/templates/<family>.ts (listed in scripts/templates/index.ts),
// shared helpers in scripts/templates/helpers.ts. Every asset must pass the Khronos glTF Validator with
// zero errors, the Homeplan metadata validation, and a resize-engine round trip at its default parameters;
// the script exits non-zero otherwise. Dev-only fixture families are written to
// src/features/viewport/fixtures/<id>.glb instead.
// Run: npm run templates:build [-- --only <family>[,<family>…]]
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTemplate, outputRoot } from "./templates/helpers";
import type { TemplateSpec } from "./templates/helpers";
import { families, fixtureFamilies } from "./templates/index";

const fixtureRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../src/features/viewport/fixtures",
);

const selectedFamilies = (args: readonly string[]): readonly string[] | null => {
  const index = args.indexOf("--only");
  if (index < 0) return null;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error("--only needs a family name");
  return value.split(",").map((name) => name.trim());
};

const main = async (): Promise<void> => {
  const only = selectedFamilies(process.argv.slice(2));
  const known = [...Object.keys(families), ...Object.keys(fixtureFamilies)];
  for (const name of only ?? []) {
    if (!known.includes(name)) throw new Error(`Unknown family ${name} (known: ${known.join(", ")})`);
  }
  const chosen = (list: Readonly<Record<string, readonly TemplateSpec[]>>): TemplateSpec[] =>
    Object.entries(list).flatMap(([name, specs]) => (only === null || only.includes(name) ? specs : []));
  const builtins = chosen(families);
  const fixtures = chosen(fixtureFamilies);
  mkdirSync(outputRoot, { recursive: true });
  const ids = new Set<string>();
  for (const spec of [...Object.values(families).flat(), ...Object.values(fixtureFamilies).flat()]) {
    if (ids.has(spec.id)) throw new Error(`Duplicate template id ${spec.id}`);
    ids.add(spec.id);
  }
  let failed = false;
  for (const [spec, fixtureFile] of [
    ...builtins.map((spec): [TemplateSpec, string | undefined] => [spec, undefined]),
    ...fixtures.map((spec): [TemplateSpec, string | undefined] => [
      spec,
      resolve(fixtureRoot, `${spec.id}.glb`),
    ]),
  ]) {
    const report = await buildTemplate(spec, fixtureFile);
    const status = report.errors.length === 0 ? "OK  " : "FAIL";
    console.log(
      `${status} ${report.id.padEnd(20)} ${String(report.bytes).padStart(7)} B ${String(report.triangles).padStart(5)} tris  ${report.warnings} warnings  ${report.parameters}`,
    );
    for (const error of report.errors) console.log(`     ${error}`);
    if (report.errors.length > 0) failed = true;
  }
  console.log(
    failed
      ? "Built-in templates: FAILED"
      : `Built-in templates: ${builtins.length} written to ${outputRoot}` +
          (fixtures.length === 0 ? "" : `; ${fixtures.length} fixture(s) written to ${fixtureRoot}`),
  );
  if (failed) process.exitCode = 1;
};

await main();
