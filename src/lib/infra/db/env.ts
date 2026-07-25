import { ConfigurationError } from "./errors";

/**
 * Resolve the Postgres connection string.
 *
 * Priority:
 * 1. DATABASE_URL (local Docker, Supabase Local, or Supabase Cloud direct URI)
 * 2. SUPABASE_DB_URL (explicit cloud DB URI from Supabase dashboard)
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
        "For Vercel: add the Supabase Postgres connection string in Project → Settings → Environment Variables. " +
        "See docs/supabase-vercel.md.",
    );
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
