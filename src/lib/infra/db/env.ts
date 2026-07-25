import { ConfigurationError } from "./errors";

/**
 * Resolve the Postgres connection string.
 *
 * Priority:
 * 1. DATABASE_URL (local Docker, Supabase Local, or Supabase Cloud URI)
 * 2. SUPABASE_DB_URL (explicit cloud DB URI from Supabase dashboard)
 *
 * On Vercel, Supabase Session pooler (port 5432) is rewritten to Transaction
 * pooler (port 6543) unless DATABASE_POOL_MODE=session — session mode caps at
 * ~15 clients and exhausts quickly with serverless.
 */
export function resolveDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    "";

  if (!url) {
    throw new ConfigurationError(
      "DATABASE_URL (or SUPABASE_DB_URL) is not set. " +
        "For local: copy .env.example → .env.local and run npm run db:start. " +
        "For Vercel: add the Supabase Transaction pooler URI (port 6543). " +
        "See docs/supabase-vercel.md.",
    );
  }
  return normalizeDatabaseUrlForRuntime(url);
}

/**
 * Prefer Transaction pooler on Vercel (port 6543) to avoid MaxClientsInSessionMode.
 */
export function normalizeDatabaseUrlForRuntime(url: string): string {
  if (process.env.DATABASE_POOL_MODE === "session") return url;
  if (process.env.DATABASE_POOL_MODE === "transaction") {
    return forceTransactionPoolerPort(url);
  }
  // Default on Vercel: transaction pooler
  if (process.env.VERCEL === "1") {
    return forceTransactionPoolerPort(url);
  }
  return url;
}

function forceTransactionPoolerPort(url: string): string {
  if (!url.includes("pooler.supabase.com")) return url;
  if (url.includes(":6543/")) return url;
  // Session pooler uses :5432 on the same host — flip to transaction mode.
  // String replace avoids re-encoding passwords via URL.toString().
  if (url.includes(":5432/")) {
    return url.replace(":5432/", ":6543/");
  }
  return url;
}

export function isRemoteSupabaseUrl(url: string): boolean {
  return (
    url.includes("supabase.co") ||
    url.includes("supabase.com") ||
    url.includes("pooler.supabase")
  );
}

function isLocalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/** Supabase Cloud / production Postgres requires TLS. Local Docker does not. */
export function shouldUseSsl(url: string): boolean {
  if (process.env.DATABASE_SSL === "true") return true;
  if (process.env.DATABASE_SSL === "false") return false;
  if (isLocalHost(url)) return false;
  if (isRemoteSupabaseUrl(url)) return true;
  if (process.env.VERCEL === "1") return true;
  return false;
}

export function getSupabaseProjectUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
}

/** Default pg pool size: 1 on Vercel (serverless), 10 locally. */
export function defaultPoolMax(): number {
  if (process.env.DATABASE_POOL_MAX) {
    return Number(process.env.DATABASE_POOL_MAX);
  }
  return process.env.VERCEL === "1" ? 1 : 10;
}
