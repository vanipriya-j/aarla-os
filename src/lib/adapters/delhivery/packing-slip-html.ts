import type { DelhiveryPackingSlipPackage } from "@/lib/adapters/delhivery/shipping-port";

/**
 * Fallback printable packing slip when Delhivery PDF is unavailable.
 * Uses Code 128 (JsBarcode CDN) — Delhivery's documented encoding for packing slips.
 */
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

  const sort = slip.sortCode || "—";
  const destLine = [slip.city, slip.pin].filter(Boolean).join(" ") || "—";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Delhivery label · ${esc(slip.awb)}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  <style>
    @page { size: 100mm 150mm; margin: 4mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; background: #fff; }
    .sheet { border: 2px solid #000; width: 92mm; padding: 0; }
    .hdr { display: flex; justify-content: space-between; align-items: center;
      border-bottom: 2px solid #000; padding: 6px 8px; }
    .brand { font-size: 16px; font-weight: 800; letter-spacing: 0.02em; }
    .mode { font-size: 12px; font-weight: 700; text-align: right; }
    .sort { text-align: center; font-size: 28px; font-weight: 800; padding: 8px 6px 4px;
      border-bottom: 1px solid #000; letter-spacing: 0.04em; }
    .barcode-wrap { text-align: center; padding: 8px 4px 2px; border-bottom: 1px solid #000; }
    .barcode-wrap svg { max-width: 100%; height: 48px; }
    .awb { text-align: center; font-size: 18px; font-weight: 800; letter-spacing: 0.08em;
      padding: 2px 0 8px; }
    .block { padding: 8px; border-bottom: 1px solid #000; font-size: 12px; line-height: 1.35; }
    .block:last-child { border-bottom: 0; }
    .k { color: #444; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    .v { font-weight: 700; margin-top: 2px; }
    .addr { font-weight: 600; white-space: pre-wrap; }
    .actions { margin-top: 12px; }
    @media print { .actions { display: none; } body { print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hdr">
      <div class="brand">DELHIVERY</div>
      <div class="mode">${esc(slip.shippingMode || "Surface")}<br/>${esc(slip.paymentMode || "—")}</div>
    </div>
    <div class="sort">${esc(sort)}</div>
    <div class="barcode-wrap">
      <svg id="awbBarcode"></svg>
      <div class="awb">${esc(slip.awb)}</div>
    </div>
    <div class="block">
      <div class="k">Ship to</div>
      <div class="v">${esc(slip.name || "—")}</div>
      <div class="addr">${esc(slip.address || "—")}</div>
      <div class="v">${esc(destLine)}</div>
      <div>Phone: ${esc(slip.phone || "—")}</div>
    </div>
    <div class="block">
      <div class="k">Order</div>
      <div class="v">${esc(orderNumber)}</div>
      ${slip.oid ? `<div class="k" style="margin-top:6px">OID</div><div>${esc(slip.oid)}</div>` : ""}
    </div>
    ${input.partnerNote ? `<div class="block">${esc(input.partnerNote)}</div>` : ""}
  </div>
  <div class="actions">
    <button onclick="window.print()">Print label</button>
    <p style="font-size:11px;color:#666">Fallback HTML label (Code 128). Prefer Delhivery PDF when available.</p>
  </div>
  <script>
    (function () {
      var awb = ${JSON.stringify(slip.awb)};
      try {
        JsBarcode("#awbBarcode", awb, {
          format: "CODE128",
          displayValue: false,
          margin: 0,
          height: 56,
          width: 1.6
        });
      } catch (e) {}
      window.addEventListener("load", function () {
        setTimeout(function () { window.print(); }, 350);
      });
    })();
  </script>
</body>
</html>`;
}
