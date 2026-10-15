import { afterEach, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function run(failNode = false) {
  const dir = mkdtempSync(join(tmpdir(), "myfinance-runner-"));
  directories.push(dir);
  const capture = join(dir, "calls.jsonl");
  writeFileSync(
    join(dir, "docker"),
    `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(process.env.CAPTURE,JSON.stringify(args)+'\\n');if(process.env.FAIL_NODE==='1'&&args.includes('node-tests'))process.exit(23);\n`,
    { mode: 0o755 },
  );
  const result = spawnSync(process.execPath, ["scripts/test-docker.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: dir + ":" + process.env.PATH,
      CAPTURE: capture,
      FAIL_NODE: failNode ? "1" : "0",
    },
  });
  return {
    result,
    calls: readFileSync(capture, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as string[]),
  };
}
it("orchestrates isolated suites sequentially and cleans up the test project (Docker mocked)", () => {
  const { result, calls } = run();
  expect(result.status).toBe(0);
  const runs = calls.filter((c) => c.includes("run"));
  expect(runs).toHaveLength(2);
  expect(runs[0].at(-1)).toBe("node-tests");
  expect(runs[1].at(-1)).toBe("go-tests");
  expect(calls.at(-1)).toContain("down");
  expect(calls.at(-1)).toContain("--volumes");
  const projects = calls
    .filter((c) => c.includes("--project-name"))
    .map((c) => c[c.indexOf("--project-name") + 1]);
  expect(new Set(projects).size).toBe(1);
  expect(projects[0]).toMatch(/^myfinance-test-[a-f0-9]{12}$/);
});
it("propagates a failed Node container, skips Go and still cleans up (Docker mocked)", () => {
  const { result, calls } = run(true);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("exit 23");
  expect(calls.some((c) => c.includes("go-tests"))).toBe(false);
  expect(calls.at(-1)).toContain("down");
});
it("fails clearly when Docker is missing instead of claiming a pass", () => {
  const result = spawnSync(process.execPath, ["scripts/test-docker.mjs"], {
    encoding: "utf8",
    env: { ...process.env, PATH: "" },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Docker CLI is unavailable");
  expect(result.stdout).not.toContain("checks passed");
});
