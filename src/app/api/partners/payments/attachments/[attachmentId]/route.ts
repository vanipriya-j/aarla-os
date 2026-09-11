import { NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/request-auth";
import { PartnerCommerceService } from "@/lib/application/partner-commerce-service";

/** Authenticated payment screenshot — not public. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const auth = await getRequestAuth();
  if (auth.authEnabled && auth.role === "crm") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { attachmentId } = await context.params;
  const file = await PartnerCommerceService.getPaymentAttachment(attachmentId);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.content), {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
