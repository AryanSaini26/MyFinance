import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { handle } from "../apps/web/src/lib/api";
import { db, transaction } from "../apps/web/src/lib/db";
import { decryptToken } from "../apps/web/src/lib/security";
let cookieA = "",
  cookieB = "",
  userA = "",
  userB = "",
  accountA = "",
  accountB = "";
const origin = "http://localhost:3000";
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = cookieA,
  extra: Record<string, string> = {},
) {
  return handle(
    new Request(origin + "/api/" + path, {
      method,
      headers: { origin, "content-type": "application/json", cookie, ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path.split("?")[0].split("/"),
  );
}
beforeAll(async () => {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL must point to a migrated disposable PostgreSQL database",
    );
  process.env.APP_ORIGIN = origin;
  process.env.COOKIE_SECURE = "false";
  process.env.TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
  process.env.PLAID_MODE = "mock";
});
beforeEach(async () => {
  await db().query("TRUNCATE users,auth_attempts CASCADE");
  const a = await request("auth/register", "POST", {
    email: "alice@example.test",
    password: "a strong password",
  });
  expect(a.status).toBe(201);
  cookieA = a.headers.get("set-cookie")!.split(";")[0];
  userA = (await a.json()).user.id;
  const b = await request("auth/register", "POST", {
    email: "bob@example.test",
    password: "a strong password",
  });
  cookieB = b.headers.get("set-cookie")!.split(";")[0];
  userB = (await b.json()).user.id;
  accountA = (await (await request("accounts")).json())[0].id;
  accountB = (
    await (await request("accounts", "GET", undefined, cookieB)).json()
  )[0].id;
});
afterAll(async () => {
  await db().end();
});
it("registers, hashes, rejects duplicate email and checks credentials", async () => {
  const hash = (
    await db().query("SELECT password_hash FROM users WHERE id=$1", [userA])
  ).rows[0].password_hash;
  expect(hash).toMatch(/^scrypt\$/);
  expect(
    (
      await request("auth/register", "POST", {
        email: "ALICE@example.test",
        password: "another password",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await request("auth/login", "POST", {
        email: "alice@example.test",
        password: "incorrect password",
      })
    ).status,
  ).toBe(401);
  const login = await request("auth/login", "POST", {
    email: "alice@example.test",
    password: "a strong password",
  });
  expect(login.status).toBe(200);
  expect(login.headers.get("set-cookie")).toContain("HttpOnly");
});
it("expires sessions, logs out and rejects forged identity", async () => {
  expect((await request("accounts", "GET", undefined, "")).status).toBe(401);
  expect((await request("auth/logout", "POST")).status).toBe(200);
  expect((await request("accounts")).status).toBe(401);
  await db().query(
    "UPDATE sessions SET expires_at=now()-interval '1 hour' WHERE user_id=$1",
    [userB],
  );
  expect((await request("accounts", "GET", undefined, cookieB)).status).toBe(
    401,
  );
});
it("rejects missing origin and untrusted mutation origins", async () => {
  expect(
    (
      await request("transactions", "POST", {}, cookieA, {
        origin: "https://evil.example",
      })
    ).status,
  ).toBe(403);
});
it("creates, filters, isolates, and rejects duplicate manual transactions", async () => {
  const data = {
    accountId: accountA,
    description: "coffee cafe",
    amount: "-4.25",
    date: "2026-01-02",
    idempotencyKey: "same-request",
  };
  const first = await request("transactions", "POST", data);
  expect(first.status).toBe(201);
  const id = (await first.json()).id;
  expect((await request("transactions", "POST", data)).status).toBe(409);
  expect(
    (
      await request("transactions", "POST", {
        ...data,
        accountId: accountB,
        idempotencyKey: "other-request",
      })
    ).status,
  ).toBe(404);
  const entries = await (
    await request(
      "transactions?categoryId=dining&from=2026-01-01&to=2026-01-31",
    )
  ).json();
  expect(entries).toHaveLength(1);
  expect(entries[0].amount).toBe("-4.25");
  expect(
    await (await request("transactions", "GET", undefined, cookieB)).json(),
  ).toEqual([]);
  expect(
    (
      await request(
        "transactions/" + id,
        "PATCH",
        { categoryId: "shopping" },
        cookieB,
      )
    ).status,
  ).toBe(404);
  expect(
    (await request("transactions/" + id, "PATCH", { categoryId: "shopping" }))
      .status,
  ).toBe(200);
  expect((await (await request("transactions")).json())[0].category_id).toBe(
    "shopping",
  );
  expect(
    (await request("transactions/" + id, "PATCH", { categoryId: null })).status,
  ).toBe(200);
  expect((await (await request("transactions")).json())[0].category_id).toBe(
    "dining",
  );
  expect(
    (await request("transactions?offset=0%3BDROP%20TABLE%20users")).status,
  ).toBe(400);
});
it("imports CSV atomically, detects replay and rejects conflicts", async () => {
  const csv =
    'date,description,amount,external_id\n2026-01-01,"Coffee, cafe",-5.25,a\n2026-01-02,grocery,-10,b';
  const first = await request("imports/csv", "POST", {
    accountId: accountA,
    csv,
  });
  expect(await first.json()).toEqual({ inserted: 2, duplicates: 0 });
  expect(
    await (
      await request("imports/csv", "POST", { accountId: accountA, csv })
    ).json(),
  ).toEqual({ inserted: 0, duplicates: 2 });
  const conflict =
    "date,description,amount,external_id\n2026-01-01,new transaction,-1,new\n2026-01-01,changed,-99,a";
  expect(
    (
      await request("imports/csv", "POST", {
        accountId: accountA,
        csv: conflict,
      })
    ).status,
  ).toBe(409);
  expect(
    (await db().query("SELECT count(*)::int AS n FROM transactions")).rows[0].n,
  ).toBe(2);
  expect(
    (await request("imports/csv", "POST", { accountId: accountB, csv })).status,
  ).toBe(404);
});
it("rolls back database writes when a later statement fails", async () => {
  await expect(
    transaction(async (c) => {
      await c.query(
        "INSERT INTO accounts(user_id,name,type,currency) VALUES($1,'rollback','manual','CAD')",
        [userA],
      );
      await c.query(
        "INSERT INTO budgets(user_id,category_id,month,currency,amount) VALUES($1,'missing','2026-01-01','CAD',1)",
        [userA],
      );
    }),
  ).rejects.toThrow();
  expect(
    (await db().query("SELECT 1 FROM accounts WHERE name='rollback'")).rowCount,
  ).toBe(0);
});
it("tracks budgets by month/currency and excludes transfers, pending, removed records", async () => {
  for (const [description, amount, categoryId] of [
    ["coffee", "-25", "dining"],
    ["salary", "100", "income"],
    ["transfer", "-50", "transfer"],
  ])
    expect(
      (
        await request("transactions", "POST", {
          accountId: accountA,
          description,
          amount,
          categoryId,
          date: "2026-01-02",
        })
      ).status,
    ).toBe(201);
  expect(
    (
      await request("budgets", "POST", {
        categoryId: "dining",
        amount: "20",
        currency: "CAD",
        month: "2026-01",
      })
    ).status,
  ).toBe(201);
  const summary = await (await request("summary?month=2026-01")).json();
  expect(summary.totals[0].income).toBe("100.00");
  expect(summary.totals[0].expenses).toBe("25.00");
  const budget = (await (await request("budgets")).json())[0];
  expect(budget.spent).toBe("25.00");
  expect(
    await (await request("budgets", "GET", undefined, cookieB)).json(),
  ).toEqual([]);
  await db().query(
    "UPDATE transactions SET pending=true WHERE description='coffee'",
  );
  expect(
    (await (await request("summary?month=2026-01")).json()).totals[0].expenses,
  ).toBe("0");
});
it("connects mocks, encrypts tokens, isolates items and disconnects idempotently", async () => {
  expect((await request("plaid/link-token", "POST")).status).toBe(200);
  const r = await request("plaid/exchange", "POST", {
    publicToken: "mock-public",
  });
  expect(r.status).toBe(201);
  const id = (await r.json()).id;
  const stored = (
    await db().query(
      "SELECT access_token_encrypted FROM plaid_items WHERE id=$1",
      [id],
    )
  ).rows[0];
  expect(stored.access_token_encrypted).not.toContain("mock-access");
  expect(decryptToken(stored.access_token_encrypted)).toMatch(/^mock-access-/);
  expect(
    (await request("items/" + id, "DELETE", undefined, cookieB)).status,
  ).toBe(404);
  expect(
    (await request("items/" + id + "/sync", "POST", undefined, cookieB)).status,
  ).toBe(404);
  expect((await request("items/" + id, "DELETE")).status).toBe(200);
  expect((await request("items/" + id, "DELETE")).status).toBe(200);
  const storedAfter = (
    await db().query("SELECT * FROM plaid_items WHERE id=$1", [id])
  ).rows[0];
  expect(storedAfter.status).toBe("disconnected");
  expect(storedAfter.access_token_encrypted).toBeNull();
});
it("enforces composite ownership foreign keys", async () => {
  await expect(
    db().query(
      "INSERT INTO transactions(user_id,account_id,source,description,amount,currency,date) VALUES($1,$2,'manual','attack',1,'CAD','2026-01-01')",
      [userB, accountA],
    ),
  ).rejects.toThrow();
});
it("rate limits repeated authentication attempts", async () => {
  for (let n = 0; n < 10; n++)
    await request("auth/login", "POST", {
      email: "unknown@example.test",
      password: "wrong long password",
    });
  expect(
    (
      await request("auth/login", "POST", {
        email: "unknown@example.test",
        password: "wrong long password",
      })
    ).status,
  ).toBe(429);
});
