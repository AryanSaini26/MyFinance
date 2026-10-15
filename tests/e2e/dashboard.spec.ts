import { test, expect } from "@playwright/test";
test("register, connect, sync twice, override, budget, import, filter and logout", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(`browser-${Date.now()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("a strong browser password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Make sense of your spending." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect institution" }).click();
  await expect(
    page.getByText("Simulated Sandbox Bank", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await expect(
    page.getByText("Synchronization complete.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "coffee cafe", exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await expect(
    page.getByText("Synchronization complete.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "coffee cafe", exact: false }),
  ).toHaveCount(1);
  await page.getByLabel("Category for coffee cafe").selectOption("shopping");
  await expect(page.getByLabel("Category for coffee cafe")).toHaveValue(
    "shopping",
  );
  const budgets = page.getByRole("region", { name: "Budgets", exact: true });

  await budgets
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("shopping");
  await budgets.getByRole("textbox", { name: "Monthly amount" }).fill("100");
  await budgets.getByRole("button", { name: /Save budget for/ }).click();
  await expect(page.getByText("Budget saved.", { exact: true })).toBeVisible();
  await expect(budgets.getByText("$5.25 / $100.00")).toBeVisible();
  const form = page.getByRole("region", {
    name: "Add a transaction",
    exact: true,
  });
  await form
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("grocery produce");
  await form
    .getByRole("textbox", { name: "Amount", exact: true })
    .fill("-10.00");
  await form.getByRole("button", { name: "Save transaction" }).click();
  await expect(
    page.getByText("Transaction added.", { exact: true }),
  ).toBeVisible();
  await form.getByText("Import a CSV", { exact: true }).click();
  await form.locator("input[type=file]").setInputFiles({
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "date,description,amount,external_id\n" +
        new Date().toISOString().slice(0, 10) +
        ",bus transit,-3.50,browser-row-1",
    ),
  });
  await form.getByRole("button", { name: "Import", exact: true }).click();
  await expect(
    page.getByText("Imported 1; skipped 0 duplicates.", { exact: true }),
  ).toBeVisible();
  await page
    .locator(".filters")
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("transport");
  await expect(
    page.getByRole("cell", { name: "bus transit", exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "coffee cafe", exact: false }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByText(/disconnected · Synced/)).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});
