import { describe, expect, it } from "vitest";
import {
  formatAwbsTracked,
  formatCheckoutsLoaded,
  formatOrdersLoaded,
} from "@/lib/client/commerce-sync-progress";
import {
  emptyShopifySyncSummary,
  mergeShopifySyncSummaries,
} from "@/lib/domain/external-commerce-types";

describe("commerce sync progress labels", () => {
  it("formats Loaded X of Y when total is known", () => {
    expect(formatOrdersLoaded(5, 558)).toBe("Loaded 5 of 558 orders");
    expect(formatOrdersLoaded(6, 558)).toBe("Loaded 6 of 558 orders");
  });

  it("falls back when total is missing", () => {
    expect(formatOrdersLoaded(12)).toBe("Loaded 12 orders");
    expect(formatOrdersLoaded(12, null)).toBe("Loaded 12 orders");
  });

  it("formats AWB and checkout progress", () => {
    expect(formatAwbsTracked(10, 219)).toBe("Tracked 10 of 219 AWBs");
    expect(formatCheckoutsLoaded(3)).toBe("Loaded 3 abandoned checkouts");
  });

  it("preserves ordersTotal across merged chunk summaries", () => {
    const a = { ...emptyShopifySyncSummary(), ordersRead: 25, ordersTotal: 558, hasMore: true };
    const b = { ...emptyShopifySyncSummary(), ordersRead: 25, ordersTotal: null, hasMore: false };
    const merged = mergeShopifySyncSummaries(a, b);
    expect(merged.ordersRead).toBe(50);
    expect(merged.ordersTotal).toBe(558);
  });
});
