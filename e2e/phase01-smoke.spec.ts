import { test, expect } from "@playwright/test";

/**
 * Critical smoke: manufacture → receive → transfer → sale → registration
 * Requires a production Next server (`npm run build && npm start`) — see playwright.config.ts.
 */
test("Phase 0–1 ledger smoke flow", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());

  // --- Manufacture ---
  await page.goto("/manufacture");
  await expect(page.getByRole("heading", { name: "Manufacture / Reorder" })).toBeVisible();
  await page.getByRole("button", { name: "Continue to vendor form" }).click();
  await expect(page.getByText("Bottle vendor form")).toBeVisible();
  await page.getByRole("button", { name: "Generate previews" }).click();
  await page.getByRole("button", { name: "Continue to approve" }).click();
  await page.getByRole("button", { name: "Approve and Send" }).click();
  await expect(page.getByText("Order approved & marked sent")).toBeVisible();
  const poChip = page.getByText(/^PO-\d+$/).first();
  await expect(poChip).toBeVisible();
  const poId = (await poChip.textContent())?.trim();
  expect(poId).toMatch(/^PO-\d+$/);

  // --- Receive ---
  await page.goto("/receive");
  await expect(page.getByRole("heading", { name: "Receive Stock" })).toBeVisible();
  const poSelect = page.locator("main select").first();
  await expect
    .poll(async () => {
      const options = await poSelect.locator("option").allTextContents();
      return options.some((o) => o.includes(poId!));
    })
    .toBe(true);
  const options = await poSelect.locator("option").allTextContents();
  const match = options.find((o) => o.includes(poId!));
  await poSelect.selectOption({ label: match! });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Quantities" })).toBeVisible();

  const qtyInputs = page.locator("main input[type='number']");
  await qtyInputs.nth(2).fill("5"); // accepted
  await qtyInputs.nth(3).fill("1"); // damaged
  await page.getByRole("button", { name: "Continue to QC" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Generate barcode" }).click();
  await page.getByRole("button", { name: /Print barcode/ }).click();
  await page.getByText("Confirm barcode attached to cartons").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Confirm receive & write ledger" }).click();
  await expect(page.getByText("Posted to stock ledger")).toBeVisible();

  // --- Transfer + Sale ---
  await page.goto("/partners");
  await page.getByRole("button", { name: /Nimalli/ }).click();
  await page.getByRole("button", { name: "Transfer Stock" }).click();
  await expect(page.getByRole("button", { name: "Confirm" })).toBeVisible();
  await page.locator("select").last().selectOption("prod-muruga-bottle");
  await page.locator('input[type="number"]').last().fill("2");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Transfer posted to ledger/)).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Record Sale" }).click();
  await page.locator("select").last().selectOption("prod-muruga-bottle");
  await page.locator('input[type="number"]').last().fill("1");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Partner sale posted to ledger/)).toBeVisible({ timeout: 10_000 });

  // --- Registration ---
  await page.goto("/register");
  await page.getByLabel("Registration Code").fill("AARLA-E2E-001");
  await page.getByLabel("Product").selectOption("prod-muruga-bottle");
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill("e2e.tester@example.com");
  await page.getByLabel("Phone").fill("9000000000");
  await page.getByLabel("City").fill("Chennai");
  await page.getByText(/I consent to joining the Aarla community/).click();
  await page.getByRole("button", { name: "Register Product" }).click();
  await expect(page.getByText("Welcome to the Aarla Community")).toBeVisible();

  // --- Consistency after refresh ---
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();

  await page.goto("/products/prod-muruga-bottle");
  await expect(page.getByRole("heading", { level: 1, name: /Muruga/i })).toBeVisible();
  await page.getByRole("button", { name: "Journey" }).click();
  await expect(page.getByText(/Registered|registration/i).first()).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Business Dashboard" })).toBeVisible();
});
