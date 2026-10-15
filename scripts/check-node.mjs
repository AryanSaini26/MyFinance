import { spawnSync } from "node:child_process";
// Fail immediately on any failed step; this same sequence runs in Docker and CI.
export const nodeChecks = [
  "typecheck",
  "test",
  "db:migrate",
  "db:migrate",
  "test:integration",
];
for (const check of nodeChecks) {
  const result = spawnSync("npm", ["run", check], { stdio: "inherit" });
  if (result.error) {
    console.error(`Could not start ${check}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
