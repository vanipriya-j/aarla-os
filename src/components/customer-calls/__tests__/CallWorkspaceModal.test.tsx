import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CallWorkspaceModal } from "../CallWorkspaceModal";
import type { CustomerCallQueueItem, CustomerCallSegment } from "@/lib/domain/customer-calls-types";
import { DELIVERY_SCRIPT } from "@/lib/domain/customer-calls-types";

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
});
