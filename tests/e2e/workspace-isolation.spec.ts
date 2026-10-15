import { test, expect, type Page } from "@playwright/test";
const origin = "http://localhost:3000";
async function register(page: Page) {
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(`isolation-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("a strong browser password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Make sense of your spending." }),
  ).toBeVisible();
}
async function add(page: Page, description: string, categoryId: string) {
  const accounts = await (await page.request.get("/api/accounts")).json();
  const response = await page.request.post("/api/transactions", {
    headers: { Origin: origin },
    data: {
      accountId: accounts[0].id,
      description,
      categoryId,
      amount: "-7.50",
      date: new Date().toISOString().slice(0, 10),
    },
  });
  expect(response.status()).toBe(201);
}
test("logout clears cached financial data before another user's slow initial load", async ({
  page,
}) => {
  await page.goto("/");
  await register(page);
  await add(page, "private first-user entry", "dining");
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "private first-user entry", exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    /\/api\/(accounts|categories|transactions|items|budgets|summary)(\?|$)/,
    async (route) => {
      await held;
      await route.continue();
    },
  );
  try {
    await register(page);
    await expect(
      page.getByRole("cell", {
        name: "private first-user entry",
        exact: false,
      }),
    ).toHaveCount(0);
  } finally {
    release();
  }
  await expect(
    page.getByText("No transactions match these filters."),
  ).toBeVisible();
});
test("an older filter response cannot overwrite the currently selected category", async ({
  page,
}) => {
  await page.goto("/");
  await register(page);
  await add(page, "slow dining entry", "dining");
  await add(page, "latest groceries entry", "groceries");
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "slow dining entry", exact: false }),
  ).toBeVisible();
  let release!: () => void, captured!: () => void, fulfilled!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const received = new Promise<void>((resolve) => {
    captured = resolve;
  });
  const sent = new Promise<void>((resolve) => {
    fulfilled = resolve;
  });
  await page.route(
    /\/api\/transactions\?.*categoryId=dining/,
    async (route) => {
      const response = await route.fetch();
      captured();
      await held;
      await route.fulfill({ response });
      fulfilled();
    },
  );
  const filter = page
    .locator(".filters")
    .getByRole("combobox", { name: "Category", exact: true });
  try {
    await filter.selectOption("dining");
    await received;
    await filter.selectOption("groceries");
    await expect(
      page.getByRole("cell", { name: "slow dining entry", exact: false }),
    ).toHaveCount(0);
    const slowResponse = page.waitForResponse((response) =>
      response.url().includes("categoryId=dining"),
    );
    release();
    await sent;
    await (await slowResponse).finished();
    // Let the browser consume the old response and flush React before inspecting the result.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(filter).toHaveValue("groceries");
    await expect(
      page.getByRole("cell", { name: "latest groceries entry", exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "slow dining entry", exact: false }),
    ).toHaveCount(0);
  } finally {
    release();
  }
});
