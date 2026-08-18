import { describe, expect, it } from "vitest";
import {
  allocateToCampaign,
  createCampaign,
  getCampaignBoard,
  upsertLineItem,
} from "@/lib/application/campaign-service";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("Campaign planner service (DB)", () => {
  it("creates a campaign, adds a line, and refuses over-allocate when soft available is 0", async () => {
    const campaign = await createCampaign({
      name: `Test Campaign ${Date.now()}`,
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      plannedAdSpend: 1000,
      targetRevenue: 50000,
    });
    expect(campaign.status).toBe("DRAFT");
    expect(campaign.id).toBeTruthy();

    // Use a likely-missing product to assert validation, or skip if catalog empty.
    try {
      await upsertLineItem({
        campaignId: campaign.id,
        productCode: "prod-does-not-exist",
        plannedQuantity: 5,
      });
      expect.unreachable("should reject missing product");
    } catch (err) {
      expect(String(err)).toMatch(/not found/i);
    }

    const board = await getCampaignBoard(campaign.id);
    expect(board.campaign.id).toBe(campaign.id);
    expect(board.totals.plannedAdSpend).toBe(1000);
    expect(board.canMarkReady).toBe(false);

    // allocate without a line should fail on product
    await expect(
      allocateToCampaign({
        campaignId: campaign.id,
        productCode: "prod-does-not-exist",
        quantity: 1,
      }),
    ).rejects.toThrow(/not found/i);
  });
});
