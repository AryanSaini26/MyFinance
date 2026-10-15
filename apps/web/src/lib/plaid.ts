import { randomUUID } from "node:crypto";
import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from "plaid";
import { ApiError } from "./errors";
export type BankAccount = {
  account_id: string;
  name: string;
  mask: string | null;
  type: string;
  balances: { current: number | null; iso_currency_code: string | null };
};
export const mockMode = () => process.env.PLAID_MODE === "mock";
function client() {
  if (
    process.env.PLAID_ENV !== "sandbox" ||
    process.env.PLAID_MODE !== "sandbox"
  )
    throw new ApiError(
      503,
      "PLAID_UNAVAILABLE",
      "Configure Plaid Sandbox or use mock mode",
    );
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET)
    throw new ApiError(
      503,
      "PLAID_UNAVAILABLE",
      "Plaid Sandbox credentials are missing",
    );
  return new PlaidApi(
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
}
export async function linkToken(userId: string) {
  if (mockMode()) return { link_token: "mock-link", mode: "mock" };
  const r = await client().linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "MyFinance Sandbox",
    products: [Products.Transactions],
    country_codes: [CountryCode.Ca, CountryCode.Us],
    language: "en",
  });
  return { link_token: r.data.link_token, mode: "sandbox" };
}
export async function exchange(
  publicToken: string,
): Promise<{ accessToken: string; itemId: string }> {
  if (mockMode()) {
    if (publicToken !== "mock-public")
      throw new ApiError(400, "INVALID_TOKEN", "Invalid mock token");
    const id = randomUUID();
    return { accessToken: `mock-access-${id}`, itemId: `mock-item-${id}` };
  }
  const r = await client().itemPublicTokenExchange({
    public_token: publicToken,
  });
  return { accessToken: r.data.access_token, itemId: r.data.item_id };
}
export async function bankAccounts(
  accessToken: string,
): Promise<{ accounts: BankAccount[]; institution: string }> {
  if (mockMode())
    return {
      accounts: [
        {
          account_id: accessToken.replace("mock-access-", "mock-account-"),
          name: "Demo Checking",
          mask: "0000",
          type: "depository",
          balances: { current: 1200, iso_currency_code: "CAD" },
        },
      ],
      institution: "Simulated Sandbox Bank",
    };
  const r = await client().accountsGet({ access_token: accessToken });
  return {
    accounts: r.data.accounts,
    institution: "Plaid Sandbox institution",
  };
}
export async function removeItem(accessToken: string) {
  if (!mockMode()) await client().itemRemove({ access_token: accessToken });
}
