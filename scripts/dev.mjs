// Runs the Fastify backend (watch mode) and the Vite dev server together.
import { spawn } from "node:child_process";

const children = [
  spawn("npm", ["run", "dev:server"], { stdio: "inherit" }),
  spawn("npm", ["run", "dev:client"], { stdio: "inherit" }),
];

const stop = () => {
  for (const child of children) child.kill("SIGTERM");
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) {
  child.on("exit", (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
}
