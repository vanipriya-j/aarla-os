import { NextResponse } from "next/server";
import { assertSetupSecret, bootstrapDatabase } from "@/lib/infra/db/bootstrap";
import { diagnoseDatabaseUrl, probeDatabaseConnection } from "@/lib/infra/db/diagnose";
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
      /setup secret/i.test(message)
        ? 401
        : err instanceof ConfigurationError
          ? 503
          : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function GET(request: Request) {
  const hasSecret = Boolean(process.env.SETUP_SECRET?.trim());
  const raw =
    process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim() || "";
  const hasDatabaseUrl = Boolean(raw);
  const diagnosis = diagnoseDatabaseUrl(raw || null);

  const probe = new URL(request.url).searchParams.get("probe") === "1";
  if (!probe) {
    return NextResponse.json({
      ok: true,
      ready: hasSecret && hasDatabaseUrl && diagnosis.okForVercel,
      hasSetupSecret: hasSecret,
      hasDatabaseUrl,
      database: diagnosis,
    });
  }

  const result = await probeDatabaseConnection();
  return NextResponse.json({
    ok: true,
    ready: hasSecret && result.connected,
    hasSetupSecret: hasSecret,
    hasDatabaseUrl,
    database: result.diagnosis,
    connected: result.connected,
    connectError: result.error,
  });
}
