import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { setTimeout as pause } from "node:timers/promises";
import { Configuration, PlaidApi, PlaidEnvironments, Products } from "plaid";
import { handle } from "../apps/web/src/lib/api.ts";
import { db } from "../apps/web/src/lib/db.ts";

try {
  process.loadEnvFile(".env");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const required = ["PLAID_CLIENT_ID", "PLAID_SECRET"];
if (
  process.env.PLAID_MODE !== "sandbox" ||
  process.env.PLAID_ENV !== "sandbox" ||
  required.some((k) => !process.env[k] || process.env[k].startsWith("replace_"))
) {
  console.error(
    "Live Sandbox test not run. Set PLAID_MODE=sandbox, PLAID_ENV=sandbox, PLAID_CLIENT_ID and PLAID_SECRET in private .env.",
  );
  process.exit(1);
}
let databaseUrl;
try {
  databaseUrl = new URL(process.env.TEST_DATABASE_URL ?? "");
} catch {
  console.error(
    "Live Sandbox test not run. Set TEST_DATABASE_URL to a separate PostgreSQL database named *_test.",
  );
  process.exit(1);
}
if (!decodeURIComponent(databaseUrl.pathname).endsWith("_test")) {
  console.error("Refusing to use a database whose name does not end in _test.");
  process.exit(1);
}
process.env.DATABASE_URL = databaseUrl.href;
process.env.APP_ORIGIN = "http://localhost:3000";
process.env.COOKIE_SECURE = "false";
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.SYNC_SERVICE_SECRET = randomBytes(32).toString("hex");
const listener = createServer();
await new Promise((resolve, reject) => {
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", resolve);
});
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
process.env.SYNC_SERVICE_URL = `http://127.0.0.1:${port}`;
const client = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments.sandbox,
    baseOptions: {
      timeout: 15000,
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
      },
    },
  }),
);
let userId,
  itemId,
  cookie = "",
  child,
  childError,
  binaryDirectory;
async function api(path, method = "GET", body) {
  const response = await handle(
    new Request(process.env.APP_ORIGIN + "/api/" + path, {
      method,
      headers: {
        Origin: process.env.APP_ORIGIN,
        "Content-Type": "application/json",
        cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path.split("?")[0].split("/"),
  );
  const data = await response.json();
  if (!response.ok) {
    const failure = new Error(
      `${path.split("?")[0]} failed (${response.status}; ${data.error?.code ?? "unknown"})`,
    );
    failure.status = response.status;
    throw failure;
  }
  return { data, response };
}
try {
  await db().query("SELECT 1 FROM schema_migrations LIMIT 1");
  binaryDirectory = await mkdtemp(join(tmpdir(), "myfinance-sandbox-"));
  const binary = join(binaryDirectory, "sync");
  const build = spawnSync("go", ["build", "-o", binary, "./cmd/sync"], {
    cwd: "services/sync",
    stdio: "inherit",
  });
  if (build.error || build.status !== 0)
    throw new Error(
      "Go build failed; install supported Go and verify dependencies.",
    );
  child = spawn(binary, [], {
    cwd: "services/sync",
    env: { ...process.env, SYNC_LISTEN_ADDR: `127.0.0.1:${port}` },
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.once("error", (error) => {
    childError = error;
  });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (childError || child.exitCode !== null)
      throw new Error(
        "Go service could not start. Install Go and verify the test database configuration.",
      );
    try {
      ready = (
        await fetch(process.env.SYNC_SERVICE_URL + "/health", {
          signal: AbortSignal.timeout(1000),
        })
      ).ok;
    } catch {}
    if (ready) break;
    await pause(500);
  }
  if (!ready) throw new Error("Go service readiness timed out");
  const auth = await api("auth/register", "POST", {
    email: `sandbox-smoke-${randomUUID()}@example.test`,
    password: randomBytes(24).toString("hex"),
  });
  userId = auth.data.user.id;
  cookie = auth.response.headers.get("set-cookie").split(";")[0];
  const link = await api("plaid/link-token", "POST");
  if (link.data.mode !== "sandbox" || !link.data.link_token)
    throw new Error("Expected a real Sandbox Link token");
  const token = await client.sandboxPublicTokenCreate({
    institution_id: "ins_109508",
    initial_products: [Products.Transactions],
  });
  itemId = (
    await api("plaid/exchange", "POST", {
      publicToken: token.data.public_token,
    })
  ).data.id;
  const accounts = (await api("accounts")).data.filter(
    (a) => a.item_id === itemId,
  );
  if (accounts.length === 0) throw new Error("No Plaid accounts were stored");
  console.log(
    "Sandbox Link token, public-token exchange and account metadata passed.",
  );
  let entries = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await api(`items/${itemId}/sync`, "POST");
    } catch (error) {
      if (error.status !== 502 || attempt === 9) throw error;
      console.log("Sandbox initialization is not ready; retrying safely…");
      await pause(2000);
      continue;
    }
    entries = (await api("transactions?limit=100")).data.filter(
      (t) => t.source === "plaid",
    );
    if (entries.length) break;
    console.log("Waiting for Sandbox transaction initialization…");
    await pause(2000);
  }
  if (!entries.length)
    throw new Error(
      "Sandbox returned no transactions within the polling window; retry after initialization",
    );
  await api(`items/${itemId}/sync`, "POST");
  const state = (
    await db().query(
      "SELECT cursor,last_synced_at FROM sync_state WHERE item_id=$1",
      [itemId],
    )
  ).rows[0];
  if (!state.cursor || !state.last_synced_at)
    throw new Error("Cursor persistence check failed");
  console.log(
    "Sandbox transaction sync, repeated sync and durable cursor passed.",
  );
} catch (error) {
  // Never print SDK/Axios objects, request bodies, URLs containing credentials or access tokens.
  console.error(
    error?.isAxiosError
      ? "Sandbox provider request failed; verify Sandbox keys and product access."
      : error.message,
  );
  process.exitCode = 1;
} finally {
  let disconnected = !itemId;
  if (itemId) {
    try {
      await api(`items/${itemId}`, "DELETE");
      disconnected = true;
      console.log("Sandbox Item disconnection passed.");
    } catch {
      console.error(
        "Sandbox Item cleanup failed; encrypted recovery state was retained in the test database.",
      );
      process.exitCode = 1;
    }
  }
  if (userId && disconnected) {
    try {
      await db().query("DELETE FROM users WHERE id=$1", [userId]);
    } catch {
      console.error("Synthetic test user cleanup failed.");
      process.exitCode = 1;
    }
  }
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      pause(10000),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  await db().end();
  if (binaryDirectory)
    await rm(binaryDirectory, { recursive: true, force: true });
}
if (!process.exitCode)
  console.log(
    "Live Plaid Sandbox backend smoke test passed. Hosted Link UI is a separate manual check.",
  );
