import { test, expect, type Page } from "@playwright/test";
const origin = "http://localhost:3000";
async function register(page: Page) {
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Sign up", exact: true })
    .click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(
    page.getByText("Or, register with your email", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Email", { exact: true })
    .fill(`isolation-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("a strong browser password");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(
    page.getByText("Overall Transactions", { exact: true }),
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
  await page.goto("/signin");
  await register(page);
  await add(page, "private first-user entry", "dining");
  await page.goto("/dashboard/transactions");
  await expect(
    page.getByRole("cell", { name: "private first-user entry", exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "User menu", exact: true }).click();
  await page.getByRole("link", { name: "Log Out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    /\/api\/(accounts|categories|transactions|items|budgets|summary|analytics)(\?|$)/,
    async (route) => {
      await held;
      await route.continue();
    },
  );
  try {
    await register(page);
    await page.getByRole("link", { name: "Transactions", exact: true }).click();
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
  await page.goto("/signin");
  await register(page);
  await add(page, "slow dining entry", "dining");
  await add(page, "latest groceries entry", "groceries");
  await page.goto("/dashboard/transactions");
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
    .getByRole("combobox", { name: "Category filter", exact: true });
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
