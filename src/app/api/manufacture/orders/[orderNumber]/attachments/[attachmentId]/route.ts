import { NextResponse } from "next/server";
import { getVendorOrderItemAttachment } from "@/lib/infra/repositories/postgres-manufacture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ orderNumber: string; attachmentId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { orderNumber, attachmentId } = await ctx.params;
    const decoded = decodeURIComponent(orderNumber);
    const file = await getVendorOrderItemAttachment({
      orderNumber: decoded,
      attachmentId,
    });
    if (!file) {
      return NextResponse.json({ ok: false, error: "Attachment not found" }, { status: 404 });
    }
    const safeName = file.filename.replace(/"/g, "");
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        "content-type": file.mimeType || "application/octet-stream",
        "content-disposition": `inline; filename="${safeName}"`,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
