import { test, expect } from "@playwright/test";
test("original homepage, register, connect, sync twice, override, budget, import, filter and logout", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "MyFinance", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign up", exact: true }).click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(`browser-${Date.now()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("a strong browser password");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(
    page.getByText("Overall Transactions", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Connect institution" }).click();
  await expect(
    page.getByText("Simulated Sandbox Bank", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await expect(
    page.getByText("Synchronization complete.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await expect(
    page.getByText("Synchronization complete.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Transactions", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "coffee cafe", exact: false }),
  ).toHaveCount(1);
  await page
    .getByLabel("Category for coffee cafe", { exact: true })
    .selectOption("shopping");
  await expect(
    page.getByLabel("Category for coffee cafe", { exact: true }),
  ).toHaveValue("shopping");
  await page.getByRole("link", { name: "Budget", exact: true }).click();
  const budgets = page.getByRole("form", { name: "Save budget" });
  await budgets
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("shopping");
  await budgets.getByRole("textbox", { name: "Monthly amount" }).fill("100");
  await budgets.getByRole("button", { name: /Save budget for/ }).click();
  await expect(page.getByText("Budget saved.", { exact: true })).toBeVisible();
  await expect(
    page.getByText("$5.25 / $100.00", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Transactions", exact: true }).click();
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
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "date,description,amount,external_id\n" +
        new Date().toISOString().slice(0, 10) +
        ",bus transit,-3.50,browser-row-1",
    ),
  });
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    page.getByText("CSV imported. Repeated external IDs are skipped.", {
      exact: true,
    }),
  ).toBeVisible();
  // Navbar search from the overview opens the matching transaction results.
  await page.getByRole("link", { name: "Pages", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page
    .getByRole("textbox", { name: "Search transactions", exact: true })
    .fill("bus transit");
  await page
    .getByRole("button", { name: "Search transactions", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/transactions$/);
  await expect(
    page.getByRole("cell", { name: "bus transit", exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "coffee cafe", exact: false }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Search transactions", exact: true })
    .fill("");
  await page
    .getByLabel("Category filter", { exact: true })
    .selectOption("transport");
  await expect(
    page.getByRole("cell", { name: "bus transit", exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "coffee cafe", exact: false }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/original-transactions.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByText(/disconnected · Synced/)).toBeVisible();
  await page.getByRole("button", { name: "User menu", exact: true }).click();
  await page.getByRole("link", { name: "Log Out", exact: true }).click();
  await expect(page).toHaveURL(/\/signin$/);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
