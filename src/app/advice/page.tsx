"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { listAdviceAction, listTipPromptsAction } from "@/app/actions/app-actions";
import { MessageCircle, Send, Sparkles, User } from "lucide-react";

type Message = { role: "user" | "assistant"; text: string; actions?: { label: string; href: string }[] };
type AdviceHit = { answer: string; actions: { label: string; href: string }[] };

function parseAdviceBody(body: string): AdviceHit | null {
  try {
    const parsed = JSON.parse(body) as AdviceHit;
    if (parsed && typeof parsed.answer === "string") return parsed;
  } catch {
    /* plain text */
  }
  return null;
}

function AdviceInner() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [input, setInput] = useState(initialQ);
  const [sampleAdvice, setSampleAdvice] = useState<Record<string, AdviceHit>>({});
  const [tipPrompts, setTipPrompts] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "I'm your founder copilot. Ask about manufacturing, inventory, hampers, sourcing trips, or what to prioritise this week. I'll answer from Aarla's demo operating data.",
    },
  ]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [adviceRes, tipsRes] = await Promise.all([
        listAdviceAction(),
        listTipPromptsAction(),
      ]);
      if (cancelled) return;
      const map: Record<string, AdviceHit> = {};
      if (adviceRes.ok) {
        for (const row of adviceRes.data) {
          const hit = parseAdviceBody(row.body);
          if (hit) map[row.matchKey] = hit;
        }
      }
      setSampleAdvice(map);
      if (tipsRes.ok) setTipPrompts(tipsRes.data);
      if (initialQ) {
        const hit = map[initialQ];
        setMessages([
          { role: "user", text: initialQ },
          hit
            ? { role: "assistant", text: hit.answer, actions: hit.actions }
            : {
                role: "assistant",
                text: `Looking at Aarla's current picture for “${initialQ}”: bottle inventory is healthy with PO-2401 inbound; magnets can support festival volume; brass is the tightest SKU. I'd open a short project, confirm MOQs with the relevant vendor, and add a receive-stock checkpoint to priorities.`,
                actions: [
                  { label: "Create Project", href: "/projects" },
                  { label: "Start Manufacturing", href: "/manufacture" },
                  { label: "Review Inventory", href: "/dashboard" },
                ],
              },
        ]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialQ]);

  const ask = (q: string) => {
    const query = q.trim();
    if (!query) return;
    const hit = sampleAdvice[query];
    const reply: Message = hit
      ? { role: "assistant", text: hit.answer, actions: hit.actions }
      : {
          role: "assistant",
          text: `Based on Aarla data for “${query}”: Navarathri season favours books, magnets and Lakshmi objects; capital is most blocked in framed art and trays; Muruga bottles remain a strong attach SKU. Suggested path — explore the idea, convert one opportunity into a project, then raise a quick manufacturing order if MOQ fits.`,
          actions: [
            { label: "Explore an Idea", href: "/explore" },
            { label: "Create Project", href: "/projects" },
            { label: "Build Hamper", href: "/story" },
            { label: "Add to Priorities", href: "/" },
          ],
        };
    setMessages((prev) => [...prev, { role: "user", text: query }, reply]);
    setInput("");
  };

  const handleAction = (label: string) => {
    if (label === "Add to Priorities") {
      setToast("Added to today's priorities (simulated).");
      setTimeout(() => setToast(null), 2500);
    }
  };

  const prompts = useMemo(() => tipPrompts, [tipPrompts]);

  return (
    <>
      <Header
        title="Need Advice"
        subtitle="A calm founder copilot grounded in Aarla's operating reality."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 max-w-5xl">
        {toast ? (
          <div className="mb-4 rounded-xl bg-muted-green/30 border border-muted-green/50 px-4 py-3 text-sm text-deep-navy">
            {toast}
          </div>
        ) : null}

        <div className="card-surface overflow-hidden flex flex-col min-h-[560px]">
          <div className="px-5 py-4 border-b border-border bg-pale-cream flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-aarla-red" />
            <p className="text-sm font-medium text-deep-navy">Ask Aarla</p>
          </div>

          <div className="flex-1 p-5 space-y-4 overflow-y-auto">
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" ? (
                  <div className="h-9 w-9 rounded-full bg-aarla-red/10 text-aarla-red flex items-center justify-center shrink-0">
                    <MessageCircle className="h-4 w-4" />
                  </div>
                ) : null}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-deep-navy text-white rounded-br-md"
                      : "bg-pale-cream border border-border text-charcoal rounded-bl-md"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.actions ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.actions.map((a) =>
                        a.label === "Add to Priorities" ? (
                          <Button
                            key={a.label}
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction(a.label)}
                          >
                            {a.label}
                          </Button>
                        ) : (
                          <Link key={a.label} href={a.href}>
                            <Button size="sm" variant={a.label.includes("Create") || a.label.includes("Start") ? "primary" : "outline"}>
                              {a.label}
                            </Button>
                          </Link>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
                {m.role === "user" ? (
                  <div className="h-9 w-9 rounded-full bg-soft-beige text-deep-navy flex items-center justify-center shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-border bg-white space-y-3">
            <div className="flex flex-wrap gap-2">
              {prompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => ask(p)}
                  className="text-xs rounded-full border border-border px-3 py-1.5 text-charcoal/70 hover:border-aarla-red/40 hover:text-aarla-red"
                >
                  {p}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about manufacturing, hampers, capital…"
                className="flex-1 rounded-xl border border-border bg-pale-cream px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-aarla-red/25"
              />
              <Button type="submit" size="lg">
                <Send className="h-4 w-4" />
                Send
              </Button>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}

export default function AdvicePage() {
  return (
    <Suspense
      fallback={
        <>
          <Header title="Need Advice" subtitle="Loading…" />
          <main className="px-8 py-8">Loading advisor…</main>
        </>
      }
    >
      <AdviceInner />
    </Suspense>
  );
}
