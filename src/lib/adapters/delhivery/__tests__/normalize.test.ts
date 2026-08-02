import { describe, expect, it } from "vitest";
import {
  chunkAwbs,
  dedupeAwbs,
  eventFingerprint,
  isDelhiveryCarrier,
  normalizeDelhiveryStatus,
} from "@/lib/adapters/delhivery/normalize";

describe("Delhivery status normalization", () => {
  it("1. provider statuses normalize correctly", () => {
    expect(normalizeDelhiveryStatus("Manifested", "UD")).toBe("manifested");
    expect(normalizeDelhiveryStatus("In Transit", "UD")).toBe("in-transit");
    expect(normalizeDelhiveryStatus("Pending", "UD")).toBe("in-transit");
    expect(normalizeDelhiveryStatus("Dispatched", "UD", { instructions: "Out for delivery" })).toBe(
      "out-for-delivery",
    );
    expect(normalizeDelhiveryStatus("Delivered", "DL")).toBe("delivered");
    expect(normalizeDelhiveryStatus("Cancelled", "UD")).toBe("cancelled");
  });

  it("2. unknown provider statuses remain unknown", () => {
    expect(normalizeDelhiveryStatus("Quantum Entangled", "ZZ")).toBe("unknown");
    expect(normalizeDelhiveryStatus(null, null)).toBe("unknown");
  });

  it("9. returned does not map to delivered", () => {
    expect(normalizeDelhiveryStatus("RTO", "DL")).toBe("returned");
    expect(normalizeDelhiveryStatus("In Transit", "RT")).toBe("returned");
    expect(normalizeDelhiveryStatus("DTO", "DL")).toBe("returned");
  });

  it("10. out for delivery does not map to delivered", () => {
    expect(
      normalizeDelhiveryStatus("Dispatched", "UD", { instructions: "Out for delivery" }),
    ).toBe("out-for-delivery");
  });

  it("uses picked-up when PickedupDate present on early status", () => {
    expect(
      normalizeDelhiveryStatus("Manifested", "UD", { pickedUpDate: "2026-07-01T00:00:00Z" }),
    ).toBe("picked-up");
  });

  it("deduplicates AWBs and chunks batches", () => {
    expect(dedupeAwbs([" AWB1 ", "AWB1", "AWB2", "", "AWB2"])).toEqual(["AWB1", "AWB2"]);
    expect(chunkAwbs(Array.from({ length: 35 }, (_, i) => `A${i}`), 30)).toHaveLength(2);
  });

  it("detects Delhivery carrier from company or URL", () => {
    expect(isDelhiveryCarrier("Delhivery", null)).toBe(true);
    expect(isDelhiveryCarrier("BlueDart", "https://www.delhivery.com/track/x")).toBe(true);
    expect(isDelhiveryCarrier("BlueDart", "https://bluedart.com/x")).toBe(false);
  });

  it("builds stable event fingerprints", () => {
    const a = eventFingerprint({
      awb: "X",
      providerStatus: "Delivered",
      providerStatusType: "DL",
      providerTimestamp: "2026-01-01T00:00:00Z",
      scanLocation: "A",
      statusCode: "EOD-38",
    });
    const b = eventFingerprint({
      awb: "X",
      providerStatus: "Delivered",
      providerStatusType: "DL",
      providerTimestamp: "2026-01-01T00:00:00Z",
      scanLocation: "A",
      statusCode: "EOD-38",
    });
    expect(a).toBe(b);
  });
});
