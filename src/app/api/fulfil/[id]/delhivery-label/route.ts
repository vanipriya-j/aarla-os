import { NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/request-auth";
import { getDelhiveryLabelForFulfilment } from "@/lib/application/delhivery-shipping-service";
import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Serve Delhivery's official shipping-label PDF when available (packing_slip?pdf=true).
 * Falls back to HTML Code 128 packing slip if the account does not return a PDF link.
 */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await getRequestAuth();
    if (auth.authEnabled && auth.role === "crm") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await ctx.params;
    const url = new URL(req.url);
    const sizeRaw = url.searchParams.get("size");
    const pdfSize = sizeRaw === "A4" ? "A4" : "4R";
    const forceHtml = url.searchParams.get("html") === "1";

    const label = await getDelhiveryLabelForFulfilment({
      fulfilmentOrderId: id,
      preferPdf: !forceHtml,
      pdfSize,
    });

    if (label.pdfBytes) {
      return new NextResponse(Buffer.from(label.pdfBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="delhivery-${label.awb}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (!label.html) {
      return NextResponse.json(
        { ok: false, error: "No Delhivery label available for this AWB." },
        { status: 404 },
      );
    }

    return new NextResponse(label.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="delhivery-${label.awb}.html"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      err instanceof ConfigurationError || err instanceof DatabaseUnavailableError
        ? 503
        : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
