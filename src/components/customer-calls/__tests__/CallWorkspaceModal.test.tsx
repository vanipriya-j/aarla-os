import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CallWorkspaceModal } from "../CallWorkspaceModal";
import type { CustomerCallQueueItem, CustomerCallSegment } from "@/lib/domain/customer-calls-types";
import { ABANDONED_CART_SCRIPT, DELIVERY_SCRIPT } from "@/lib/domain/customer-calls-types";

const segment: CustomerCallSegment = {
  id: "seg-1",
  organizationId: "org",
  name: "Delivery Follow-up",
  description: "demo",
  segmentType: "delivery-follow-up",
  script: DELIVERY_SCRIPT,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const item: CustomerCallQueueItem = {
  id: "q1",
  organizationId: "org",
  segmentId: "seg-1",
  externalCustomerId: "cust-1",
  externalOrderId: "ORD-1",
  customerName: "Meera Iyer",
  phone: "+91 98400 11101",
  email: "meera@test",
  reason: "Delivered",
  productsSummary: "Tumbler",
  status: "in-progress",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const abandonedSegment: CustomerCallSegment = {
  ...segment,
  id: "seg-abandoned",
  name: "Abandoned Carts",
  segmentType: "abandoned-cart",
  script: ABANDONED_CART_SCRIPT,
};

const abandonedItem: CustomerCallQueueItem = {
  ...item,
  id: "q2",
  segmentId: "seg-abandoned",
  sourceKey: "abandoned:checkout-1",
  externalOrderId: null,
  checkoutUrl: "https://aarla-store.myshopify.com/checkout/abc123",
  cartSubtotal: 1499,
  cartCurrency: "INR",
};

describe("CallWorkspaceModal", () => {
  it("shows script and reveals issue fields when Issue Reported", async () => {
    const user = userEvent.setup();
    render(
      <CallWorkspaceModal
        open
        onClose={vi.fn()}
        item={item}
        segment={segment}
        history={[]}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
      />,
    );
    expect(screen.getByText(/reached you safely/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId("call-outcome"), "Issue Reported");
    expect(screen.getByTestId("call-issue-type")).toBeInTheDocument();
  });

  it("shows the checkout link prominently for Send Checkout Link outcome", async () => {
    const user = userEvent.setup();
    render(
      <CallWorkspaceModal
        open
        onClose={vi.fn()}
        item={abandonedItem}
        segment={abandonedSegment}
        history={[]}
        onSave={vi.fn()}
        onSaveAndNext={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("checkout-link-panel")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByTestId("call-outcome"), "Send Checkout Link");
    expect(screen.getByTestId("checkout-link-panel")).toBeInTheDocument();
    expect(screen.getByTestId("checkout-link-url")).toHaveTextContent(
      "https://aarla-store.myshopify.com/checkout/abc123",
    );
  });

  it("reveals an optional linked-order field for Already Purchased", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <CallWorkspaceModal
        open
        onClose={vi.fn()}
        item={abandonedItem}
        segment={abandonedSegment}
        history={[]}
        onSave={onSave}
        onSaveAndNext={vi.fn()}
      />,
    );
    await user.selectOptions(screen.getByTestId("call-outcome"), "Already Purchased");
    const linkedOrderInput = screen.getByTestId("call-linked-order");
    await user.type(linkedOrderInput, "#10452");
    await user.click(screen.getByTestId("call-save"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "Already Purchased",
        linkedOrderExternalId: "#10452",
      }),
    );
  });
});
