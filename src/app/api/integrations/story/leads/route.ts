import { NextResponse } from "next/server";
import { ingestStoryLead } from "@/lib/application/story-lead-service";
import { assertStoryLeadsAuth } from "@/lib/auth/story-leads-auth";
import { STORY_MODULE } from "@/lib/domain/story-lead-types";
import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function toErrorMessage(err: unknown): string {
  if (err instanceof DatabaseUnavailableError || err instanceof ConfigurationError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * POST /api/integrations/story/leads
 *
 * Inbound leads for Your Story. Our Telling. (GYVFT public forms).
 *
 * Auth (prefer Bearer):
 *   Authorization: Bearer <STORY_LEADS_API_KEY>
 *   or x-aarla-story-leads-key: <STORY_LEADS_API_KEY>
 * HMAC alternative:
 *   X-Aarla-Timestamp: <unix seconds>
 *   X-Aarla-Signature: sha256=<hex(hmac_sha256(secret, `${timestamp}.${rawBody}`))>
 *   skew ±300s
 *
 * Idempotent on idempotency_key — duplicate returns the same lead_id (200).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const auth = assertStoryLeadsAuth(request, rawBody);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, code: auth.code, error: auth.error },
      { status: auth.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "validation_error",
        error: "Request body must be JSON.",
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await ingestStoryLead(body);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, ...result.body },
        { status: result.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      {
        ok: true,
        lead_id: result.lead.id,
        module: STORY_MODULE,
        form_key: result.lead.formKey,
        lead_type: result.lead.leadType,
        created: result.lead.created,
      },
      {
        status: result.status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        code: "server_error",
        error: toErrorMessage(err),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
