// Browser-only demonstration adapter. Never imported by the Next.js application.
import { parse } from "csv-parse/browser/esm/sync";
import { predict, type Model } from "../packages/classifier/classifier";
import model from "../packages/classifier/model.json";
import {
  entry,
  date,
  money,
  calendarMonth,
  currency,
  category,
} from "../apps/web/src/lib/validation";
const storageKey = "myfinance-browser-demo-v1";
const categories = Object.entries({
  dining: "Food & Dining",
  groceries: "Groceries",
  shopping: "Shopping",
  transport: "Transportation",
  utilities: "Utilities",
  entertainment: "Entertainment",
  health: "Health & Fitness",
  travel: "Travel",
  income: "Income",
  transfer: "Transfer",
  other: "Other",
}).map(([id, name]) => ({ id, name }));
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const month = () => now().slice(0, 7);
const cents = (value: string) => Math.round(Number(value) * 100);
const decimal = (value: number) => (value / 100).toFixed(2);
const predictCategory = (description: string) =>
  predict(model as Model, description).category;
type Account = {
  id: string;
  item_id: string | null;
  name: string;
  type: string;
  currency: string;
  current_balance: string | null;
  active: boolean;
};
type Item = {
  id: string;
  institution_name: string;
  status: string;
  last_synced_at: string | null;
  last_error: null;
  cursor: string;
};
type Entry = {
  id: string;
  account_id: string;
  item_id?: string;
  description: string;
  amount: string;
  currency: string;
  date: string;
  pending: boolean;
  source: string;
  predicted_category_id: string;
  category_override_id: string | null;
  import_key?: string;
};
type Budget = {
  id: string;
  category_id: string;
  month: string;
  currency: string;
  amount: string;
};
type State = {
  user: { email: string } | null;
  accounts: Account[];
  items: Item[];
  entries: Entry[];
  budgets: Budget[];
};
function seed(): State {
  const manual = id(),
    itemId = id(),
    bank = id();
  const samples: [string, string, string][] = [
    ["Salary payroll", "4200.00", "income"],
    ["Fresh grocery produce", "-86.40", "groceries"],
    ["Coffee cafe", "-5.25", "dining"],
    ["Bus transit pass", "-120.00", "transport"],
    ["Electric utility bill", "-74.50", "utilities"],
    ["Restaurant lunch", "-24.75", "dining"],
    ["Movie cinema tickets", "-32.00", "entertainment"],
    ["Clothing online store", "-68.90", "shopping"],
    ["Supermarket groceries", "-54.30", "groceries"],
    ["Coffee bakery", "-8.40", "dining"],
    ["Fitness gym", "-45.00", "health"],
    ["Internet utility", "-65.00", "utilities"],
  ];
  return {
    user: { email: "demo@example.test" },
    accounts: [
      {
        id: manual,
        item_id: null,
        name: "Cash / CSV",
        type: "manual",
        currency: "CAD",
        current_balance: null,
        active: true,
      },
      {
        id: bank,
        item_id: itemId,
        name: "Demo Checking",
        type: "depository",
        currency: "CAD",
        current_balance: "3615.50",
        active: true,
      },
    ],
    items: [
      {
        id: itemId,
        institution_name: "Simulated Sandbox Bank",
        status: "active",
        last_synced_at: now(),
        last_error: null,
        cursor: "demo-initial",
      },
    ],
    entries: samples.map(([description, amount, categoryId], i) => ({
      id: id(),
      account_id: bank,
      item_id: itemId,
      description,
      amount,
      currency: "CAD",
      date:
        month() +
        "-" +
        String(Math.max(1, Math.min(new Date().getUTCDate(), i + 1))).padStart(
          2,
          "0",
        ),
      pending: false,
      source: "plaid",
      predicted_category_id: categoryId,
      category_override_id: null,
      import_key: `seed:${i}`,
    })),
    budgets: [
      {
        id: id(),
        category_id: "groceries",
        month: month(),
        currency: "CAD",
        amount: "300.00",
      },
      {
        id: id(),
        category_id: "dining",
        month: month(),
        currency: "CAD",
        amount: "150.00",
      },
    ],
  };
}
function load(): State {
  try {
    const data = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    if (data?.accounts && data?.entries) return data;
  } catch {}
  return seed();
}
let state = load();
const save = () => sessionStorage.setItem(storageKey, JSON.stringify(state));
const effective = (t: Entry) =>
  t.category_override_id ?? t.predicted_category_id;
