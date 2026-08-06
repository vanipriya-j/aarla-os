"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { StatusChip } from "@/components/ui/StatusChip";
import type { AuthSession } from "@/lib/auth/session-types";

type SessionsResponse = {
  sessions?: AuthSession[];
  currentSessionId?: string | null;
  error?: string;
};

function shortAgent(ua: string | null): string {
  if (!ua) return "Unknown client";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  return ua.slice(0, 48);
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function AdminSessionsPanel() {
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/auth/sessions", { cache: "no-store" });
        const body = (await res.json()) as SessionsResponse;
        if (!res.ok) {
          setError(body.error || "Could not load sessions");
          return;
        }
        setSessions(body.sessions || []);
        setCurrentSessionId(body.currentSessionId ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function revokeOne(id: string) {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      try {
        const res = await fetch(`/api/auth/sessions/${id}`, { method: "DELETE" });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(body.error || "Revoke failed");
          return;
        }
        setMessage("Session signed out.");
        load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function revokeOthers() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      try {
        const res = await fetch("/api/auth/sessions/revoke-others", {
          method: "POST",
        });
        const body = (await res.json()) as {
          error?: string;
          revokedCount?: number;
        };
        if (!res.ok) {
          setError(body.error || "Revoke failed");
          return;
        }
        setMessage(
          `Signed out ${body.revokedCount ?? 0} other session${
            (body.revokedCount ?? 0) === 1 ? "" : "s"
          }.`,
        );
        load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <section className="space-y-4" data-testid="admin-sessions-panel">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={load}
          disabled={pending}
          className="text-sm rounded-full px-4 py-2 border border-border bg-white text-deep-navy disabled:opacity-60"
        >
          Refresh
        </button>
        <button
          type="button"
          data-testid="revoke-other-sessions"
          onClick={revokeOthers}
          disabled={pending || sessions.length <= 1}
          className="text-sm rounded-full px-4 py-2 bg-deep-navy text-white disabled:opacity-60"
        >
          Sign out other sessions
        </button>
      </div>

      {pending ? <StatusChip label="Working…" tone="neutral" /> : null}
      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
      {message ? <p className="text-sm text-muted-green">{message}</p> : null}

      {sessions.length === 0 ? (
        <p className="text-sm text-charcoal/55">No active sessions.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-xl bg-white/70">
          {sessions.map((s) => {
            const isCurrent = s.id === currentSessionId;
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                data-testid={`session-row-${s.id}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-deep-navy">
                    {s.username}
                    <span className="text-charcoal/45 font-normal"> · {s.role}</span>
                    {isCurrent ? (
                      <span className="ml-2 text-xs text-aarla-red">This device</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-charcoal/55 truncate">
                    {shortAgent(s.userAgent)}
                    {s.ip ? ` · ${s.ip}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-charcoal/45">
                    Last seen {formatWhen(s.lastSeenAt)}
                  </p>
                </div>
                {!isCurrent ? (
                  <button
                    type="button"
                    onClick={() => revokeOne(s.id)}
                    disabled={pending}
                    className="text-sm text-aarla-red hover:underline disabled:opacity-60"
                  >
                    Sign out
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
