import { NextResponse } from "next/server";
import { assertSetupSecret, bootstrapDatabase } from "@/lib/infra/db/bootstrap";
import { ConfigurationError } from "@/lib/infra/db/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  secret?: string;
  seed?: boolean;
};

export async function POST(request: Request) {
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  try {
    assertSetupSecret(body.secret ?? request.headers.get("x-setup-secret"));
    const result = await bootstrapDatabase({ seed: body.seed !== false });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      message === "Invalid setup secret."
        ? 401
        : err instanceof ConfigurationError
          ? 503
          : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function GET() {
  const hasSecret = Boolean(process.env.SETUP_SECRET?.trim());
  let hasDatabaseUrl = false;
  try {
    hasDatabaseUrl = Boolean(
      process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim(),
    );
  } catch {
    hasDatabaseUrl = false;
  }
  return NextResponse.json({
    ok: true,
    ready: hasSecret && hasDatabaseUrl,
    hasSetupSecret: hasSecret,
    hasDatabaseUrl,
  });
}