function requiredAccount(accountId: string) {
  const account = state.accounts.find(
    (a) => a.id === accountId && a.active && !a.item_id,
  );
  if (!account) throw new Error("Choose an active manual account");
  return account;
}
function checkCategory(value: string) {
  category.parse(value);
  if (!categories.some((c) => c.id === value))
    throw new Error("Unknown category");
}
function summary(selected: string) {
  calendarMonth.parse(selected);
  const posted = state.entries.filter(
    (t) =>
      t.date.startsWith(selected) && !t.pending && effective(t) !== "transfer",
  );
  const totals = [...new Set(posted.map((t) => t.currency))].map((code) => {
    const rows = posted.filter((t) => t.currency === code);
    return {
      currency: code,
      income: decimal(
        rows.reduce((sum, t) => sum + Math.max(0, cents(t.amount)), 0),
      ),
      expenses: decimal(
        rows.reduce((sum, t) => sum - Math.min(0, cents(t.amount)), 0),
      ),
      count: rows.length,
    };
  });
  const spending = totals.flatMap((total) =>
    categories
      .map((c) => ({
        currency: total.currency,
        category_id: c.id,
        amount: decimal(
          posted
            .filter(
              (t) =>
                t.currency === total.currency &&
                effective(t) === c.id &&
                cents(t.amount) < 0,
            )
            .reduce((sum, t) => sum - cents(t.amount), 0),
        ),
      }))
      .filter((s) => cents(s.amount) > 0),
  );
  return { totals, spending };
}
function run(url: URL, method: string, body: any): unknown {
  const path = url.pathname.slice(5);
  if (path === "auth/me") {
    if (!state.user) throw new Error("Please sign in");
    return { user: state.user, mode: "mock" };
  }
  if (["auth/login", "auth/register"].includes(path)) {
    if (
      !body.email?.includes("@") ||
      typeof body.password !== "string" ||
      body.password.length < 12
    )
      throw new Error(
        "Use a sample email and password of at least 12 characters",
      );
    // This demonstrates the form only. Passwords are never stored; real authentication is on the Node backend.
    state.user = { email: body.email };
    return { user: state.user, mode: "mock" };
  }
  if (!state.user) throw new Error("Please sign in");
  if (path === "auth/logout") {
    state.user = null;
    return { ok: true };
  }
  if (path === "categories") return categories;
  if (path === "accounts" && method === "GET") return state.accounts;
  if (path === "accounts" && method === "POST") {
    currency.parse(body.currency);
    if (!body.name?.trim()) throw new Error("Account name is required");
    const account: Account = {
      id: id(),
      item_id: null,
      name: body.name.trim(),
      type: "manual",
      currency: body.currency,
      current_balance: null,
      active: true,
    };
    state.accounts.push(account);
    return account;
  }
  if (path === "items") return state.items;
  if (path === "plaid/link-token")
    return { link_token: "demo-link", mode: "mock" };
  if (path === "plaid/exchange") {
    const itemId = id();
    state.items.push({
      id: itemId,
      institution_name: "Simulated Sandbox Bank",
      status: "active",
      last_synced_at: null,
      last_error: null,
      cursor: "",
    });
    state.accounts.push({
      id: id(),
      item_id: itemId,
      name: "Demo Checking",
      type: "depository",
      currency: "CAD",
      current_balance: "1200.00",
      active: true,
    });
    return { id: itemId };
  }
  if (path.startsWith("items/")) {
    const itemId = path.split("/")[1],
      item = state.items.find((i) => i.id === itemId);
    if (!item) throw new Error("Institution not found");
    if (method === "DELETE") {
      item.status = "disconnected";
      state.accounts
        .filter((a) => a.item_id === itemId)
        .forEach((a) => {
          a.active = false;
        });
      return { ok: true };
    }
    if (path.endsWith("/sync")) {
      if (item.status !== "active")
        throw new Error("Institution is disconnected");
      const account = state.accounts.find((a) => a.item_id === itemId)!;
      let added = 0;
      for (const [index, [description, amount]] of [
        ["coffee cafe", "-5.25"],
        ["salary payroll", "2000.00"],
      ].entries()) {
        const key = `sync:${itemId}:${index}`;
        if (!state.entries.some((t) => t.import_key === key)) {
          state.entries.push({
            id: id(),
            account_id: account.id,
            item_id: itemId,
            description,
            amount,
            currency: account.currency,
            date: now().slice(0, 10),
            pending: false,
            source: "plaid",
            predicted_category_id: predictCategory(description),
            category_override_id: null,
            import_key: key,
          });
          added++;
        }
      }
      item.cursor = "demo-cursor-1";
      item.last_synced_at = now();
      return { added, modified: 0, removed: 0, pages: 1 };
    }
  }
  if (path === "transactions" && method === "GET") {
    const query = url.searchParams;
    return state.entries
      .filter(
        (t) =>
          (!query.get("accountId") ||
            t.account_id === query.get("accountId")) &&
          (!query.get("categoryId") ||
            effective(t) === query.get("categoryId")) &&
          (!query.get("from") || t.date >= query.get("from")!) &&
          (!query.get("to") || t.date <= query.get("to")!),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(
        Number(query.get("offset") ?? 0),
        Number(query.get("offset") ?? 0) + Number(query.get("limit") ?? 50),
      )
      .map((t) => ({ ...t, category_id: effective(t) }));
  }
  if (path === "transactions" && method === "POST") {
    const input = entry.parse(body),
      account = requiredAccount(input.accountId);
    if (
      input.idempotencyKey &&
      state.entries.some(
        (t) => t.import_key === "manual:" + input.idempotencyKey,
      )
    )
      throw new Error("Duplicate transaction request");
    const row: Entry = {
      id: id(),
      account_id: account.id,
      description: input.description,
      amount: decimal(cents(input.amount)),
      currency: account.currency,
      date: input.date,
      source: "manual",
      pending: false,
      predicted_category_id: predictCategory(input.description),
      category_override_id: input.categoryId ?? null,
      import_key: input.idempotencyKey
        ? "manual:" + input.idempotencyKey
        : undefined,
    };
    state.entries.push(row);
    return { id: row.id };
  }
  if (path.startsWith("transactions/") && method === "PATCH") {
    const row = state.entries.find((t) => t.id === path.split("/")[1]);
    if (!row) throw new Error("Transaction not found");
    if (body.categoryId !== null) checkCategory(body.categoryId);
    row.category_override_id = body.categoryId;
    return { ok: true };
  }
  if (path === "analytics") {
    const selected = url.searchParams.get("month") ?? month(),
      code = url.searchParams.get("currency") ?? "CAD";
    calendarMonth.parse(selected);
    currency.parse(code);
    const months = Array.from({ length: 6 }, (_, index) => {
      const d = new Date(selected + "-01T00:00:00Z");
      d.setUTCMonth(d.getUTCMonth() - 5 + index);
      const key = d.toISOString().slice(0, 7),
        value = summary(key).totals.find((t) => t.currency === code);
      return {
        month: key,
        income: value?.income ?? "0",
        expenses: value?.expenses ?? "0",
        count: value?.count ?? 0,
      };
    });
    return {
      months,
      allTimeCount: state.entries.filter((t) => t.currency === code).length,
    };
  }
  if (path === "summary")
    return summary(url.searchParams.get("month") ?? month());
  if (path === "budgets" && method === "GET")
    return state.budgets.map((b) => ({
      ...b,
      spent:
        summary(b.month).spending.find(
          (s) => s.currency === b.currency && s.category_id === b.category_id,
        )?.amount ?? "0.00",
    }));
  if (path === "budgets" && method === "POST") {
    calendarMonth.parse(body.month);
    currency.parse(body.currency);
    money.parse(body.amount);
    checkCategory(body.categoryId);
    if (
      cents(body.amount) <= 0 ||
      ["income", "transfer"].includes(body.categoryId)
    )
      throw new Error("Use a positive amount and a spending category");
    let budget = state.budgets.find(
      (b) =>
        b.month === body.month &&
        b.category_id === body.categoryId &&
        b.currency === body.currency,
    );
    if (budget) budget.amount = decimal(cents(body.amount));
    else {
      budget = {
        id: id(),
        category_id: body.categoryId,
        month: body.month,
        currency: body.currency,
        amount: decimal(cents(body.amount)),
      };
      state.budgets.push(budget);
    }
    return { id: budget.id };
  }
  if (path === "imports/csv") {
    const account = requiredAccount(body.accountId);
    if (
      typeof body.csv !== "string" ||
      new TextEncoder().encode(body.csv).length > 1_000_000
    )
      throw new Error("CSV must be at most 1 MB");
    let headers: string[] = [];
    const rows = parse(body.csv, {
      bom: true,
      skip_empty_lines: true,
      columns: (values: string[]) => {
        headers = values;
        return values;
      },
    });
    if (
      headers.join(",") !== "date,description,amount,external_id" ||
      !rows.length ||
      rows.length > 1000
    )
      throw new Error("Use the documented CSV headers and 1–1000 rows");
    const next = [...state.entries];
    let inserted = 0;
    for (const row of rows) {
      date.parse(row.date);
      money.parse(row.amount);
      if (
        !row.description?.trim() ||
        row.description.length > 300 ||
        !row.external_id?.trim()
      )
        throw new Error("Invalid CSV row");
      const key = `csv:${account.id}:${row.external_id}`,
        old = next.find((t) => t.import_key === key);
      if (old) {
        if (
          old.description !== row.description ||
          old.date !== row.date ||
          cents(old.amount) !== cents(row.amount)
        )
          throw new Error("An external ID was reused with different data");
        continue;
      }
      next.push({
        id: id(),
        account_id: account.id,
        description: row.description,
        amount: decimal(cents(row.amount)),
        currency: account.currency,
        date: row.date,
        pending: false,
        source: "csv",
        predicted_category_id: predictCategory(row.description),
        category_override_id: null,
        import_key: key,
      });
      inserted++;
    }
    state.entries = next;
    return { inserted, duplicates: rows.length - inserted };
  }
  throw new Error("This operation is unavailable in the browser demo");
}
export function installDemo() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      location.href,
    );
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
      return nativeFetch(input, init);
    try {
      const result = run(
        url,
        init?.method ?? "GET",
        init?.body ? JSON.parse(String(init.body)) : undefined,
      );
      save();
      return Response.json(result);
    } catch (error) {
      const message =
        error instanceof Error && !error.message.startsWith("[")
          ? error.message
          : "Invalid input; check the form values";
      return Response.json(
        { error: { message } },
        { status: message === "Please sign in" ? 401 : 400 },
      );
    }
  };
}
export function resetDemo() {
  state = seed();
  save();
  location.reload();
}
