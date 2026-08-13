import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransferStockModal } from "../TransferStockModal";
import type { Location } from "@/lib/domain/types";

const testLocations: Location[] = [
  { id: "loc-studio", name: "Aarla Studio", kind: "Studio" },
  { id: "loc-partner-freshly", name: "Freshly Brewed", kind: "Partner", partnerId: "partner-freshly" },
  { id: "loc-shopify", name: "Shopify", kind: "Channel" },
];

describe("TransferStockModal", () => {
  it("submits the chosen from/to locations, quantity and notes", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <TransferStockModal
        open
        onClose={vi.fn()}
        productTitle="Kolam Bottle"
        variantLabel="Warm cream on indigo"
        locations={testLocations}
        defaultFromLocationId="loc-studio"
        defaultToLocationId="loc-partner-freshly"
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText(/Kolam Bottle/)).toBeInTheDocument();
    await user.clear(screen.getByTestId("transfer-quantity"));
    await user.type(screen.getByTestId("transfer-quantity"), "5");
    await user.type(screen.getByTestId("transfer-notes"), "Restocking display");
    await user.click(screen.getByText("Confirm Transfer"));

    expect(onConfirm).toHaveBeenCalledWith({
      fromLocationId: "loc-studio",
      toLocationId: "loc-partner-freshly",
      quantity: 5,
      notes: "Restocking display",
    });
  });

  it("disables submit when from and to locations are the same", async () => {
    const user = userEvent.setup();
    render(
      <TransferStockModal
        open
        onClose={vi.fn()}
        productTitle="Kolam Bottle"
        locations={testLocations}
        defaultFromLocationId="loc-studio"
        defaultToLocationId="loc-partner-freshly"
        onConfirm={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByTestId("transfer-to"), "loc-studio");
    expect(screen.getByText("Confirm Transfer")).toBeDisabled();
    expect(screen.getByText(/must be different/i)).toBeInTheDocument();
  });
});
