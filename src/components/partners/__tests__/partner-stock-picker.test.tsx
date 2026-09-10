import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartnerStockPicker } from "@/components/partners/PartnerStockPicker";
import type { PartnerStockOption } from "@/lib/domain/partner-stock-options";

const options: PartnerStockOption[] = [
  {
    productId: "prod-kolam-bottle",
    productTitle: "Kolam Bottle",
    variantId: "var-kol-blue",
    variantLabel: "Blue",
    sku: "KOL-BLU",
    available: 4,
  },
  {
    productId: "prod-kolam-bottle",
    productTitle: "Kolam Bottle",
    variantId: "var-kol-cream",
    variantLabel: "Warm cream",
    sku: "KOL-CRM",
    available: 2,
  },
];

describe("PartnerStockPicker multi-select", () => {
  it("lets you check multiple results and add them together", async () => {
    const user = userEvent.setup();
    const onAddMany = vi.fn();
    const onQueryChange = vi.fn();

    render(
      <PartnerStockPicker
        options={options}
        query="kolam"
        onQueryChange={onQueryChange}
        onAddMany={onAddMany}
        requireQuery
      />,
    );

    const checks = screen.getAllByTestId("partner-stock-option-check");
    expect(checks).toHaveLength(2);
    await user.click(checks[0]!);
    await user.click(checks[1]!);
    await user.click(screen.getByTestId("partner-stock-add-selected"));

    expect(onAddMany).toHaveBeenCalledTimes(1);
    expect(onAddMany.mock.calls[0]![0]).toHaveLength(2);
    expect(onQueryChange).toHaveBeenCalledWith("");
  });
});
