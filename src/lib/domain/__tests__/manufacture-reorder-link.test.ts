import { describe, expect, it } from "vitest";
import {
  manufactureReorderHref,
  parseManufactureReorderLines,
  suggestedReorderQty,
} from "@/lib/domain/manufacture-reorder-link";

describe("manufactureReorderHref", () => {
  it("builds a Needs Making deep link with product and qty", () => {
    expect(
      manufactureReorderHref({
        productId: "prod-x",
        variantId: "var-xl",
        quantity: 20,
        label: "Tee / XL",
      }),
    ).toBe(
      "/manufacture/needs?make=prod-x&variant=var-xl&qty=20&label=Tee+%2F+XL",
    );
  });

  it("can open the zero-stock filter without a product", () => {
    expect(manufactureReorderHref({ productId: "", filter: "zero" })).toBe(
      "/manufacture/needs?filter=zero",
    );
  });

  it("encodes multi-line apparel reorder payloads", () => {
    const href = manufactureReorderHref({
      productId: "prod-tee",
      variantId: "v1",
      quantity: 10,
      lines: [
        { variantId: "v1", quantity: 10, label: "Black / S" },
        { variantId: "v2", quantity: 5, label: "Black / M" },
      ],
    });
    expect(href).toContain("make=prod-tee");
    expect(href).toContain("lines=");
    const lines = parseManufactureReorderLines(
      new URL(href, "https://aarla.test").searchParams.get("lines"),
    );
    expect(lines).toEqual([
      { variantId: "v1", quantity: 10, label: "Black / S" },
      { variantId: "v2", quantity: 5, label: "Black / M" },
    ]);
  });
});

describe("suggestedReorderQty", () => {
  it("suggests a restock batch for zero and low stock", () => {
    expect(suggestedReorderQty(0)).toBe(20);
    expect(suggestedReorderQty(0, 50)).toBe(50);
    expect(suggestedReorderQty(3, 10)).toBe(17);
  });
});
