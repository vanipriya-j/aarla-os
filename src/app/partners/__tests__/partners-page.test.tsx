import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PartnersPage from "@/app/partners/page";

const createPartner = vi.fn();
const establishPartnerOpeningBalances = vi.fn();
const transfer = vi.fn();
const partnerSale = vi.fn();

vi.mock("@/lib/client/use-app-data", () => ({
  useAppLedger: () => ({
    movements: [],
    transfer,
    partnerSale,
    createPartner,
    establishPartnerOpeningBalances,
    partners: [],
    products: [
      {
        id: "prod-kolam-bottle",
        title: "Kolam Bottle",
        variants: [{ id: "var-kol-cream", label: "Warm cream", sku: "X" }],
      },
    ],
    locations: [],
    hydrated: true,
    error: null,
  }),
  useAppNetwork: () => ({
    registrations: [],
  }),
}));

describe("PartnersPage", () => {
  beforeEach(() => {
    createPartner.mockReset();
    establishPartnerOpeningBalances.mockReset();
    transfer.mockReset();
    partnerSale.mockReset();
  });

  it("shows empty state and creates a partner", async () => {
    const user = userEvent.setup();
    createPartner.mockResolvedValue({
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
    });

    render(<PartnersPage />);
    expect(screen.getByText(/No partners yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Add partner/i }));
    await user.type(screen.getByTestId("partner-name"), "Test Café");
    await user.click(screen.getByRole("button", { name: /Confirm/i }));

    expect(createPartner).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test Café", partnerType: "Retail Partner" }),
    );
  });
});
