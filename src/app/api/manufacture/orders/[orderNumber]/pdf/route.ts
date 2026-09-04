import { NextResponse } from "next/server";
import {
  generateVendorOrderPdf,
  getLatestVendorOrderPdf,
} from "@/lib/application/vendor-order-document-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ orderNumber: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { orderNumber } = await ctx.params;
    const decoded = decodeURIComponent(orderNumber);
    let pdf = await getLatestVendorOrderPdf(decoded);
    if (!pdf?.bytes) {
      const gen = await generateVendorOrderPdf(decoded);
      pdf = { ...gen.version, bytes: gen.bytes };
    }
    if (!pdf.bytes) {
      return NextResponse.json({ ok: false, error: "PDF not found" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(pdf.bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${decoded}-v${pdf.versionNumber}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
