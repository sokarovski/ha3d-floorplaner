// One release version (package.json "version") for the integration, its viewer bundle and the app.
import { readFile } from "node:fs/promises";

const semver = /^\d+\.\d+\.\d+$/;

const field = async (path: string, pattern: RegExp): Promise<string | null> => {
  const match = pattern.exec(await readFile(path, "utf8"));
  return match?.[1] ?? null;
};

/** The single version source. */
export const packageVersion = async (): Promise<string> => {
  const version = await field("package.json", /^\s*"version":\s*"([^"]+)"/m);
  if (version === null || !semver.test(version))
    throw new Error(`package.json version must be MAJOR.MINOR.PATCH`);
  return version;
};

/** Every copy that HA or Marketplace reads directly; each must equal package.json. */
const copies: readonly (readonly [string, RegExp])[] = [
  ["custom_components/homeplan/manifest.json", /^\s*"version":\s*"([^"]+)"/m],
  ["custom_components/homeplan/const.py", /^VERSION = "([^"]+)"$/m],
];

/** Fails with every mismatching file named, so a release cannot ship two versions. */
export const checkVersions = async (): Promise<string> => {
  const version = await packageVersion();
  const problems: string[] = [];
  for (const [path, pattern] of copies) {
    const found = await field(path, pattern);
    if (found !== version) problems.push(`${path}: ${found ?? "missing"} (expected ${version})`);
  }
  if (problems.length > 0) throw new Error(`Version mismatch with package.json:\n  ${problems.join("\n  ")}`);
  return version;
};
