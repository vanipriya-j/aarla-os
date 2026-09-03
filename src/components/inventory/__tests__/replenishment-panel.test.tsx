import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReplenishmentPanel } from "../ReplenishmentPanel";
import { computeReplenishment } from "@/lib/domain/inventory-replenishment";
import { movementsSeed } from "@/lib/domain/ledger";
import { locations, partners, products } from "@/lib/domain/catalog";
import type { ReorderRule } from "@/lib/domain/types";

describe("ReplenishmentPanel", () => {
  it("renders aarla-low items from computeReplenishment and wires the Transfer action", async () => {
    const user = userEvent.setup();
    const rules: ReorderRule[] = [
      { id: "r1", productId: "prod-carnatic-tray", minQuantity: 15, notes: "" },
    ];
    const items = computeReplenishment({
      products,
      movements: movementsSeed,
      locations,
      partners,
      rules,
    });
    const aarlaLow = items.filter((i) => i.kind === "aarla-low");
    const onTransfer = vi.fn();

    render(
      <ReplenishmentPanel title="A. Aarla Low Stock" items={aarlaLow} onTransfer={onTransfer} />,
    );

    expect(screen.getByText("Carnatic Raga Tray")).toBeInTheDocument();
    expect(screen.getByText("Reorder")).toBeInTheDocument();

    await user.click(screen.getByText("Reorder").closest("a")!);
    expect(onTransfer).not.toHaveBeenCalled();
    expect(screen.getByText("Reorder").closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("/manufacture/needs?make="),
    );
  });

  it("shows a Transfer button for partner-need rows and calls onTransfer with the item", async () => {
    const user = userEvent.setup();
    const rules: ReorderRule[] = [
      {
        id: "r2",
        productId: "prod-kolam-art",
        variantId: "var-art-12",
        partnerId: "partner-nimalli",
        minQuantity: 3,
        notes: "",
      },
    ];
    const items = computeReplenishment({
      products,
      movements: movementsSeed,
      locations,
      partners,
      rules,
    });
    const partnerNeed = items.filter((i) => i.kind === "partner-need");
    const onTransfer = vi.fn();

    render(
      <ReplenishmentPanel title="B. Partner Replenishment Needed" items={partnerNeed} onTransfer={onTransfer} />,
    );

    const transferButton = screen.getByText("Transfer");
    await user.click(transferButton);
    expect(onTransfer).toHaveBeenCalledWith(expect.objectContaining({ kind: "partner-need" }));
  });

  it("renders the empty message when there are no items", () => {
    render(
      <ReplenishmentPanel
        title="C. Global Low Stock"
        items={[]}
        onTransfer={vi.fn()}
        emptyMessage="All clear."
      />,
    );
    expect(screen.getByText("All clear.")).toBeInTheDocument();
  });
});
