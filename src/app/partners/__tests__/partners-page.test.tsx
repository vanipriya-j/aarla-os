import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PartnersPage from "@/app/partners/page";

const createPartner = vi.fn();
const establishPartnerOpeningBalances = vi.fn();
const transfer = vi.fn();
const transferFromPartner = vi.fn();
const partnerSale = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/client/use-app-data", () => ({
  useAppLedger: () => ({
    movements: [],
    transfer,
    transferFromPartner,
    partnerSale,
    createPartner,
    establishPartnerOpeningBalances,
    partners: [
      {
        id: "partner-test-cafe",
        name: "Test Café",
        partnerType: "Café",
        location: "Test Café",
        contact: "",
        paymentStatus: "Current",
        margin: 0,
        replenishmentHistory: [],
        merchandisingNotes: "",
        displayPhotos: [],
        productsSold: 0,
      },
    ],
    products: [
      {
        id: "prod-kolam-bottle",
        title: "Kolam Bottle",
        variants: [{ id: "var-kol-cream", label: "Warm cream", sku: "X" }],
      },
    ],
    locations: [{ id: "loc-partner-test-cafe", name: "Test Café", partnerId: "partner-test-cafe" }],
    hydrated: true,
    error: null,
    refresh,
  }),
  useAppNetwork: () => ({
    registrations: [],
  }),
}));

vi.mock("@/app/actions/partner-commerce-actions", () => ({
  listUnbilledPartnerSalesAction: vi.fn(async () => ({ ok: true, data: [] })),
  listPartnerInvoicesAction: vi.fn(async () => ({ ok: true, data: [] })),
  raisePartnerInvoiceAction: vi.fn(),
  receivePartnerPaymentAction: vi.fn(),
}));

describe("PartnersPage", () => {
  beforeEach(() => {
    createPartner.mockReset();
    establishPartnerOpeningBalances.mockReset();
    transfer.mockReset();
    transferFromPartner.mockReset();
    partnerSale.mockReset();
    refresh.mockReset();
  });

  it("shows partner actions including recall, invoice, and payment", async () => {
    render(<PartnersPage />);
    expect(screen.getByRole("button", { name: /Recall to Studio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Raise invoice/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Receive payment/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Transfer from Studio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Record sale/i })).toBeInTheDocument();
  });

  it("creates a partner from the add modal", async () => {
    const user = userEvent.setup();
    createPartner.mockResolvedValue({
      id: "partner-new",
      name: "New Café",
      partnerType: "Café",
      location: "New Café",
      contact: "",
      paymentStatus: "Current",
      margin: 0,
      replenishmentHistory: [],
      merchandisingNotes: "",
      displayPhotos: [],
      productsSold: 0,
    });

    render(<PartnersPage />);
    await user.click(screen.getByRole("button", { name: /Add partner/i }));
    await user.type(screen.getByTestId("partner-name"), "New Café");
    await user.click(screen.getByRole("button", { name: /Confirm/i }));

    expect(createPartner).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Café", partnerType: "Retail Partner" }),
    );
  });
});
