import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdjustStockModal } from "../AdjustStockModal";
import type { Location, VariantStockCell } from "@/lib/domain/types";

const testLocations: Location[] = [
  { id: "loc-studio", name: "Aarla Studio", kind: "Studio" },
  { id: "loc-partner-freshly", name: "Freshly Brewed", kind: "Partner", partnerId: "partner-freshly" },
];

const cell: VariantStockCell = {
  productId: "prod-kolam-bottle",
  variantId: "var-kol-cream",
  total: 34,
  studio: 24,
  partner: 10,
  channel: 0,
  damaged: 0,
  available: 24,
  reserved: 0,
  byLocation: [
    { locationId: "loc-studio", locationName: "Aarla Studio", kind: "Studio", quantity: 24 },
    { locationId: "loc-partner-freshly", locationName: "Freshly Brewed", kind: "Partner", quantity: 10 },
  ],
};

describe("AdjustStockModal", () => {
  it("shows the system quantity at the selected location and submits the delta", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <AdjustStockModal
        open
        onClose={vi.fn()}
        productTitle="Kolam Bottle"
        variantLabel="Warm cream on indigo"
        cell={cell}
        locations={testLocations}
        defaultLocationId="loc-studio"
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByTestId("adjust-physical-qty")).toHaveValue(24);

    await user.clear(screen.getByTestId("adjust-physical-qty"));
    await user.type(screen.getByTestId("adjust-physical-qty"), "22");
    await user.selectOptions(screen.getByTestId("adjust-reason"), "damaged");
    await user.type(screen.getByTestId("adjust-notes"), "Two units cracked");
    await user.click(screen.getByText("Confirm Adjustment"));

    expect(onConfirm).toHaveBeenCalledWith({
      locationId: "loc-studio",
      systemQty: 24,
      physicalQty: 22,
      reason: "damaged",
      notes: "Two units cracked",
    });
  });

  it("updates the system quantity when switching location", async () => {
    const user = userEvent.setup();
    render(
      <AdjustStockModal
        open
        onClose={vi.fn()}
        productTitle="Kolam Bottle"
        cell={cell}
        locations={testLocations}
        defaultLocationId="loc-studio"
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByTestId("adjust-physical-qty")).toHaveValue(24);
    await user.selectOptions(screen.getByTestId("adjust-location"), "loc-partner-freshly");
    expect(screen.getByTestId("adjust-physical-qty")).toHaveValue(10);
  });

  it("disables submit when the physical count matches the system count", () => {
    render(
      <AdjustStockModal
        open
        onClose={vi.fn()}
        productTitle="Kolam Bottle"
        cell={cell}
        locations={testLocations}
        defaultLocationId="loc-studio"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText("Confirm Adjustment")).toBeDisabled();
  });
});
