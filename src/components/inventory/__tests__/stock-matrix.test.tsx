import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StockMatrix } from "../StockMatrix";
import { buildApparelMatrix, buildArtMatrix } from "@/lib/domain/inventory-presentation";
import { deriveVariantTotals, movementsSeed } from "@/lib/domain/ledger";
import { locations, products } from "@/lib/domain/catalog";

const tee = products.find((p) => p.id === "prod-chennai-tee")!;
const art = products.find((p) => p.id === "prod-kolam-art")!;

describe("StockMatrix", () => {
  it("renders Size columns from the apparel product's variant options", () => {
    const cells = deriveVariantTotals(movementsSeed, tee.id, tee.variants, locations);
    const rows = buildApparelMatrix(tee, cells);
    render(<StockMatrix rows={rows} rowHeader="Colour" columnHeader="Size" />);

    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();

    expect(screen.getByText("Indigo")).toBeInTheDocument();
    expect(screen.getByText("Mustard")).toBeInTheDocument();
  });

  it("shows each cell's total quantity and calls onCellClick with the underlying cell", async () => {
    const user = userEvent.setup();
    const cells = deriveVariantTotals(movementsSeed, tee.id, tee.variants, locations);
    const rows = buildApparelMatrix(tee, cells);
    const onCellClick = vi.fn();
    render(<StockMatrix rows={rows} onCellClick={onCellClick} />);

    // Indigo — S has 24 studio units (24 total, no other locations for that variant).
    const indigoSCell = screen.getByText("24");
    await user.click(indigoSCell);

    expect(onCellClick).toHaveBeenCalledWith(
      expect.objectContaining({ variantId: "var-tee-ind-s", total: 24 }),
    );
  });

  it("flags a low-stock cell with a visible marker", () => {
    const cells = deriveVariantTotals(movementsSeed, tee.id, tee.variants, locations);
    const rows = buildApparelMatrix(tee, cells);
    const lowStockVariantIds = new Set(["var-tee-ind-l"]);
    render(<StockMatrix rows={rows} lowStockVariantIds={lowStockVariantIds} />);

    expect(screen.getAllByText("low")).toHaveLength(1);
  });

  it("renders Format columns for the art matrix", () => {
    const cells = deriveVariantTotals(movementsSeed, art.id, art.variants, locations);
    const rows = buildArtMatrix(art, cells);
    render(<StockMatrix rows={rows} rowHeader="Design" columnHeader="Format" />);

    expect(screen.getByText("8x10")).toBeInTheDocument();
    expect(screen.getByText("12x16")).toBeInTheDocument();
    expect(screen.getByText("16x20")).toBeInTheDocument();
  });

  it("renders nothing for an empty row set", () => {
    const { container } = render(<StockMatrix rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
