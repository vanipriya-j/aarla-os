import { describe, expect, it } from "vitest";
import { createPartnerCommerceRepository } from "@/lib/infra/repositories/postgres-partner-commerce";

describe("createPartnerCommerceRepository", () => {
  it("collates unbilled partner sales into an adjustable invoice", async () => {
    const movementUuid = "11111111-1111-1111-1111-111111111111";
    const inserts: Array<{ sql: string; params: unknown[] }> = [];
    let invoiceCount = 0;

    const q = async <T extends Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ): Promise<T[]> => {
      const sql = text.replace(/\s+/g, " ").trim();

      if (sql.includes("from stock_movements sm") && sql.includes("Partner Sale")) {
        return [
          {
            movement_uuid: movementUuid,
            movement_code: "mv-sale-1",
            movement_date: "2026-09-01",
            product_code: "prod-kolam-bottle",
            product_title: "Kolam Bottle",
            selling_price: 1200,
            variant_code: "var-kol-cream",
            variant_label: "Warm cream",
            quantity: 2,
            reference: "PSALE-1",
          },
        ] as unknown as T[];
      }

      if (sql.includes("select count(*)::text as n from partner_invoices")) {
        return [{ n: String(invoiceCount) }] as unknown as T[];
      }

      if (sql.startsWith("insert into partner_invoices")) {
        inserts.push({ sql, params });
        invoiceCount += 1;
        return [] as T[];
      }

      if (sql.startsWith("insert into partner_invoice_lines")) {
        inserts.push({ sql, params });
        return [] as T[];
      }

      if (sql.includes("from partner_invoices pi") && sql.includes("pi.id::text = $2")) {
        return [
          {
            id: String(params[1]),
            code: "INV-TEST-CAFE-001",
            partner_code: "partner-test-cafe",
            partner_name: "Test Café",
            status: "issued",
            currency: "INR",
            computed_total: 2400,
            adjusted_total: 2200,
            amount_paid: 0,
            notes: "Adjusted",
            issued_at: new Date("2026-09-07T10:00:00Z"),
            created_at: new Date("2026-09-07T10:00:00Z"),
          },
        ] as unknown as T[];
      }

      if (sql.includes("from partner_invoice_lines pil")) {
        return [
          {
            id: "line-1",
            movement_code: "mv-sale-1",
            product_code: "prod-kolam-bottle",
            variant_code: "var-kol-cream",
            description: "Kolam Bottle · Warm cream ×2",
            quantity: 2,
            unit_price: 1200,
            line_total: 2400,
          },
        ] as unknown as T[];
      }

      throw new Error(`Unexpected query: ${sql}`);
    };

    const repo = createPartnerCommerceRepository(q);
    const unbilled = await repo.listUnbilledSales("partner-test-cafe");
    expect(unbilled).toHaveLength(1);
    expect(unbilled[0]!.lineTotal).toBe(2400);

    const invoice = await repo.createInvoiceFromSales({
      partnerCode: "partner-test-cafe",
      movementUuids: [movementUuid],
      adjustedTotal: 2200,
      notes: "Adjusted",
      issue: true,
    });

    expect(invoice.code).toBe("INV-TEST-CAFE-001");
    expect(invoice.adjustedTotal).toBe(2200);
    expect(invoice.computedTotal).toBe(2400);
    expect(invoice.balanceDue).toBe(2200);
    expect(invoice.lines).toHaveLength(1);
    expect(inserts.some((i) => i.sql.includes("insert into partner_invoices"))).toBe(true);
    expect(inserts.some((i) => i.sql.includes("insert into partner_invoice_lines"))).toBe(true);
  });
});
