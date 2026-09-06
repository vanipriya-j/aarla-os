import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  formatLiveSyncAt,
  LiveOrdersWatch,
} from "@/components/commerce/LiveOrdersWatch";

vi.mock("@/components/customer-calls/CommerceSyncProvider", () => ({
  useCommerceSync: () => ({ busy: false }),
}));

describe("formatLiveSyncAt", () => {
  it("shows time only for today", () => {
    const now = new Date("2026-09-06T12:00:00");
    const at = new Date("2026-09-06T09:24:00");
    expect(formatLiveSyncAt(at, now)).toMatch(/9:24/);
  });
});

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
            ordersRead: 3,
            ordersUpserted: 3,
            fulfilCreated: 2,
            salesPosted: 1,
            salesSkipped: 0,
            newFulfilmentIds: ["f1", "f2"],
            openStockCheck: [
              { id: "f1", orderNumber: "#1604", customerName: "NAGASIMHA S" },
              { id: "f2", orderNumber: "#1609", customerName: "Sruti" },
            ],
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

  it("Check now walks checking → got orders → syncing → done with last sync", async () => {
    localStorage.setItem("aarla.liveOrders.enabled", "1");
    const user = userEvent.setup();
    render(<LiveOrdersWatch />);

    await waitFor(() => {
      expect(screen.getByTestId("live-orders-check-now")).toBeInTheDocument();
    });

    // Wait for initial auto tick to finish seeding.
    await waitFor(
      () => {
        expect(screen.getByTestId("live-orders-status").textContent).toMatch(
          /Last sync at|Live watch on|Done/i,
        );
      },
      { timeout: 3000 },
    );

    await user.click(screen.getByTestId("live-orders-check-now"));

    await waitFor(() => {
      expect(screen.getByTestId("live-orders-status").textContent).toMatch(
        /Checking now|Got |Syncing|Done/i,
      );
    });

    await waitFor(
      () => {
        expect(screen.getByTestId("live-orders-status").textContent).toMatch(
          /Last sync at/i,
        );
      },
      { timeout: 5000 },
    );
  });
});
