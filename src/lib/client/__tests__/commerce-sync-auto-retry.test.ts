import { describe, expect, it } from "vitest";
import { isTransientCommerceSyncError } from "@/lib/client/commerce-sync-auto-retry";

describe("isTransientCommerceSyncError", () => {
  it("treats Vercel timeouts and lock conflicts as retryable", () => {
    expect(isTransientCommerceSyncError("timed out")).toBe(true);
    expect(
      isTransientCommerceSyncError(
        "Sync chunk timed out or returned an unexpected response (Vercel cut the request).",
      ),
    ).toBe(true);
    expect(isTransientCommerceSyncError("already in progress")).toBe(true);
    expect(isTransientCommerceSyncError("Shopify credentials missing")).toBe(false);
  });
});
