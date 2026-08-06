import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CustomerCallsEngine } from "@/lib/engine/customer-calls-engine";
import { createCustomerCallsRepository } from "@/lib/infra/repositories/postgres-customer-calls";
import { closePool, withTransaction } from "@/lib/infra/db/pool";
import { seedDemoCallQueuesForTests } from "@/lib/infra/db/seed-customer-calls";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("Customer Calls engine", () => {
  const engine = () => new CustomerCallsEngine(createCustomerCallsRepository());

  beforeAll(async () => {
    await withTransaction(async (client) => {
      await seedDemoCallQueuesForTests(client);
    });
    const segments = await engine().listSegments();
    if (segments.length < 2) {
      throw new Error("Customer Calls seed missing — run db:migrate && db:seed");
    }
  });

  afterAll(async () => {
    await closePool();
  });

  it("loads both seeded segments", async () => {
    const segments = await engine().listSegments();
    const types = segments.map((s) => s.segmentType).sort();
    expect(types).toEqual(["delivery-follow-up", "re-engagement"]);
    expect(segments.every((s) => s.script.length > 20)).toBe(true);
  });

  it("starting a call sets in-progress", async () => {
    const ws = await engine().getWorkspace("delivery-follow-up");
    const pending = ws.queue.find((q) => q.status === "pending");
    expect(pending).toBeTruthy();
    const started = await engine().startCall(pending!.id);
    expect(started.item.status).toBe("in-progress");
  });

  it("completing a call persists interaction; Save & Next advances", async () => {
    const ws = await engine().getWorkspace("re-engagement");
    const first = ws.queue.find((q) => q.status === "pending" || q.status === "in-progress");
    expect(first).toBeTruthy();
    await engine().startCall(first!.id);
    const result = await engine().saveAndNext({
      queueItemId: first!.id,
      outcome: "Send WhatsApp",
      notes: "Shared aarla.in WhatsApp note",
    });
    expect(result.interaction.outcome).toBe("Send WhatsApp");
    expect(result.item.status).toBe("completed");
    const history = await engine().history(first!.externalCustomerId);
    expect(history.some((h) => h.id === result.interaction.id)).toBe(true);
    if (result.next) {
      expect(result.next.status).toBe("in-progress");
      expect(result.next.id).not.toBe(first!.id);
    }
  });

  it("Call Later persists follow-up date", async () => {
    const ws = await engine().getWorkspace("delivery-follow-up");
    const pending = ws.queue.find((q) => q.status === "pending");
    expect(pending).toBeTruthy();
    const saved = await engine().callLater(pending!.id, "2026-08-10", "Try afternoon");
    expect(saved.item.status).toBe("call-later");
    expect(saved.interaction.followUpAt).toBe("2026-08-10");
  });

  it("Issue Reported persists issue details", async () => {
    const ws = await engine().getWorkspace("delivery-follow-up");
    const pending = ws.queue.find((q) => q.status === "pending");
    expect(pending).toBeTruthy();
    await engine().startCall(pending!.id);
    const saved = await engine().saveOutcome({
      queueItemId: pending!.id,
      outcome: "Issue Reported",
      issueType: "damaged product",
      notes: "Corner dent on tumbler",
      followUpAt: "2026-08-05",
    });
    expect(saved.interaction.issueRaised).toBe(true);
    expect(saved.interaction.issueType).toBe("damaged product");
    expect(saved.item.status).toBe("completed");
  });

  it("Corporate requirement details persist", async () => {
    const ws = await engine().getWorkspace("re-engagement");
    const pending = ws.queue.find((q) => q.status === "pending");
    expect(pending).toBeTruthy();
    await engine().startCall(pending!.id);
    const saved = await engine().saveOutcome({
      queueItemId: pending!.id,
      outcome: "Corporate Requirement",
      notes: "Diwali hampers for 40",
      approximateQuantity: 40,
      followUpAt: "2026-08-12",
    });
    expect(saved.interaction.requirementType).toBe("corporate");
    expect(saved.interaction.approximateQuantity).toBe(40);
  });

  it("Do Not Contact excludes customer from queues", async () => {
    const ws = await engine().getWorkspace("re-engagement");
    const pending = ws.queue.find((q) => q.status === "pending");
    expect(pending).toBeTruthy();
    const customerId = pending!.externalCustomerId;
    await engine().startCall(pending!.id);
    await engine().saveOutcome({
      queueItemId: pending!.id,
      outcome: "Do Not Contact",
      notes: "Asked not to call again",
    });
    const after = await engine().getWorkspace("re-engagement");
    expect(after.queue.every((q) => q.externalCustomerId !== customerId)).toBe(true);
  });
});
