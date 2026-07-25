import { describe, expect, it, beforeEach } from "vitest";
import {
  LOC,
  movementsSeed,
  projectProductJourney,
} from "@/lib/domain";
import { buildRegistration, buildStockMovement, resetFixtureSeq } from "@/test/fixtures/builders";

describe("journey projector", () => {
  beforeEach(() => {
    resetFixtureSeq();
  });

  it("7. journey is projected from actual movements and registrations", () => {
    const stages = projectProductJourney("prod-kolam-bottle", movementsSeed);
    expect(stages.some((s) => s.id === "received")).toBe(true);
    expect(stages.some((s) => s.id === "transferred")).toBe(true);
    expect(stages.some((s) => s.id === "registered")).toBe(true);
  });

  it("8. a sale does not imply a known User", () => {
    const movements = [
      buildStockMovement({
        productId: "prod-lakshmi-tumbler",
        quantity: 5,
        fromLocationId: LOC.studio,
        toLocationId: LOC.sold,
        movementType: "Partner Sale",
        reference: "PSALE-NO-USER",
      }),
    ];
    const stages = projectProductJourney("prod-lakshmi-tumbler", movements, []);
    expect(stages.some((s) => s.id === "customer")).toBe(true);
    expect(stages.some((s) => s.id === "user")).toBe(false);
    expect(stages.some((s) => s.id === "registered")).toBe(false);
  });

  it("9. registration links a real User and updates the Journey", () => {
    const movements = [
      buildStockMovement({
        productId: "prod-lakshmi-tumbler",
        quantity: 1,
        fromLocationId: LOC.studio,
        toLocationId: LOC.sold,
        movementType: "Shopify Sale",
        reference: "ORD-LAK-1",
      }),
    ];
    const before = projectProductJourney("prod-lakshmi-tumbler", movements, []);
    expect(before.some((s) => s.id === "registered")).toBe(false);

    const regs = [
      buildRegistration({
        productId: "prod-lakshmi-tumbler",
        userId: "person-vanipriya",
        customerId: "person-vanipriya",
        status: "Community",
      }),
    ];
    const after = projectProductJourney("prod-lakshmi-tumbler", movements, regs);
    expect(after.some((s) => s.id === "user")).toBe(true);
    expect(after.some((s) => s.id === "registered")).toBe(true);
    expect(after.find((s) => s.id === "registered")?.detail).toContain("1 registration");
  });
});
