import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveOrdersWatch } from "@/components/commerce/LiveOrdersWatch";

vi.mock("@/components/customer-calls/CommerceSyncProvider", () => ({
  useCommerceSync: () => ({ busy: false }),
}));

describe("LiveOrdersWatch", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            skipped: false,
            ordersRead: 0,
            ordersUpserted: 0,
            fulfilCreated: 0,
            salesPosted: 0,
            salesSkipped: 0,
            newFulfilmentIds: [],
            openStockCheck: [],
          },
        }),
      }),
    );
  });

  it("shows enable CTA and turns on live alerts", async () => {
    const user = userEvent.setup();
    render(<LiveOrdersWatch />);
    expect(screen.getByText(/Live Shopify orders/i)).toBeInTheDocument();
    const enable = screen.getByRole("button", { name: /Enable live alerts/i });
    await user.click(enable);
    expect(localStorage.getItem("aarla.liveOrders.enabled")).toBe("1");
    expect(screen.getByRole("button", { name: /Pause/i })).toBeInTheDocument();
  });
});
