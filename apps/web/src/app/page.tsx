"use client";
import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
type Account = {
  type: string;
  id: string;
  item_id: string | null;
  name: string;
  currency: string;
  current_balance: string | null;
  active: boolean;
};
type Category = { id: string; name: string };
type Entry = {
  id: string;
  description: string;
  amount: string;
  currency: string;
  date: string;
  category_id: string;
  predicted_category_id: string;
  category_override_id: string | null;
  pending: boolean;
  source: string;
};
type Item = {
  id: string;
  institution_name: string;
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
};
type Budget = {
  id: string;
  category_id: string;
  month: string;
  currency: string;
  amount: string;
  spent: string;
};
type Summary = {
  totals: {
    currency: string;
    income: string;
    expenses: string;
    count: number;
  }[];
  spending: { currency: string; category_id: string; amount: string }[];
};
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api/" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Request failed");
  return data;
}
const money = (v: string | number, currency: string) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(
    Number(v),
  );
function PlaidButton({
  token,
  onSuccess,
  onError,
}: {
  token: string;
  onSuccess: (token: string) => void;
  onError: (message: string) => void;
}) {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess: (publicToken) => onSuccess(publicToken),
    onExit: (error) => {
      if (error) onError(error.display_message ?? "Bank connection closed");
    },
  });
  return (
    <button disabled={!ready} onClick={() => open()}>
      Open Plaid Sandbox Link
    </button>
  );
}
export default function Page() {
  const [user, setUser] = useState<{ email: string } | null>(null),
    [ready, setReady] = useState(false),
    [register, setRegister] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState("mock");
  const [accounts, setAccounts] = useState<Account[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [entries, setEntries] = useState<Entry[]>([]),
    [items, setItems] = useState<Item[]>([]),
    [budgets, setBudgets] = useState<Budget[]>([]);
  const [summary, setSummary] = useState<Summary>({ totals: [], spending: [] }),
    [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [accountFilter, setAccountFilter] = useState(""),
    [categoryFilter, setCategoryFilter] = useState(""),
    [offset, setOffset] = useState(0),
    [link, setLink] = useState("");
  const [entryKey, setEntryKey] = useState("");
  const refresh = useCallback(async () => {
    const query = new URLSearchParams({
      from: month + "-01",
      to: new Date(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
      )
        .toISOString()
        .slice(0, 10),
      limit: "50",
      offset: String(offset),
    });
    if (accountFilter) query.set("accountId", accountFilter);
    if (categoryFilter) query.set("categoryId", categoryFilter);
    const [a, c, t, i, b, s] = await Promise.all([
      api<Account[]>("accounts"),
      api<Category[]>("categories"),
      api<Entry[]>("transactions?" + query),
      api<Item[]>("items"),
      api<Budget[]>("budgets"),
      api<Summary>("summary?month=" + month),
    ]);
    setAccounts(a);
    setCategories(c);
    setEntries(t);
    setItems(i);
    setBudgets(b);
    setSummary(s);
  }, [month, accountFilter, categoryFilter, offset]);
  useEffect(() => {
    api<{ user: { email: string }; mode: string }>("auth/me")
      .then((v) => {
        setUser(v.user);
        setMode(v.mode);
      })
      .catch(() => {})
      .finally(() => setReady(true));
    setEntryKey(crypto.randomUUID());
  }, []);
  useEffect(() => {
    if (user) refresh().catch((e) => setError(e.message));
  }, [user, refresh]);
  async function action(fn: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connect(publicToken: string) {
    await action(async () => {
      await api("plaid/exchange", "POST", { publicToken });
      setLink("");
      setNotice("Institution connected. Choose Sync to retrieve transactions.");
      await refresh();
    });
  }
  const categoryName = (id: string) =>
    categories.find((c) => c.id === id)?.name ?? id;
  if (!ready)
    return (
      <main>
        <p>Loading MyFinance…</p>
      </main>
    );
  if (!user)
    return (
      <main className="auth">
        <div className="brand">
          M<span>F</span>
        </div>
        <p className="eyebrow">MYFINANCE / V2</p>
        <h1>
          Your money,
          <br />
          in perspective.
        </h1>
        <p className="muted">
          A personal finance workspace. Simulated accounts only.
        </p>
        <section>
          <h2>{register ? "Create your account" : "Welcome back"}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              action(async () => {
                const v = await api<{ user: { email: string }; mode: string }>(
                  "auth/" + (register ? "register" : "login"),
                  "POST",
                  { email: form.get("email"), password: form.get("password") },
                );
                setUser(v.user);
                setMode(v.mode);
              });
            }}
          >
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <small>Use 12–128 characters.</small>
            <button disabled={busy}>
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
            </button>
          </form>
          <button
            className="text"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register
              ? "Already registered? Sign in"
              : "New here? Create an account"}
          </button>
        </section>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </main>
    );
  return (
    <main>
      <header>
        <div>
          <div className="brand small">
            M<span>F</span>
          </div>
          <span className="eyebrow">MYFINANCE / V2</span>
        </div>
        <div>
          <span className="pill">
            {mode === "mock" ? "SIMULATED DATA" : "PLAID SANDBOX"}
          </span>
          <button
            className="text"
            disabled={busy}
            onClick={() =>
              action(async () => {
                await api("auth/logout", "POST");
                setRegister(false);
                setUser(null);
              })
            }
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="heading">
        <div>
          <p className="eyebrow">YOUR FINANCIAL OVERVIEW</p>
          <h1>Make sense of your spending.</h1>
          <p className="muted">
            {user.email} · Income is positive. Expenses are negative.
          </p>
        </div>
        <label>
          Reporting month
          <input
            aria-label="Reporting month"
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) {
                setMonth(e.target.value);
                setOffset(0);
              }
            }}
          />
        </label>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="notice">
          {notice}
        </div>
      )}
      <div className="cards">
        {summary.totals.length ? (
          summary.totals.map((t) => (
            <section key={t.currency}>
              <p className="eyebrow">{t.currency} · THIS MONTH</p>
              <div className="stat">
                {money(Number(t.income) - Number(t.expenses), t.currency)}
              </div>
              <p className="muted">Net cash flow · {t.count} posted entries</p>
              <div className="split">
                <span>
                  Income <strong>{money(t.income, t.currency)}</strong>
                </span>
                <span>
                  Expenses <strong>{money(t.expenses, t.currency)}</strong>
                </span>
              </div>
            </section>
          ))
        ) : (
          <section>
            <p className="eyebrow">GETTING STARTED</p>
            <h2>Your overview starts here</h2>
            <p className="muted">
              Connect a simulated institution and sync, or add a manual
              transaction below.
            </p>
          </section>
        )}
      </div>
      <div className="grid">
        <section>
          <div className="section-heading">
            <h2>Accounts & connections</h2>
            <button
              disabled={busy}
              onClick={() =>
                action(async () => {
                  const result = await api<{
                    link_token: string;
                    mode: string;
                  }>("plaid/link-token", "POST");
                  setMode(result.mode);
                  if (result.mode === "mock") {
                    await api("plaid/exchange", "POST", {
                      publicToken: "mock-public",
                    });
                    setNotice(
                      "Simulated institution connected. Choose Sync to fetch demo transactions.",
                    );
                    await refresh();
                  } else setLink(result.link_token);
                })
              }
            >
              Connect institution
            </button>
          </div>
          {link && (
            <PlaidButton token={link} onSuccess={connect} onError={setError} />
          )}
          {items.map((i) => (
            <div className="connection" key={i.id}>
              <div>
                <strong>{i.institution_name}</strong>
                <p className="muted">
                  {i.status} ·{" "}
                  {i.last_synced_at
                    ? "Synced " + new Date(i.last_synced_at).toLocaleString()
                    : "Not synchronized yet"}
                  {i.last_error ? " · Last synchronization failed" : ""}
                </p>
              </div>
              <div>
                <button
                  disabled={busy || i.status !== "active"}
                  onClick={() =>
                    action(async () => {
                      await api("items/" + i.id + "/sync", "POST");
                      setNotice("Synchronization complete.");
                      await refresh();
                    })
                  }
                >
                  Sync
                </button>{" "}
                <button
                  className="secondary"
                  disabled={busy || i.status === "disconnected"}
                  onClick={() =>
                    action(async () => {
                      await api("items/" + i.id, "DELETE");
                      await refresh();
                    })
                  }
                >
                  {i.status === "disconnecting"
                    ? "Retry disconnect"
                    : "Disconnect"}
                </button>
              </div>
            </div>
          ))}
          <ul className="account-list">
            {accounts.map((a) => (
              <li key={a.id}>
                <span>
                  {a.name}
                  {!a.active ? " (disconnected)" : ""}
                  <small>
                    {a.type} · {a.currency}
                  </small>
                </span>
                <strong>
                  {a.current_balance !== null
                    ? money(a.current_balance, a.currency)
                    : "Manual account"}
                </strong>
              </li>
            ))}
          </ul>
          <details>
            <summary>Add a manual account</summary>
            <form
              className="inline"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                action(async () => {
                  await api("accounts", "POST", {
                    name: data.get("name"),
                    currency: data.get("currency"),
                  });
                  await refresh();
                });
              }}
            >
              <label>
                Name
                <input name="name" required maxLength={100} />
              </label>
              <label>
                Currency
                <select name="currency">
                  <option>CAD</option>
                  <option>USD</option>
                </select>
              </label>
              <button disabled={busy}>Add account</button>
            </form>
          </details>
        </section>
        <section>
          <h2>Where it went</h2>
          <p className="muted">
            Posted expenses by category. Transfers excluded; currencies kept
            separate.
          </p>
          {summary.spending.length ? (
            summary.spending.map((s) => (
              <div className="spending" key={s.currency + s.category_id}>
                <div>
                  <span>{categoryName(s.category_id)}</span>
                  <strong>{money(s.amount, s.currency)}</strong>
                </div>
                <meter
                  min={0}
                  max={
                    Number(
                      summary.totals.find((t) => t.currency === s.currency)
                        ?.expenses,
                    ) || 1
                  }
                  value={Number(s.amount)}
                />
              </div>
            ))
          ) : (
            <p>No spending this month.</p>
          )}
        </section>
      </div>
      <section>
        <div className="section-heading">
          <h2>Transactions</h2>
          <span className="muted">Predictions can be changed below</span>
        </div>
        <div className="filters">
          <label>
            Account
            <select
              value={accountFilter}
              onChange={(e) => {
                setAccountFilter(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>
                    <strong>{t.description}</strong>
                    <small>
                      {t.source}
                      {t.pending ? " · pending" : ""}
                      {t.category_override_id
                        ? " · manual category"
                        : " · predicted"}
                    </small>
                  </td>
                  <td>
                    <select
                      aria-label={"Category for " + t.description}
                      value={t.category_override_id ?? ""}
                      disabled={busy}
                      onChange={(e) => {
                        const categoryId = e.target.value || null;
                        action(async () => {
                          await api("transactions/" + t.id, "PATCH", {
                            categoryId,
                          });
                          await refresh();
                        });
                      }}
                    >
                      <option value="">
                        Auto: {categoryName(t.predicted_category_id)}
                      </option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={Number(t.amount) >= 0 ? "positive" : ""}>
                    {money(t.amount, t.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!entries.length && (
            <p className="empty">No transactions match these filters.</p>
          )}
        </div>
        <div className="pagination">
          <button
            className="secondary"
            disabled={busy || offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Previous
          </button>
          <span>Page {offset / 50 + 1}</span>
          <button
            className="secondary"
            disabled={busy || entries.length < 50}
            onClick={() => setOffset(offset + 50)}
          >
            Next
          </button>
        </div>
      </section>
      <div className="grid">
        <section aria-label="Add a transaction">
          <h2>Add a transaction</h2>
          <p className="muted">
            Use a negative amount for expenses, positive for income.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const d = new FormData(form);
              action(async () => {
                await api("transactions", "POST", {
                  accountId: d.get("accountId"),
                  description: d.get("description"),
                  amount: d.get("amount"),
                  date: d.get("date"),
                  idempotencyKey: entryKey,
                });
                setEntryKey(crypto.randomUUID());
                form.reset();
                await refresh();
                setNotice("Transaction added.");
              });
            }}
          >
            <label>
              Manual account
              <select name="accountId" required>
                {accounts
                  .filter((a) => !a.item_id && a.active)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Description
              <input name="description" required maxLength={300} />
            </label>
            <div className="split">
              <label>
                Amount
                <input
                  name="amount"
                  inputMode="decimal"
                  placeholder="-12.50"
                  required
                  pattern="-?[0-9]+(\.[0-9]{1,2})?"
                />
              </label>
              <label>
                Date
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </label>
            </div>
            <button disabled={busy}>Save transaction</button>
          </form>
          <details>
            <summary>Import a CSV</summary>
            <p className="muted">
              Required headers: date,description,amount,external_id. ISO dates,
              signed amounts, one currency per account. Maximum 1 MB / 1,000
              rows. External IDs must be stable and unique within the account.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                action(async () => {
                  const f = d.get("csv") as File;
                  if (f.size > 1_000_000)
                    throw new Error("CSV must be at most 1 MB");
                  const result = await api<{
                    inserted: number;
                    duplicates: number;
                  }>("imports/csv", "POST", {
                    accountId: d.get("accountId"),
                    csv: await f.text(),
                  });
                  setNotice(
                    `Imported ${result.inserted}; skipped ${result.duplicates} duplicates.`,
                  );
                  await refresh();
                });
              }}
            >
              <label>
                Account
                <select name="accountId">
                  {accounts
                    .filter((a) => !a.item_id && a.active)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                CSV file
                <input name="csv" type="file" accept=".csv,text/csv" required />
              </label>
              <button disabled={busy}>Import</button>
            </form>
          </details>
        </section>
        <section aria-label="Budgets">
          <h2>Budgets</h2>
          <p className="muted">
            Track monthly spending by category and currency.
          </p>
          {budgets
            .filter((b) => b.month === month)
            .map((b) => (
              <div className="budget" key={b.id}>
                <div>
                  <strong>{categoryName(b.category_id)}</strong>
                  <span>
                    {money(b.spent, b.currency)} / {money(b.amount, b.currency)}
                  </span>
                </div>
                <progress max={Number(b.amount)} value={Number(b.spent)} />
                {Number(b.spent) > Number(b.amount) && (
                  <small className="error">
                    Over budget by{" "}
                    {money(Number(b.spent) - Number(b.amount), b.currency)}
                  </small>
                )}
              </div>
            ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              action(async () => {
                await api("budgets", "POST", {
                  categoryId: d.get("categoryId"),
                  amount: d.get("amount"),
                  month,
                  currency: d.get("currency"),
                });
                await refresh();
                setNotice("Budget saved.");
              });
            }}
          >
            <label>
              Category
              <select name="categoryId">
                {categories
                  .filter((c) => !["income", "transfer"].includes(c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="split">
              <label>
                Monthly amount
                <input
                  name="amount"
                  inputMode="decimal"
                  placeholder="250.00"
                  required
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                />
              </label>
              <label>
                Currency
                <select name="currency">
                  <option>CAD</option>
                  <option>USD</option>
                </select>
              </label>
            </div>
            <button disabled={busy}>Save budget for {month}</button>
          </form>
        </section>
      </div>
      <footer>
        MyFinance v2 · A learning application ·{" "}
        {mode === "mock" ? "Local simulated data" : "Plaid Sandbox"} · No real
        financial accounts
      </footer>
    </main>
  );
}
