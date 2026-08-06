import type { NormalizedShipmentStatus } from "@/lib/domain/shipment-types";
import { createHash } from "node:crypto";

/**
 * Delhivery (StatusType, Status) → Aarla normalized shipment status.
 *
 * Sources: Delhivery Express package lifecycle / prepaid-COD docs.
 * Unmapped combinations remain `unknown`. Never infer delivered from Shopify.
 */
export function normalizeDelhiveryStatus(
  status: string | null | undefined,
  statusType: string | null | undefined,
  options: { pickedUpDate?: string | null; instructions?: string | null } = {},
): NormalizedShipmentStatus {
  const s = (status ?? "").trim().toLowerCase().replace(/[_­]/g, " ").replace(/\s+/g, " ");
  const t = (statusType ?? "").trim().toUpperCase();
  const instructions = (options.instructions ?? "").toLowerCase();

  if (!s && !t) return "unknown";

  // Terminal / return flows — StatusType matters
  if (t === "RT") return "returned";
  if (s === "rto" || s === "dto" || s.includes("return to origin")) return "returned";
  if (s === "cancelled" || s === "canceled") return "cancelled";

  if (t === "DL" && s === "delivered") return "delivered";
  if (t === "DL" && (s === "rto" || s === "dto")) return "returned";
  if (s === "delivered") return "delivered";

  if (t === "CN") return "cancelled";

  if (s === "dispatched" || instructions.includes("out for delivery")) {
    if (
      instructions.includes("failed") ||
      instructions.includes("undelivered") ||
      instructions.includes("not delivered") ||
      instructions.includes("consignee refused")
    ) {
      return "delivery-failed";
    }
    return "out-for-delivery";
  }

  if (s === "in transit" || s === "pending" || s === "scheduled") {
    return "in-transit";
  }

  if (s === "manifested" || s === "not picked") {
    if (options.pickedUpDate) return "picked-up";
    return "manifested";
  }

  if (s === "picked up" || s === "collected" || t === "PU") return "picked-up";
  if (t === "PP") return "manifested";

  if (s.includes("fail") || s === "undelivered") return "delivery-failed";

  return "unknown";
}

/** Explicit non-Delhivery labels we must never send to the Delhivery tracker. */
const NON_DELHIVERY_CARRIER =
  /\b(bluedart|blue\s*dart|dtdc|fedex|ups|dhl|ecom\s*express|ecomexpress|xpressbees|india\s*post|speed\s*post|shadowfax|ekart|amazon\s*shipping|shiprocket)\b/i;

/**
 * Aarla ships primarily via Delhivery. Shopify often leaves `tracking.company`
 * blank while still storing the AWB — treat blank/generic labels as Delhivery
 * so sync is not capped to the few recent orders that have "Delhivery" filled in.
 */
export function isDelhiveryCarrier(
  trackingCompany: string | null | undefined,
  trackingUrl: string | null | undefined,
): boolean {
  if (trackingUrl && /delhivery\.com/i.test(trackingUrl)) return true;
  const company = (trackingCompany ?? "").trim();
  if (company && /delhivery/i.test(company)) return true;
  if (company && NON_DELHIVERY_CARRIER.test(company)) return false;
  // Blank, generic, or unrecognized company → include AWB (Aarla Delhivery default).
  return true;
}

export function normalizeAwb(awb: string | null | undefined): string | null {
  if (!awb) return null;
  const trimmed = awb.trim();
  return trimmed.length ? trimmed : null;
}

export function dedupeAwbs(awbs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of awbs) {
    const awb = normalizeAwb(raw);
    if (!awb || seen.has(awb)) continue;
    seen.add(awb);
    out.push(awb);
  }
  return out;
}

export function eventFingerprint(parts: {
  awb: string;
  providerStatus: string | null;
  providerStatusType: string | null;
  providerTimestamp: string | null;
  scanLocation: string | null;
  statusCode: string | null;
}): string {
  const material = [
    parts.awb,
    parts.providerStatus ?? "",
    parts.providerStatusType ?? "",
    parts.providerTimestamp ?? "",
    parts.scanLocation ?? "",
    parts.statusCode ?? "",
  ].join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 40);
}

export function chunkAwbs(awbs: string[], size = 30): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < awbs.length; i += size) {
    chunks.push(awbs.slice(i, i + size));
  }
  return chunks;
}
