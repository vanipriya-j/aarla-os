import { test, expect } from "@playwright/test";

/**
 * End-to-end persistence: receive stock, verify inventory, reload, verify again.
 * Requires DATABASE_URL-backed Next server + seeded Postgres.
 */
test("inventory persists after browser reload", async ({ page }) => {
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible({ timeout: 15_000 });

  // Capture Kolam Bottle studio stock from the products table
  const kolamRow = page.locator("tr", { hasText: "Kolam Bottle" }).first();
  await expect(kolamRow).toBeVisible({ timeout: 15_000 });
  const beforeText = await kolamRow.locator("td").nth(1).textContent();
  const before = Number(beforeText?.trim());
  expect(Number.isFinite(before)).toBe(true);

  // Manufacture a small PO
  await page.goto("/manufacture");
  await page.getByRole("button", { name: "Continue to vendor form" }).click();
  await expect(page.getByText("Bottle vendor form")).toBeVisible();
  await page.getByRole("button", { name: "Generate previews" }).click();
  await page.getByRole("button", { name: "Continue to approve" }).click();
  await page.getByRole("button", { name: "Approve and Send" }).click();
  await expect(page.getByText("Order approved & marked sent")).toBeVisible();
  const poId = ((await page.getByText(/^PO-\d+$/).first().textContent()) ?? "").trim();
  expect(poId).toMatch(/^PO-\d+$/);

  // Receive 3 accepted
  await page.goto("/receive");
  const poSelect = page.locator("main select").first();
  await expect
    .poll(async () => {
      const options = await poSelect.locator("option").allTextContents();
      return options.some((o) => o.includes(poId));
    })
    .toBe(true);
  const options = await poSelect.locator("option").allTextContents();
  await poSelect.selectOption({ label: options.find((o) => o.includes(poId))! });
  await page.getByRole("button", { name: "Continue" }).click();
  const qtyInputs = page.locator("main input[type='number']");
  await qtyInputs.nth(2).fill("3");
  await qtyInputs.nth(3).fill("0");
  await page.getByRole("button", { name: "Continue to QC" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Generate barcode" }).click();
  await page.getByRole("button", { name: /Print barcode/ }).click();
  await page.getByText("Confirm barcode attached to cartons").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Confirm receive & write ledger" }).click();
  await expect(page.getByText("Posted to stock ledger")).toBeVisible();

  await page.goto("/inventory");
  const midRow = page.locator("tr", { hasText: "Muruga Water Bottle" }).first();
  await expect(midRow).toBeVisible({ timeout: 15_000 });
  const midStudio = Number((await midRow.locator("td").nth(1).textContent())?.trim());
  expect(midStudio).toBeGreaterThanOrEqual(3);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  const afterRow = page.locator("tr", { hasText: "Muruga Water Bottle" }).first();
  await expect(afterRow).toBeVisible({ timeout: 15_000 });
  const afterStudio = Number((await afterRow.locator("td").nth(1).textContent())?.trim());
  expect(afterStudio).toBe(midStudio);
});
