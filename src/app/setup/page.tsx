"use client";

import { useEffect, useState, useTransition } from "react";

type Status = {
  ready: boolean;
  hasSetupSecret: boolean;
  hasDatabaseUrl: boolean;
};

export default function SetupPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [secret, setSecret] = useState("");
  const [seed, setSeed] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void fetch("/api/setup")
      .then((r) => r.json())
      .then((data: Status) => setStatus(data))
      .catch(() =>
        setStatus({ ready: false, hasSetupSecret: false, hasDatabaseUrl: false }),
      );
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

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#fbf7ef_0%,_#f6eedc_45%,_#e8d8bc_100%)] px-6 py-16 text-charcoal">
      <div className="mx-auto max-w-lg">
        <p className="font-serif text-4xl tracking-tight text-deep-navy">Aarla OS</p>
        <h1 className="mt-3 text-xl font-medium text-deep-navy">Database setup</h1>
        <p className="mt-2 text-sm leading-relaxed text-charcoal/80">
          No laptop needed. Create a Supabase project, paste its database URL into
          Vercel as <code className="text-deep-navy">DATABASE_URL</code>, set a{" "}
          <code className="text-deep-navy">SETUP_SECRET</code>, redeploy, then run
          this once.
        </p>

        <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-charcoal/85">
          <li>
            Supabase dashboard → New project → save the database password
          </li>
          <li>
            Settings → Database → Connection string → Method:{" "}
            <strong>Session pooler</strong> → URI (host must contain{" "}
            <code>pooler.supabase.com</code> — direct{" "}
            <code>db.…supabase.co</code> times out on Vercel)
          </li>
          <li>
            Vercel → aarla-os → Settings → Environment Variables (tick{" "}
            <strong>Preview</strong> and Production, no quotes around values):
            <ul className="mt-1 list-disc pl-5">
              <li>
                <code>DATABASE_URL</code> = Supabase URI
              </li>
              <li>
                <code>SETUP_SECRET</code> = a phrase you invent, e.g.{" "}
                <code>aarla-setup-4917</code>
              </li>
            </ul>
          </li>
          <li>
            Deployments → ⋯ on this Preview → <strong>Redeploy</strong> (env vars
            only apply after redeploy)
          </li>
          <li>Paste the same phrase below → Initialize</li>
        </ol>

        {status && (
          <ul className="mt-6 space-y-1 text-sm">
            <li>
              DATABASE_URL:{" "}
              <span className={status.hasDatabaseUrl ? "text-muted-green" : "text-aarla-red"}>
                {status.hasDatabaseUrl ? "set" : "missing"}
              </span>
            </li>
            <li>
              SETUP_SECRET:{" "}
              <span className={status.hasSetupSecret ? "text-muted-green" : "text-aarla-red"}>
                {status.hasSetupSecret ? "set" : "missing"}
              </span>
            </li>
          </ul>
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
