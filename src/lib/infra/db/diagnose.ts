import dns from "node:dns";
import { Client } from "pg";
import { resolveDatabaseUrl, shouldUseSsl } from "./env";

export type DatabaseUrlKind =
  | "missing"
  | "https_api"
  | "direct"
  | "session_pooler"
  | "transaction_pooler"
  | "local"
  | "other";

export type DatabaseUrlDiagnosis = {
  kind: DatabaseUrlKind;
  host: string | null;
  port: number | null;
  user: string | null;
  warning: string | null;
  okForVercel: boolean;
};

function redactUrl(raw: string): DatabaseUrlDiagnosis {
  try {
    // Support postgres:// and postgresql://; also detect pasted https API URLs.
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      return {
        kind: "https_api",
        host: u.hostname,
        port: u.port ? Number(u.port) : 443,
        user: null,
        warning:
          "This is the Supabase API URL, not the Postgres URI. Use Connect → Session pooler → URI.",
        okForVercel: false,
      };
    }

    const normalized = raw.replace(/^postgres(ql)?:/i, "http:");
    const u = new URL(normalized);
    const host = u.hostname;
    const port = u.port ? Number(u.port) : 5432;
    const user = decodeURIComponent(u.username || "");

    if (host === "localhost" || host === "127.0.0.1") {
      return {
        kind: "local",
        host,
        port,
        user: user || null,
        warning: null,
        okForVercel: false,
      };
    }

    if (host.startsWith("db.") && host.endsWith(".supabase.co")) {
      return {
        kind: "direct",
        host,
        port,
        user: user || null,
        warning:
          "Direct db.*.supabase.co often times out on Vercel (IPv6). Use Session pooler instead.",
        okForVercel: false,
      };
    }

    if (host.includes("pooler.supabase.com") && port === 6543) {
      return {
        kind: "transaction_pooler",
        host,
        port,
        user: user || null,
        warning:
          "Transaction pooler (6543) can break migrations. Prefer Session pooler port 5432.",
        okForVercel: true,
      };
    }

    if (host.includes("pooler.supabase.com")) {
      const userOk = user.includes(".");
      return {
        kind: "session_pooler",
        host,
        port,
        user: user || null,
        warning: userOk
          ? null
          : "Pooler username usually looks like postgres.YOUR_REF (with a dot), not just postgres.",
        okForVercel: true,
      };
    }

    if (host.endsWith(".supabase.co") && !host.startsWith("db.")) {
      return {
        kind: "https_api",
        host,
        port,
        user: user || null,
        warning:
          "This looks like a Supabase project host, not the pooler Postgres URI.",
        okForVercel: false,
      };
    }

    return {
      kind: "other",
      host,
      port,
      user: user || null,
      warning: null,
      okForVercel: true,
    };
  } catch {
    return {
      kind: "other",
      host: null,
      port: null,
      user: null,
      warning: "DATABASE_URL could not be parsed. Paste the full postgresql:// URI.",
      okForVercel: false,
    };
  }
}

export function diagnoseDatabaseUrl(
  raw?: string | null,
): DatabaseUrlDiagnosis {
  const url = raw?.trim() || "";
  if (!url) {
    return {
      kind: "missing",
      host: null,
      port: null,
      user: null,
      warning: "DATABASE_URL is not set on this deployment.",
      okForVercel: false,
    };
  }
  return redactUrl(url);
}

export async function probeDatabaseConnection(): Promise<{
  diagnosis: DatabaseUrlDiagnosis;
  connected: boolean;
  error: string | null;
}> {
  let url: string;
  try {
    url = resolveDatabaseUrl();
  } catch (err) {
    return {
      diagnosis: diagnoseDatabaseUrl(null),
      connected: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const diagnosis = diagnoseDatabaseUrl(url);
  if (!diagnosis.okForVercel && diagnosis.kind !== "transaction_pooler") {
    return {
      diagnosis,
      connected: false,
      error: diagnosis.warning,
    };
  }

  // Prefer IPv4 — Vercel cannot use Supabase direct IPv6.
  dns.setDefaultResultOrder("ipv4first");

  const client = new Client({
    connectionString: url,
    ssl: shouldUseSsl(url) ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 12_000,
  });

  try {
    await client.connect();
    await client.query("select 1 as ok");
    return { diagnosis, connected: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      diagnosis,
      connected: false,
      error: message,
    };
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}
