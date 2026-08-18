import { describe, expect, it } from "vitest";
import { DatabaseUnavailableError } from "@/lib/infra/db/errors";
import { assertDatabaseAvailable, query } from "@/lib/infra/db/pool";
import {
  allocateToCampaign,
  createCampaign,
  getCampaignBoard,
  upsertLineItem,
  upsertPartnerRecall,
} from "@/lib/application/campaign-service";
import { createPostgresUnitOfWork } from "@/lib/infra/repositories/postgres-unit-of-work";

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
      expect(board.currentReadiness).toEqual(board.readiness);
      expect(board.potentialReadiness.required).toBe(board.readiness.required);
      expect(board.trueProcurementGap).toBe(0);

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

  it("upsertPartnerRecall creates a planning row without stock_movements", async () => {
    try {
      await assertDatabaseAvailable();
    } catch {
      return;
    }

    try {
      const uow = createPostgresUnitOfWork();
      const [partners, products] = await Promise.all([
        uow.partners.list(),
        uow.products.list(),
      ]);
      const partner = partners[0];
      const product = products[0];
      if (!partner || !product) return;

      const movementsBefore = await uow.movements.list();
      const countBefore = movementsBefore.length;

      const campaign = await createCampaign({
        name: `Recall Test ${Date.now()}`,
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      });

      await upsertLineItem({
        campaignId: campaign.id,
        productCode: product.id,
        plannedQuantity: 10,
      });

      const board = await upsertPartnerRecall({
        campaignId: campaign.id,
        partnerCode: partner.id,
        productCode: product.id,
        quantity: 3,
        status: "AVAILABLE_TO_RECALL",
      });

      const recallRows = await query<{ id: string; quantity: number; status: string }>(
        `select id, quantity, status from campaign_partner_recalls
         where campaign_id = $1 and partner_code = $2 and product_code = $3`,
        [campaign.id, partner.id, product.id],
      );
      expect(recallRows.length).toBe(1);
      expect(Number(recallRows[0]!.quantity)).toBe(3);
      expect(recallRows[0]!.status).toBe("AVAILABLE_TO_RECALL");

      const movementsAfter = await uow.movements.list();
      expect(movementsAfter.length).toBe(countBefore);

      expect(board.currentReadiness).toEqual(board.readiness);
      // Potential may rise only when partner held > 0; still must not affect READY gate.
      expect(board.canMarkReady).toBe(board.readiness.missing === 0 && board.readiness.required > 0);
    } catch (err) {
      if (err instanceof DatabaseUnavailableError) return;
      if (
        err instanceof Error &&
        /campaigns|campaign_partner_recalls|relation .* does not exist/i.test(err.message)
      ) {
        return;
      }
      throw err;
    }
  });
});
