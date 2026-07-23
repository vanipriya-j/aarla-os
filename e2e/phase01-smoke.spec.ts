import { test, expect } from "@playwright/test";

/**
 * Critical smoke: manufacture → receive → transfer → sale → registration
 */
test("Phase 0–1 ledger smoke flow", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());

  // --- Manufacture ---
  await page.goto("/manufacture");
  await expect(page.getByRole("heading", { name: "Manufacture / Reorder" })).toBeVisible();
  await page.getByRole("button", { name: "Continue to vendor form" }).click();
  await page.getByRole("button", { name: "Generate previews" }).click();
  await page.getByRole("button", { name: "Continue to approve" }).click();
  await page.getByRole("button", { name: "Approve and Send" }).click();
  await expect(page.getByText("Order approved & marked sent")).toBeVisible();
  const poText = await page.locator("text=/PO-\\d+/").first().textContent();
  const poId = poText?.match(/PO-\d+/)?.[0];
  expect(poId).toBeTruthy();

  // --- Receive ---
  await page.goto("/receive");
  await expect(page.getByRole("heading", { name: "Receive Stock" })).toBeVisible();
  const poSelect = page.locator("select").first();
  const options = await poSelect.locator("option").allTextContents();
  const match = options.find((o) => o.includes(poId!));
  expect(match).toBeTruthy();
  await poSelect.selectOption({ label: match! });
  await page.getByRole("button", { name: "Continue" }).click();

  const qtyInputs = page.locator('input[type="number"]');
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
  await page.locator(".fixed select, [role='dialog'] select, select").last().selectOption("prod-muruga-bottle");
  await page.locator(".fixed input[type='number'], [role='dialog'] input[type='number'], input[type='number']").last().fill("2");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Transfer posted to ledger|Transfer failed/)).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByText(/Transfer posted to ledger/)).toBeVisible();

  await page.getByRole("button", { name: "Record Sale" }).click();
  await page.locator("select").last().selectOption("prod-muruga-bottle");
  await page.locator('input[type="number"]').last().fill("1");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Partner sale posted to ledger/)).toBeVisible({ timeout: 5000 });

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
  await expect(page.getByRole("heading", { name: /Muruga/i })).toBeVisible();
  await page.getByRole("button", { name: "Journey" }).click();
  await expect(page.getByText(/Registered|registration/i).first()).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Business Dashboard" })).toBeVisible();
});
