import { expect, test } from "@playwright/test";

test.describe("Delhivery shipment diagnostics", () => {
  test("sync summary and persisted statuses survive refresh", async ({ page }) => {
    await page.goto("/customer-calls");
    await expect(page.getByTestId("customer-calls-page")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("delhivery-sync-panel")).toBeVisible();
    // Page load must not auto-start sync or diagnostics.
    await expect(page.getByTestId("delhivery-diagnostics-idle")).toBeVisible();

    await page.getByTestId("sync-delhivery-shipments").click();
    await expect(page.getByTestId("delhivery-sync-summary")).toBeVisible({ timeout: 30_000 });

    await expect(page.getByTestId("shipment-row-AWB1001DEL")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("shipment-row-AWB1001DEL")).toHaveAttribute(
      "data-status",
      "delivered",
    );
    await expect(page.getByTestId("shipment-row-AWB1002DEL")).toBeVisible();
    await expect(page.getByTestId("shipment-row-AWB1002DEL")).toHaveAttribute(
      "data-status",
      "in-transit",
    );

    await page.reload();
    await expect(page.getByTestId("delhivery-sync-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("delhivery-diagnostics-idle")).toBeVisible();
    await page.getByTestId("load-delhivery-diagnostics").click();
    await expect(page.getByTestId("shipment-row-AWB1001DEL")).toHaveAttribute(
      "data-status",
      "delivered",
      { timeout: 15_000 },
    );
    await expect(page.getByTestId("shipment-row-AWB1002DEL")).toHaveAttribute(
      "data-status",
      "in-transit",
    );
  });
});
