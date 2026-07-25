"use client";

import { useEffect, useState, useTransition } from "react";

type Diagnosis = {
  kind: string;
  host: string | null;
  port: number | null;
  user: string | null;
  warning: string | null;
  okForVercel: boolean;
};

type Status = {
  ready: boolean;
  hasSetupSecret: boolean;
  hasDatabaseUrl: boolean;
  database?: Diagnosis;
  connected?: boolean;
  connectError?: string | null;
};

export default function SetupPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [secret, setSecret] = useState("");
  const [seed, setSeed] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [probing, setProbing] = useState(false);

  function loadStatus(probe = false) {
    const url = probe ? "/api/setup?probe=1" : "/api/setup";
    if (probe) setProbing(true);
    void fetch(url)
      .then((r) => r.json())
      .then((data: Status) => setStatus(data))
      .catch(() =>
        setStatus({ ready: false, hasSetupSecret: false, hasDatabaseUrl: false }),
      )
      .finally(() => setProbing(false));
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/setup")
      .then((r) => r.json())
      .then((data: Status) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ ready: false, hasSetupSecret: false, hasDatabaseUrl: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function runSetup() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret, seed }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          error?: string;
          migrated?: string[];
          skippedMigrations?: string[];
          seeded?: boolean;
        };
        if (!data.ok) {
          setError(data.error ?? "Setup failed");
          return;
        }
        setMessage(
          `Done. Migrations applied: ${data.migrated?.length ?? 0}, skipped: ${data.skippedMigrations?.length ?? 0}. Seeded: ${data.seeded ? "yes" : "no"}.`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const db = status?.database;

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#fbf7ef_0%,_#f6eedc_45%,_#e8d8bc_100%)] px-6 py-16 text-charcoal">
      <div className="mx-auto max-w-lg">
        <p className="font-serif text-4xl tracking-tight text-deep-navy">Aarla OS</p>
        <h1 className="mt-3 text-xl font-medium text-deep-navy">Database setup</h1>
        <p className="mt-2 text-sm leading-relaxed text-charcoal/80">
          Use the Supabase <strong>Session pooler</strong> Postgres URI — not the
          Project API URL.
        </p>

        <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-charcoal/85">
          <li>Supabase → open your project → top bar <strong>Connect</strong></li>
          <li>
            Choose <strong>Session pooler</strong> → copy <strong>URI</strong>{" "}
            (must contain <code>pooler.supabase.com</code>)
          </li>
          <li>
            Replace <code>[YOUR-PASSWORD]</code> with your DB password (encode{" "}
            <code>@ # %</code> etc.)
          </li>
          <li>
            Vercel → Environment Variables → set <code>DATABASE_URL</code> +{" "}
            <code>SETUP_SECRET</code> for <strong>Preview</strong> →{" "}
            <strong>Redeploy</strong>
          </li>
        </ol>

        {status && (
          <div className="mt-6 space-y-1 text-sm">
            <p>
              SETUP_SECRET:{" "}
              <span className={status.hasSetupSecret ? "text-muted-green" : "text-aarla-red"}>
                {status.hasSetupSecret ? "set" : "missing"}
              </span>
            </p>
            <p>
              DATABASE_URL:{" "}
              <span className={status.hasDatabaseUrl ? "text-muted-green" : "text-aarla-red"}>
                {status.hasDatabaseUrl ? "set" : "missing"}
              </span>
            </p>
            {db && (
              <>
                <p>
                  Detected: <code>{db.kind}</code>
                  {db.host ? (
                    <>
                      {" "}
                      → <code>{db.host}:{db.port}</code>
                      {db.user ? (
                        <>
                          {" "}
                          as <code>{db.user}</code>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </p>
                {db.warning && <p className="text-aarla-red">{db.warning}</p>}
                {status.connected === true && (
                  <p className="text-muted-green">Connection probe: ok</p>
                )}
                {status.connected === false && status.connectError && (
                  <p className="text-aarla-red">Connection probe: {status.connectError}</p>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => loadStatus(true)}
              disabled={probing}
              className="mt-2 text-sm text-deep-navy underline disabled:opacity-50"
            >
              {probing ? "Testing…" : "Test database connection"}
            </button>
          </div>
        )}

        <label className="mt-8 block text-sm font-medium text-deep-navy">
          Setup secret
          <input
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="mt-1.5 w-full border border-border-strong bg-white/80 px-3 py-2.5 text-charcoal outline-none focus:border-deep-navy"
            placeholder="Same value as SETUP_SECRET on Vercel"
          />
        </label>

        <label className="mt-4 flex items-center gap-2 text-sm text-charcoal/90">
          <input
            type="checkbox"
            checked={seed}
            onChange={(e) => setSeed(e.target.checked)}
          />
          Load demo data (products, stock movements, etc.)
        </label>

        <button
          type="button"
          disabled={pending || !secret}
          onClick={runSetup}
          className="mt-6 w-full bg-aarla-red px-4 py-3 text-sm font-medium text-white transition enabled:hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Initializing…" : "Initialize database"}
        </button>

        {message && (
          <p className="mt-4 text-sm text-deep-navy">
            {message}{" "}
            <a href="/inventory" className="underline">
              Open Inventory
            </a>
          </p>
        )}
        {error && <p className="mt-4 text-sm text-aarla-red">{error}</p>}
      </div>
    </main>
  );
}
