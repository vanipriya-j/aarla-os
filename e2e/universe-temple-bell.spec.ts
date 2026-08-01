import { expect, test } from "@playwright/test";

/**
 * Universe flow — requires seeded Postgres + Next server with DATABASE_URL.
 */
test.describe("Aarla Universe — Temple Bell", () => {
  test("explore, confirm Drishti, create object + content, persist", async ({ page }) => {
    await page.goto("/explore");
    await page.getByTestId("universe-input").fill("Temple Bell");
    await page.getByTestId("universe-explore-btn").click();
    await expect(page.getByTestId("universe-result")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Temple Bell").first()).toBeVisible();

    // Open Drishti relationship if listed
    const drishti = page.getByTestId("affinity-row-drishti");
    if (await drishti.count()) {
      await expect(drishti.getByText(/affinity|Why/i).first()).toBeVisible();
      const confirm = drishti.getByRole("button", { name: /Confirm Relationship/i });
      if (await confirm.count()) {
        await confirm.click();
      }
    }

    // Create future object
    await page.getByRole("button", { name: "Create Product Opportunity" }).first().click();
    await page.getByTestId("product-opp-title").fill("Small Brass Bell E2E");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/universe\//, { timeout: 20_000 });

    // Back to explore and create content
    await page.goto("/explore");
    await page.getByTestId("universe-input").fill("Temple Bell");
    await page.getByTestId("universe-explore-btn").click();
    await expect(page.getByTestId("universe-result")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Create Content Concept" }).first().click();
    await page.getByTestId("content-concept-title").fill("Science behind temple bells E2E");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/universe\//, { timeout: 20_000 });

    await page.reload();
    await expect(page.getByRole("heading", { name: /Science behind temple bells E2E/i })).toBeVisible();

    await page.goto("/explore");
    await page.getByTestId("universe-input").fill("Temple Bell");
    await page.getByTestId("universe-explore-btn").click();
    await expect(page.getByTestId("universe-result")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Small Brass Bell E2E").first()).toBeVisible();
    await expect(page.getByText("Science behind temple bells E2E").first()).toBeVisible();
  });
});
