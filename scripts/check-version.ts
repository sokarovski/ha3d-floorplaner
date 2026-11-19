// Fails when the integration's version copies differ from package.json (the one release version).
import { checkVersions } from "./lib/version";

process.stdout.write(
  `Version ${await checkVersions()}: integration manifest and constants match package.json\n`,
);
