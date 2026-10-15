import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
// A unique project prevents collisions with development or other test runs.
const project = "myfinance-test-" + randomBytes(6).toString("hex");
const base = [
  "compose",
  "--file",
  "compose.test.yaml",
  "--project-name",
  project,
];
function docker(args) {
  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (result.error)
    throw new Error(
      "Docker CLI is unavailable. Install/start Docker Desktop or run in GitHub Actions.",
    );
  if (result.status !== 0)
    throw new Error(
      `Docker command failed (exit ${result.status ?? "unknown"})`,
    );
}
let attempted = false;
try {
  docker(["info", "--format", "{{.ServerVersion}}"]);
  docker([...base, "config", "--quiet"]);
  attempted = true;
  console.log(`Disposable test project: ${project}`);
  // Sequential execution matters: both suites deliberately reset the test database.
  docker([...base, "run", "--build", "--rm", "node-tests"]);
  docker([...base, "run", "--build", "--rm", "go-tests"]);
  console.log("Containerized Node and Go integration checks passed.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (attempted) {
    try {
      docker([...base, "down", "--volumes", "--remove-orphans"]);
    } catch {
      console.error(
        `Cleanup failed; run docker ${base.join(" ")} down --volumes --remove-orphans`,
      );
      process.exitCode = 1;
    }
  }
}
