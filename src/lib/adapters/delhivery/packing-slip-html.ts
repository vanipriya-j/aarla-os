import type { DelhiveryPackingSlipPackage } from "@/lib/adapters/delhivery/shipping-port";

/** Simple printable packing slip HTML (browser print → PDF / label printer). */
export function renderDelhiveryPackingSlipHtml(input: {
  slip: DelhiveryPackingSlipPackage;
  orderNumber: string;
  partnerNote?: string | null;
}): string {
  const { slip, orderNumber } = input;
  const esc = (v: string | null | undefined) =>
    String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Delhivery label · ${esc(slip.awb)}</title>
  <style>
    @page { size: 100mm 150mm; margin: 6mm; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; color: #111; margin: 0; }
    .sheet { border: 2px solid #111; padding: 12px; max-width: 360px; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    .awb { font-size: 28px; font-weight: 700; letter-spacing: 0.04em; margin: 8px 0; }
    .meta { font-size: 12px; line-height: 1.45; }
    .row { margin: 4px 0; }
    .label { color: #555; display: inline-block; min-width: 72px; }
    .barcode { font-family: ui-monospace, monospace; font-size: 22px; letter-spacing: 0.18em;
      border: 1px dashed #333; padding: 10px 8px; text-align: center; margin: 12px 0; }
    .actions { margin-top: 16px; }
    @media print { .actions { display: none; } body { print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>Aarla · Delhivery</h1>
    <div class="row meta"><span class="label">Order</span> ${esc(orderNumber)}</div>
    <div class="awb">${esc(slip.awb)}</div>
    <div class="barcode">*${esc(slip.awb)}*</div>
    <div class="meta">
      <div class="row"><span class="label">Sort</span> ${esc(slip.sortCode || "—")}</div>
      <div class="row"><span class="label">Mode</span> ${esc(slip.shippingMode || "—")} · ${esc(slip.paymentMode || "—")}</div>
      <div class="row"><span class="label">To</span> ${esc(slip.name || "—")}</div>
      <div class="row"><span class="label">Phone</span> ${esc(slip.phone || "—")}</div>
      <div class="row"><span class="label">Address</span> ${esc(slip.address || "—")}</div>
      <div class="row"><span class="label">City</span> ${esc(slip.city || "—")} ${esc(slip.pin || "")}</div>
    </div>
    ${input.partnerNote ? `<p class="meta">${esc(input.partnerNote)}</p>` : ""}
  </div>
  <div class="actions">
    <button onclick="window.print()">Print label</button>
  </div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
</body>
</html>`;
}
