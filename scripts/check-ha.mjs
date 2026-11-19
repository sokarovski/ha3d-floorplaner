// Uses an isolated HA Python environment when supplied; never selects an installation server.
import { spawnSync } from "node:child_process";
const commands = [
  [process.execPath, ["--import", "tsx", "scripts/check-ha-snapshots.ts"]],
  [process.env.HOMEPLAN_HA_PYTHON ?? "python3", ["scripts/check-ha-storage.py"]],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
