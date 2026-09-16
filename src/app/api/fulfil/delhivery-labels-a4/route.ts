import { NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/request-auth";
import { buildDelhiveryA4LabelsPdf } from "@/lib/application/delhivery-shipping-service";
import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import type { FulfilmentTab } from "@/lib/domain/fulfilment-types";
import { FULFILMENT_TABS } from "@/lib/domain/fulfilment-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Collated A4 PDF: 2 official Delhivery shipping labels per page.
 * Query: ?tab=todays-dispatch  OR  ?ids=uuid,uuid
 */
export async function GET(req: Request) {
  try {
    const auth = await getRequestAuth();
    if (auth.authEnabled && auth.role === "crm") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const idsRaw = url.searchParams.get("ids")?.trim() || "";
    const ids = idsRaw
      ? idsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
    const tabRaw = url.searchParams.get("tab")?.trim() || "todays-dispatch";
    const tab = (FULFILMENT_TABS as readonly string[]).includes(tabRaw)
      ? (tabRaw as FulfilmentTab)
      : "todays-dispatch";

    const built = await buildDelhiveryA4LabelsPdf({
      fulfilmentOrderIds: ids,
      tab: ids?.length ? undefined : tab,
    });

    const filename = `delhivery-labels-a4-${built.awbs.length}.pdf`;
    return new NextResponse(Buffer.from(built.pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Delhivery-Label-Count": String(built.awbs.length),
        "X-Delhivery-Skipped": String(built.skipped.length),
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
