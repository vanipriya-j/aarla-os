/**
 * Availability-adjusted sales pace from receipt-based replenishment cycles.
 * Primary signal: units sold while a receipt batch was available — NOT calendar dilution.
 * No AI. Deterministic + explainable.
 */
export type MatchedSaleLine = {
  variantId: string;
  productId: string;
  quantity: number;
  /** ISO date (day) */
  soldOn: string;
};

export type InboundReceipt = {
  variantId: string;
  productId: string;
  quantity: number;
  /** ISO date (day) when stock became available */
  availableOn: string;
  movementId?: string;
  reference?: string;
};

export type SalesPaceClass =
  | "extremely-fast"
  | "fast-mover"
  | "consistent-performer"
  | "healthy"
  | "slow-moving"
  | "stagnant"
  | "insufficient-data";

export type SalesPaceThresholds = {
  extremelyFastSellThrough: number;
  extremelyFastDaysToSellOut: number;
  fastSellThrough: number;
  fastDaysToSellOut: number;
  stagnantDaysSinceSale: number;
  consistentMinCycles: number;
  consistentVelocityRatioMax: number;
};

export const DEFAULT_SALES_PACE_THRESHOLDS: SalesPaceThresholds = {
  extremelyFastSellThrough: 0.9,
  extremelyFastDaysToSellOut: 7,
  fastSellThrough: 0.8,
  fastDaysToSellOut: 14,
  stagnantDaysSinceSale: 60,
  consistentMinCycles: 2,
  consistentVelocityRatioMax: 2,
};

export type ReplenishmentCycle = {
  availableOn: string;
  quantityIntroduced: number;
  quantitySold: number;
  sellThrough: number;
  daysToSellOut: number | null;
  /** Availability-adjusted units/day while the batch was selling */
  velocityPerDay: number | null;
  soldOut: boolean;
  endOn: string;
  reasons: string[];
};

export type VariantSalesPace = {
  productId: string;
  variantId: string;
  classification: SalesPaceClass;
  why: string[];
  cycles: ReplenishmentCycle[];
  lastCycle: ReplenishmentCycle | null;
  unitsSold30d: number;
  unitsSold60d: number;
  unitsSold90d: number;
  daysSinceLastSale: number | null;
  currentlyStockedOut: boolean;
  stockedOutDays: number | null;
  acceleration: "accelerating" | "stable" | "decelerating" | "unknown";
};

function dayMs(isoDay: string): number {
  return Date.parse(`${isoDay.slice(0, 10)}T00:00:00.000Z`);
}

function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.round((dayMs(b) - dayMs(a)) / 86_400_000));
}

