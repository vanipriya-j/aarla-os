import { afterAll, describe, expect, it } from "vitest";
import {
  getDiagnosticsReport,
  getHealthReport,
} from "@/lib/application/system-diagnostics";
import { closePool } from "@/lib/infra/db/pool";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("system health and diagnostics", () => {
  afterAll(async () => {
    await closePool();
  });

  it("health report reflects database availability", async () => {
    const health = await getHealthReport();
    expect(health.service).toBe("aarla-os");
    expect(health.ok).toBe(true);
    expect(health.database.ok).toBe(true);
    expect(health.database.latencyMs).toBeTypeOf("number");
  });

  it("diagnostics never expose secrets and reports table presence", async () => {
    const report = await getDiagnosticsReport();
    expect(report.database.tables.external_customers).toBe(true);
    expect(report.database.tables.shipments).toBe(true);
    const json = JSON.stringify(report);
    expect(json).not.toMatch(/shpat_/i);
    expect(json).not.toMatch(/client_secret/i);
    expect(report.shopify).toHaveProperty("configured");
    expect(report.delhivery).toHaveProperty("tokenSet");
    expect(report.commerce).toHaveProperty("externalCustomers");
  });
});
