import { NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/request-auth";
import { getDelhiveryLabelHtmlForFulfilment } from "@/lib/application/delhivery-shipping-service";
import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const auth = await getRequestAuth();
    if (auth.authEnabled && auth.role === "crm") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await ctx.params;
    const { html, awb } = await getDelhiveryLabelHtmlForFulfilment({
      fulfilmentOrderId: id,
    });
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="delhivery-${awb}.html"`,
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
