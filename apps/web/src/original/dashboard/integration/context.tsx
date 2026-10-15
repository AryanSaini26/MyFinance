"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { api, RequestError } from "@/lib/client-api";
export type Account = {
  id: string;
  item_id: string | null;
  name: string;
  type: string;
  currency: string;
  current_balance: string | null;
  active: boolean;
};
export type Category = { id: string; name: string };
export type Entry = {
  id: string;
  account_id: string;
  description: string;
  amount: string;
  currency: string;
  date: string;
  pending: boolean;
  source: string;
  category_id: string;
  predicted_category_id: string;
  category_override_id: string | null;
};
export type Item = {
  id: string;
  institution_name: string;
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
};
export type Budget = {
  id: string;
  category_id: string;
  month: string;
  currency: string;
  amount: string;
  spent: string;
};
export type Summary = {
  totals: {
    currency: string;
    income: string;
    expenses: string;
    count: number;
  }[];
  spending: { currency: string; category_id: string; amount: string }[];
};
export type Analytics = {
  months: { month: string; income: string; expenses: string; count: number }[];
  allTimeCount: number;
};
const empty = {
  accounts: [] as Account[],
  categories: [] as Category[],
  entries: [] as Entry[],
  items: [] as Item[],
  budgets: [] as Budget[],
  summary: { totals: [], spending: [] } as Summary,
  analytics: { months: [], allTimeCount: 0 } as Analytics,
};
function useWorkspaceState() {
  const router = useRouter(),
    version = useRef(0);
  const [user, setUser] = useState<{ email: string; name?: string } | null>(
      null,
    ),
    [ready, setReady] = useState(false),
    [mode, setMode] = useState("mock"),
    [data, setData] = useState(empty);
  const [month, setMonthValue] = useState(new Date().toISOString().slice(0, 7)),
    [currency, setCurrency] = useState("CAD"),
    [accountFilter, setAccountFilterValue] = useState(""),
    [categoryFilter, setCategoryFilterValue] = useState(""),
    [search, setSearchValue] = useState(""),
    [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    api<{ user: { email: string; name?: string }; mode: string }>("auth/me")
      .then((v) => {
        if (active) {
          setUser(v.user);
          setMode(v.mode);
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof RequestError && e.status === 401)
            router.replace("/signin");
          else setError(e.message);
        }
      })
      .finally(() => active && setReady(true));
    return () => {
      active = false;
      version.current++;
    };
  }, [router]);
  const refresh = useCallback(async () => {
    const generation = ++version.current;
    const end = new Date(month + "-01T00:00:00Z");
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    const query = new URLSearchParams({
      from: month + "-01",
      to: end.toISOString().slice(0, 10),
      limit: "50",
      offset: String(offset),
      currency,
    });
    if (accountFilter) query.set("accountId", accountFilter);
    if (categoryFilter) query.set("categoryId", categoryFilter);
    if (search) query.set("search", search);
    const [accounts, categories, entries, items, budgets, summary, analytics] =
      await Promise.all([
        api<Account[]>("accounts"),
        api<Category[]>("categories"),
        api<Entry[]>("transactions?" + query),
        api<Item[]>("items"),
        api<Budget[]>("budgets"),
        api<Summary>("summary?month=" + month),
        api<Analytics>("analytics?month=" + month + "&currency=" + currency),
      ]);
    if (generation === version.current)
      setData({
        accounts,
        categories,
        entries,
        items,
        budgets,
        summary,
        analytics,
      });
  }, [month, currency, accountFilter, categoryFilter, search, offset]);
  useEffect(() => {
    let active = true;
    if (user)
      refresh().catch((e) => {
        if (active) {
          setError(e.message);
          if (e instanceof RequestError && e.status === 401) {
            version.current++;
            setData(empty);
            setUser(null);
            router.replace("/signin");
          }
        }
      });
    return () => {
      active = false;
      version.current++;
    };
  }, [user, refresh, router]);
  async function action(fn: () => Promise<void>, message = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
      if (message) setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await api("auth/logout", "POST");
      version.current++;
      setData(empty);
      setUser(null);
      router.replace("/signin");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const resetPage = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setOffset(0);
  };
  return {
    ...data,
    user,
    ready,
    mode,
    setMode,
    month,
    setMonth: resetPage(setMonthValue),
    currency,
    setCurrency: resetPage(setCurrency),
    accountFilter,
    setAccountFilter: resetPage(setAccountFilterValue),
    categoryFilter,
    setCategoryFilter: resetPage(setCategoryFilterValue),
    search,
    setSearch: resetPage(setSearchValue),
    offset,
    setOffset,
    busy,
    error,
    setError,
    notice,
    action,
    logout,
    refresh,
    categoryName: (id: string) =>
      data.categories.find((c) => c.id === id)?.name ?? id,
  };
}
type Workspace = ReturnType<typeof useWorkspaceState>;
const Context = createContext<Workspace | null>(null);
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const value = useWorkspaceState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace provider is missing");
  return value;
}
export const formatMoney = (value: string | number, currency: string) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(
    Number(value),
  );
