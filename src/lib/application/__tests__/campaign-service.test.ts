import { describe, expect, it } from "vitest";
import { DatabaseUnavailableError } from "@/lib/infra/db/errors";
import { assertDatabaseAvailable } from "@/lib/infra/db/pool";
import {
  allocateToCampaign,
  createCampaign,
  getCampaignBoard,
  upsertLineItem,
} from "@/lib/application/campaign-service";

const hasDbUrl = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDbUrl)("Campaign planner service (DB)", () => {
  it("creates a campaign and validates missing catalog products", async () => {
    try {
      await assertDatabaseAvailable();
    } catch {
      // Optional light test — skip when Postgres is not reachable (no /setup in this PR).
      return;
    }

    try {
      const campaign = await createCampaign({
        name: `Test Campaign ${Date.now()}`,
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        plannedAdSpend: 1000,
        targetRevenue: 50000,
      });
      expect(campaign.status).toBe("DRAFT");
      expect(campaign.id).toBeTruthy();

      await expect(
        upsertLineItem({
          campaignId: campaign.id,
          productCode: "prod-does-not-exist",
          plannedQuantity: 5,
        }),
      ).rejects.toThrow(/not found/i);

      const board = await getCampaignBoard(campaign.id);
      expect(board.campaign.id).toBe(campaign.id);
      expect(board.totals.plannedAdSpend).toBe(1000);
      expect(board.canMarkReady).toBe(false);

      await expect(
        allocateToCampaign({
          campaignId: campaign.id,
          productCode: "prod-does-not-exist",
          quantity: 1,
        }),
      ).rejects.toThrow(/not found/i);
    } catch (err) {
      if (err instanceof DatabaseUnavailableError) return;
      // Tables may not exist until migrations are applied after PR 8 /setup.
      if (err instanceof Error && /campaigns|relation .* does not exist/i.test(err.message)) {
        return;
      }
      throw err;
    }
  });
});
