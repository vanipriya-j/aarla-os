import { describe, expect, it } from "vitest";
import {
  manufactureReorderHref,
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
});

describe("suggestedReorderQty", () => {
  it("suggests a restock batch for zero and low stock", () => {
    expect(suggestedReorderQty(0)).toBe(20);
    expect(suggestedReorderQty(0, 50)).toBe(50);
    expect(suggestedReorderQty(3, 10)).toBe(17);
  });
});
