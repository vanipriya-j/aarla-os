import { batches, getPartnerName, getPersonName, getProduct, getVendorName, locations } from "./catalog";
import { registrationsSeed } from "./catalog";
import type { JourneyStage, StockMovement } from "./types";

/**
 * Journey is a projection over catalog + ledger + registrations — not hand-maintained pages.
 */
export function projectProductJourney(
  productId: string,
  movements: StockMovement[],
): JourneyStage[] {
  const product = getProduct(productId);
  if (!product) return [];

  const productMoves = movements
    .filter((m) => m.productId === productId)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const stages: JourneyStage[] = [];

  stages.push({
    id: "designed",
    label: "Designed",
    detail: product.ideaOrigin
      ? `${product.ideaOrigin}${product.designedDate ? ` · ${product.designedDate}` : ""}`
      : `World: ${product.world}`,
    href: "/explore",
    tone: "muted",
  });

  const receipt = productMoves.find((m) => m.movementType === "Purchase Receipt");
  const batch = batches.find((b) => b.productId === productId && b.accepted > 0) ??
    batches.find((b) => b.productId === productId);

  if (batch || receipt) {
    const vendorId = batch?.vendorId;
    stages.push({
      id: "vendor",
      label: "Vendor",
      detail: vendorId ? getVendorName(vendorId) : "Vendor",
      href: "/inventory?tab=batches",
    });
  }

  if (batch) {
    stages.push({
      id: "batch",
      label: "Batch",
      detail: batch.batchNumber,
      href: "/inventory?tab=batches",
      tone: "accent",
    });
  }

  if (receipt || batch?.receivedDate) {
    const accepted =
      productMoves
        .filter((m) => m.movementType === "Purchase Receipt")
        .reduce((s, m) => s + m.quantity, 0) || batch?.accepted || 0;
    const damaged =
      productMoves
        .filter((m) => m.movementType === "Damage")
        .reduce((s, m) => s + m.quantity, 0) || batch?.damaged || 0;
    stages.push({
      id: "received",
      label: "Received",
      detail: `Aarla Studio · ${accepted} Accepted · ${damaged} Damaged`,
      href: "/receive",
      tone: damaged ? "warning" : "default",
    });
  }

  const transfers = productMoves.filter((m) => m.movementType === "Transfer");
  if (transfers.length) {
    const bits = transfers.map((t) => {
      const loc = locations.find((l) => l.id === t.toLocationId);
      return `${t.quantity} ${loc?.name ?? t.toLocationId}`;
    });
    stages.push({
      id: "transferred",
      label: "Transferred",
      detail: bits.join(" · "),
      href: "/inventory?tab=movements",
    });
  }

  const sales = productMoves.filter((m) =>
    ["Shopify Sale", "Partner Sale", "Studio Sale", "Gift", "Corporate Allocation"].includes(
      m.movementType,
    ),
  );
  const soldQty = sales.reduce((s, m) => s + m.quantity, 0);
  const regs = registrationsSeed.filter((r) => r.productId === productId);
  const knownUsers = new Set(regs.map((r) => r.userId)).size;

  if (sales.some((m) => m.movementType === "Corporate Allocation")) {
    stages.push({
      id: "customer-org",
      label: "Customer",
      detail: "Infosys · corporate allocation",
      href: "/registrations",
    });
    const unknown = Math.max(soldQty - knownUsers, 0);
    if (unknown > 0) {
      stages.push({
        id: "circulation",
        label: "In Circulation – User Unknown",
        detail: `${unknown} of ${soldQty} not yet registered`,
        href: "/registrations",
        tone: "warning",
      });
    }
  } else if (sales.length) {
    // Prefer named examples when registration links exist
    const firstReg = regs[0];
    if (firstReg?.customerId) {
      stages.push({
        id: "customer",
        label: "Customer",
        detail: getPersonName(firstReg.customerId),
        href: `/people/${firstReg.customerId}`,
      });
    } else {
      stages.push({
        id: "customer",
        label: "Customer",
        detail: `${soldQty} unit(s) sold / gifted`,
        href: "/people?filter=customers",
      });
    }

    if (firstReg?.userId) {
      const same = firstReg.customerId === firstReg.userId;
      stages.push({
        id: "user",
        label: "User",
        detail: same
          ? getPersonName(firstReg.userId)
          : `${getPersonName(firstReg.userId)}${firstReg.customerId ? " (≠ customer)" : ""}`,
        href: `/people/${firstReg.userId}`,
        tone: "success",
      });
    }
  } else {
    stages.push({
      id: "inventory",
      label: "In Inventory",
      detail: "Stock held at studio / partners / channel",
      href: "/inventory",
      tone: "muted",
    });
  }

  if (regs.length) {
    stages.push({
      id: "registered",
      label: "Registered",
      detail: `${regs.length} registration(s)`,
      href: "/registrations",
      tone: "success",
    });
    if (regs.some((r) => r.status === "Community")) {
      stages.push({
        id: "community",
        label: "Community",
        detail: "Known users in the Aarla community",
        href: "/people?filter=community",
        tone: "accent",
      });
    }
  }

  const partnerRegs = regs.filter((r) => r.partnerId);
  if (partnerRegs.length) {
    const names = Array.from(
      new Set(partnerRegs.map((r) => getPartnerName(r.partnerId!))),
    );
    stages.push({
      id: "partner-origin",
      label: "Partner origin",
      detail: names.join(" · "),
      href: "/partners",
      tone: "muted",
    });
  }

  return stages;
}