function addDays(isoDay: string, days: number): string {
  const d = new Date(`${isoDay.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Build replenishment cycles for one variant from inbound receipts + matched sales.
 * Sales are attributed FIFO across receipt batches.
 */
export function buildReplenishmentCycles(input: {
  receipts: InboundReceipt[];
  sales: MatchedSaleLine[];
  asOf?: string;
}): ReplenishmentCycle[] {
  const asOf = input.asOf ?? todayIso();
  const receipts = [...input.receipts].sort((a, b) => dayMs(a.availableOn) - dayMs(b.availableOn));
  const sales = [...input.sales].sort((a, b) => dayMs(a.soldOn) - dayMs(b.soldOn));

  const cycles: ReplenishmentCycle[] = [];

  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i]!;
    const nextStart = receipts[i + 1]?.availableOn ?? null;
    const windowEnd = nextStart ?? asOf;

    let remaining = receipt.quantity;
    let sold = 0;
    let sellOutDay: string | null = null;

    for (const sale of sales) {
      if (dayMs(sale.soldOn) < dayMs(receipt.availableOn)) continue;
      if (nextStart && dayMs(sale.soldOn) >= dayMs(nextStart)) break;
      if (remaining <= 0) break;
      const take = Math.min(remaining, sale.quantity);
      sold += take;
      remaining -= take;
      if (remaining <= 0 && sellOutDay == null) {
        sellOutDay = sale.soldOn;
      }
    }

    const soldOut = sold >= receipt.quantity;
    const endOn = soldOut && sellOutDay ? sellOutDay : windowEnd;
    const spanDays = daysBetween(receipt.availableOn, endOn);
    const inclusiveDays = Math.max(1, spanDays + (soldOut || spanDays > 0 ? 1 : 0));
    // Inclusive calendar days from availableOn through sell-out/end (Aug 1→Aug 5 = 5).
    const daysToSellOut = soldOut
      ? Math.max(1, daysBetween(receipt.availableOn, sellOutDay!) + 1)
      : null;
    const velocityDenominator = daysToSellOut ?? Math.max(1, inclusiveDays);
    const sellThrough = receipt.quantity > 0 ? Math.min(1, sold / receipt.quantity) : 0;
    const velocityPerDay = sold > 0 ? sold / velocityDenominator : null;

    const reasons: string[] = [
      `Received ${receipt.quantity} on ${receipt.availableOn}`,
      `Sold ${sold} against this batch (${Math.round(sellThrough * 100)}% sell-through)`,
    ];
    if (soldOut && daysToSellOut != null) {
      reasons.push(`Sold out in ${daysToSellOut} day(s)`);
      if (velocityPerDay != null) {
        reasons.push(`~${velocityPerDay.toFixed(1)} units/day while available`);
      }
    } else if (sold === 0) {
      reasons.push("No matched sales attributed to this batch yet");
    } else {
      reasons.push(`Still ${remaining} of this batch unsold as of ${endOn}`);
    }

    cycles.push({
      availableOn: receipt.availableOn,
      quantityIntroduced: receipt.quantity,
      quantitySold: sold,
      sellThrough,
      daysToSellOut,
      velocityPerDay,
      soldOut,
      endOn,
      reasons,
    });
  }

  return cycles;
}

export function classifySalesPace(input: {
  cycles: ReplenishmentCycle[];
  unitsSold90d: number;
  daysSinceLastSale: number | null;
  currentlyStockedOut: boolean;
  stockedOutDays: number | null;
  isSeasonalOffSeason?: boolean;
  thresholds?: SalesPaceThresholds;
}): { classification: SalesPaceClass; why: string[]; acceleration: VariantSalesPace["acceleration"] } {
  const t = input.thresholds ?? DEFAULT_SALES_PACE_THRESHOLDS;
  const why: string[] = [];
  const complete = input.cycles.filter((c) => c.soldOut || c.sellThrough >= 0.8);
  const last = input.cycles[input.cycles.length - 1] ?? null;

  if (input.cycles.length === 0) {
    return {
      classification: "insufficient-data",
      why: ["No inbound receipt history to build availability cycles"],
      acceleration: "unknown",
    };
  }

  if (input.isSeasonalOffSeason && (input.unitsSold90d === 0 || (input.daysSinceLastSale ?? 0) > 30)) {
    why.push("Seasonal product is outside its active selling months");
    return { classification: "healthy", why, acceleration: "unknown" };
  }

  let acceleration: VariantSalesPace["acceleration"] = "unknown";
  const velocities = complete
    .map((c) => c.velocityPerDay)
    .filter((v): v is number => v != null && v > 0);
  if (velocities.length >= 2) {
    const prev = velocities[velocities.length - 2]!;
    const curr = velocities[velocities.length - 1]!;
    const ratio = curr / prev;
    if (ratio >= 1.25) acceleration = "accelerating";
    else if (ratio <= 0.75) acceleration = "decelerating";
    else acceleration = "stable";
  }

  if (
    last &&
    last.soldOut &&
    last.sellThrough >= t.extremelyFastSellThrough &&
    (last.daysToSellOut ?? 999) <= t.extremelyFastDaysToSellOut
  ) {
    why.push(...last.reasons);
    if (input.currentlyStockedOut) {
      why.push(`Currently out of stock${input.stockedOutDays != null ? ` for ${input.stockedOutDays} day(s)` : ""}`);
    }
    return { classification: "extremely-fast", why, acceleration };
  }

  if (
    last &&
    last.soldOut &&
    last.sellThrough >= t.fastSellThrough &&
    (last.daysToSellOut ?? 999) <= t.fastDaysToSellOut
  ) {
    why.push(...last.reasons);
    return { classification: "fast-mover", why, acceleration };
  }

  if (complete.length >= t.consistentMinCycles) {
    const vs = complete
      .map((c) => c.velocityPerDay)
      .filter((v): v is number => v != null && v > 0);
    if (vs.length >= t.consistentMinCycles) {
      const max = Math.max(...vs);
      const min = Math.min(...vs);
      if (max / min <= t.consistentVelocityRatioMax) {
        why.push(
          `${complete.length} healthy replenishment cycles with stable availability-adjusted velocity`,
        );
        return { classification: "consistent-performer", why, acceleration };
      }
    }
  }

  if (
    !input.isSeasonalOffSeason &&
    input.daysSinceLastSale != null &&
    input.daysSinceLastSale >= t.stagnantDaysSinceSale &&
    (last?.sellThrough ?? 0) < 0.5
  ) {
    why.push(`No sale in ${input.daysSinceLastSale} days with weak sell-through on latest batch`);
    return { classification: "stagnant", why, acceleration };
  }

  if (last && last.sellThrough < 0.4 && (last.velocityPerDay == null || last.velocityPerDay < 0.2)) {
    why.push(...last.reasons);
    why.push("Low sell-through while stock was available");
    return { classification: "slow-moving", why, acceleration };
  }

  if (last) why.push(...last.reasons);
  else why.push("Some receipt history present but mixed signals");
  return { classification: "healthy", why, acceleration };
}

export function computeVariantSalesPace(input: {
  productId: string;
  variantId: string;
  receipts: InboundReceipt[];
  sales: MatchedSaleLine[];
  studioQty: number;
  isSeasonalOffSeason?: boolean;
  thresholds?: SalesPaceThresholds;
  asOf?: string;
}): VariantSalesPace {
  const asOf = input.asOf ?? todayIso();
  const cycles = buildReplenishmentCycles({
    receipts: input.receipts.filter((r) => r.variantId === input.variantId),
    sales: input.sales.filter((s) => s.variantId === input.variantId),
    asOf,
  });

  const sales = input.sales.filter((s) => s.variantId === input.variantId);
  const lastSale = sales.length ? sales[sales.length - 1]!.soldOn : null;
  const daysSinceLastSale = lastSale != null ? daysBetween(lastSale, asOf) : null;

  const sumSince = (days: number) => {
    const from = addDays(asOf, -days);
    return sales
      .filter((s) => dayMs(s.soldOn) >= dayMs(from))
      .reduce((n, s) => n + s.quantity, 0);
  };

  const currentlyStockedOut = input.studioQty <= 0;
  let stockedOutDays: number | null = null;
  if (currentlyStockedOut && cycles.length > 0) {
    const last = cycles[cycles.length - 1]!;
    if (last.soldOut && last.daysToSellOut != null) {
      stockedOutDays = daysBetween(last.endOn, asOf);
    } else if (lastSale) {
      stockedOutDays = daysSinceLastSale;
    }
  }

  const classified = classifySalesPace({
    cycles,
    unitsSold90d: sumSince(90),
    daysSinceLastSale,
    currentlyStockedOut,
    stockedOutDays,
    isSeasonalOffSeason: input.isSeasonalOffSeason,
    thresholds: input.thresholds,
  });

  return {
    productId: input.productId,
    variantId: input.variantId,
    classification: classified.classification,
    why: classified.why,
    cycles,
    lastCycle: cycles[cycles.length - 1] ?? null,
    unitsSold30d: sumSince(30),
    unitsSold60d: sumSince(60),
    unitsSold90d: sumSince(90),
    daysSinceLastSale,
    currentlyStockedOut,
    stockedOutDays,
    acceleration: classified.acceleration,
  };
}

export function salesPaceLabel(c: SalesPaceClass): string {
  const labels: Record<SalesPaceClass, string> = {
    "extremely-fast": "Extremely fast",
    "fast-mover": "Fast mover",
    "consistent-performer": "Consistent performer",
    healthy: "Healthy",
    "slow-moving": "Slow moving",
    stagnant: "Stagnant",
    "insufficient-data": "Insufficient data",
  };
  return labels[c];
}
