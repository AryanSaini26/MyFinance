import { beforeEach, it, expect, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  config: vi.fn(),
  link: vi.fn(),
  exchange: vi.fn(),
  accounts: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("plaid", () => ({
  Configuration: class {
    constructor(c: unknown) {
      sdk.config(c);
    }
  },
  PlaidEnvironments: { sandbox: "https://sandbox.plaid.com" },
  Products: { Transactions: "transactions" },
  CountryCode: { Ca: "CA", Us: "US" },
  PlaidApi: class {
    linkTokenCreate = sdk.link;
    itemPublicTokenExchange = sdk.exchange;
    accountsGet = sdk.accounts;
    itemRemove = sdk.remove;
  },
}));
import {
  linkToken,
  exchange,
  bankAccounts,
  removeItem,
} from "../apps/web/src/lib/plaid";
beforeEach(() => {
  vi.clearAllMocks();
  process.env.PLAID_MODE = "sandbox";
  process.env.PLAID_ENV = "sandbox";
  process.env.PLAID_CLIENT_ID = "test-client";
  process.env.PLAID_SECRET = "test-sandbox-secret";
});
it("uses only Sandbox and creates a user-scoped Transactions Link token", async () => {
  sdk.link.mockResolvedValue({ data: { link_token: "public-link" } });
  expect(await linkToken("user-id")).toEqual({
    link_token: "public-link",
    mode: "sandbox",
  });
  expect(sdk.config).toHaveBeenCalledWith(
    expect.objectContaining({ basePath: "https://sandbox.plaid.com" }),
  );
  expect(sdk.link).toHaveBeenCalledWith(
    expect.objectContaining({
      user: { client_user_id: "user-id" },
      products: ["transactions"],
    }),
  );
});
it("exchanges public tokens server-side and retrieves account metadata", async () => {
  sdk.exchange.mockResolvedValue({
    data: { access_token: "private-access", item_id: "item-id" },
  });
  expect(await exchange("public")).toEqual({
    accessToken: "private-access",
    itemId: "item-id",
  });
  expect(sdk.exchange).toHaveBeenCalledWith({ public_token: "public" });
  sdk.accounts.mockResolvedValue({ data: { accounts: [] } });
  await bankAccounts("private-access");
  expect(sdk.accounts).toHaveBeenCalledWith({ access_token: "private-access" });
  sdk.remove.mockResolvedValue({ data: { removed: true } });
  await removeItem("private-access");
  expect(sdk.remove).toHaveBeenCalledWith({ access_token: "private-access" });
});
it("rejects production mode and missing credentials before network calls", async () => {
  process.env.PLAID_ENV = "production";
  await expect(linkToken("u")).rejects.toThrow();
  expect(sdk.link).not.toHaveBeenCalled();
  process.env.PLAID_ENV = "sandbox";
  delete process.env.PLAID_SECRET;
  await expect(exchange("public")).rejects.toThrow();
  expect(sdk.exchange).not.toHaveBeenCalled();
});
it("returns a safe upstream error without SDK credentials or token payloads", async () => {
  sdk.link.mockRejectedValueOnce({
    isAxiosError: true,
    message: "private-token-and-secret",
    config: { headers: { "PLAID-SECRET": "private-token-and-secret" } },
  });
  await expect(linkToken("u")).rejects.toMatchObject({
    status: 502,
    code: "PLAID_REQUEST_FAILED",
    message: "Plaid Sandbox request failed; check configuration and retry",
  });
});
