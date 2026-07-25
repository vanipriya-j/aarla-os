"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Field, FormSection, inputClass, selectClass, textareaClass } from "@/components/ui/FormSection";
import { StatusChip, statusToneFromLabel } from "@/components/ui/StatusChip";
import { listContentTasksAction, listProductsAction } from "@/app/actions/app-actions";
import type { ContentFormat, ContentStatus, ContentTask } from "@/lib/types";
import { CalendarDays, Kanban, Plus } from "lucide-react";

const formats: ContentFormat[] = [
  "Instagram post",
  "Reel",
  "LinkedIn post",
  "Pinterest post",
  "WhatsApp creative",
  "Product story",
  "Founder video",
  "Culture Conversation",
  "Aarla Pick",
];

const boardColumns: ContentStatus[] = [
  "Idea",
  "Draft",
  "In Production",
  "Review",
  "Scheduled",
  "Published",
];

export default function ContentPage() {
  const [tasks, setTasks] = useState<ContentTask[]>([]);
  const [products, setProducts] = useState<{ id: string; title: string }[]>([]);
  const [view, setView] = useState<"board" | "calendar" | "create">("board");
  const [createdToast, setCreatedToast] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    title: "",
    product: "",
    world: "Muruga",
    platform: "Instagram",
    format: "Reel" as ContentFormat,
    dueDate: "2026-08-05",
    status: "Idea" as ContentStatus,
    captionDraft: "",
  });

  useEffect(() => {
    void (async () => {
      const [tasksRes, productsRes] = await Promise.all([
        listContentTasksAction(),
        listProductsAction(),
      ]);
      if (!tasksRes.ok) {
        setError(tasksRes.error);
        return;
      }
      if (!productsRes.ok) {
        setError(productsRes.error);
        return;
      }
      setTasks(tasksRes.data as ContentTask[]);
      setProducts(productsRes.data.map((p) => ({ id: p.id, title: p.title })));
      setDraft((d) => ({
        ...d,
        product: d.product || productsRes.data[0]?.title || "",
      }));
    })();
  }, []);

  const createTask = () => {
    const id = `ct-${Date.now()}`;
    setTasks((prev) => [
      {
        id,
        title: draft.title || `${draft.format} — ${draft.product}`,
        product: draft.product,
        world: draft.world,
        platform: draft.platform,
        format: draft.format,
        dueDate: draft.dueDate,
        status: draft.status,
        captionDraft: draft.captionDraft || "Caption draft pending…",
        assets: [
          { label: "Hero asset", done: false },
          { label: "Caption draft", done: !!draft.captionDraft },
          { label: "CTA / link", done: false },
        ],
      },
      ...prev,
    ]);
    setCreatedToast(true);
    setView("board");
    setTimeout(() => setCreatedToast(false), 2000);
  };

  const calendarDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date("2026-07-23");
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  return (
    <>
      <Header
        title="Content Studio"
        subtitle="Stories, reels, picks and culture conversations — planned with calm."
        actions={
          <div className="flex gap-2">
            <Button
              variant={view === "board" ? "primary" : "outline"}
              size="sm"
              onClick={() => setView("board")}
            >
              <Kanban className="h-4 w-4" />
              Board
            </Button>
            <Button
              variant={view === "calendar" ? "primary" : "outline"}
              size="sm"
              onClick={() => setView("calendar")}
            >
              <CalendarDays className="h-4 w-4" />
              Calendar
            </Button>
            <Button size="sm" onClick={() => setView("create")}>
              <Plus className="h-4 w-4" />
              New task
            </Button>
          </div>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6">
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        {createdToast ? (
          <div className="rounded-xl bg-muted-green/30 border border-muted-green/50 px-4 py-3 text-sm text-deep-navy">
            Content task created.
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {formats.map((f) => (
            <StatusChip key={f} label={f} tone="neutral" />
          ))}
        </div>

        {view === "create" ? (
          <FormSection title="Create content task" className="max-w-3xl">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Title">
                <input
                  className={inputClass}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g. Muruga bottle shelf story"
                />
              </Field>
              <Field label="Product">
                <select
                  className={selectClass}
                  value={draft.product}
                  onChange={(e) => setDraft({ ...draft, product: e.target.value })}
                >
                  {products.map((p) => (
                    <option key={p.id}>{p.title}</option>
                  ))}
                </select>
              </Field>
              <Field label="World">
                <input
                  className={inputClass}
                  value={draft.world}
                  onChange={(e) => setDraft({ ...draft, world: e.target.value })}
                />
              </Field>
              <Field label="Platform">
                <select
                  className={selectClass}
                  value={draft.platform}
                  onChange={(e) => setDraft({ ...draft, platform: e.target.value })}
                >
                  {["Instagram", "LinkedIn", "Pinterest", "WhatsApp", "Website"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="Format">
                <select
                  className={selectClass}
                  value={draft.format}
                  onChange={(e) => setDraft({ ...draft, format: e.target.value as ContentFormat })}
                >
                  {formats.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </Field>
              <Field label="Due date">
                <input
                  className={inputClass}
                  type="date"
                  value={draft.dueDate}
                  onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
                />
              </Field>
              <Field label="Status">
                <select
                  className={selectClass}
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as ContentStatus })}
                >
                  {boardColumns.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Caption draft">
                <textarea
                  className={textareaClass}
                  value={draft.captionDraft}
                  onChange={(e) => setDraft({ ...draft, captionDraft: e.target.value })}
                />
              </Field>
            </div>
            <div className="pt-1">
              <p className="text-sm font-medium text-deep-navy mb-2">Asset checklist</p>
              <div className="flex flex-wrap gap-2 text-sm text-charcoal/65">
                <StatusChip label="Hero asset" />
                <StatusChip label="Caption draft" />
                <StatusChip label="CTA / link" />
              </div>
            </div>
            <Button onClick={createTask}>Create task</Button>
          </FormSection>
        ) : null}

        {view === "board" ? (
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-4 min-w-max">
              {boardColumns.map((col) => (
                <div key={col} className="w-72 shrink-0">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h3 className="text-sm font-semibold text-deep-navy">{col}</h3>
                    <span className="text-xs text-charcoal/45">
                      {tasks.filter((t) => t.status === col).length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {tasks
                      .filter((t) => t.status === col)
                      .map((t) => (
                        <div key={t.id} className="card-surface p-4">
                          <p className="text-sm font-medium text-deep-navy leading-snug">{t.title}</p>
                          <p className="text-xs text-charcoal/55 mt-1">
                            {t.format} · {t.platform}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {t.world ? <StatusChip label={t.world} tone="info" /> : null}
                            <StatusChip label={`Due ${t.dueDate}`} tone="neutral" />
                          </div>
                          <p className="mt-3 text-xs text-charcoal/65 line-clamp-2">{t.captionDraft}</p>
                          <div className="mt-3 space-y-1">
                            {t.assets.map((a) => (
                              <p key={a.label} className="text-[11px] text-charcoal/55">
                                {a.done ? "✓" : "○"} {a.label}
                              </p>
                            ))}
                          </div>
                          <select
                            className="mt-3 w-full text-xs rounded-lg border border-border px-2 py-1.5 bg-pale-cream"
                            value={t.status}
                            onChange={(e) =>
                              setTasks((prev) =>
                                prev.map((x) =>
                                  x.id === t.id
                                    ? { ...x, status: e.target.value as ContentStatus }
                                    : x,
                                ),
                              )
                            }
                          >
                            {boardColumns.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {view === "calendar" ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-7 gap-3">
            {calendarDays.map((day) => {
              const dayTasks = tasks.filter((t) => t.dueDate === day);
              return (
                <div key={day} className="card-surface-pale p-3 min-h-[120px]">
                  <p className="text-xs font-medium text-deep-navy mb-2">{day.slice(5)}</p>
                  <div className="space-y-1.5">
                    {dayTasks.map((t) => (
                      <div
                        key={t.id}
                        className="rounded-lg bg-white border border-border px-2 py-1.5 text-[11px] text-charcoal/80"
                      >
                        <p className="font-medium line-clamp-2">{t.title}</p>
                        <StatusChip
                          label={t.status}
                          tone={statusToneFromLabel(t.status)}
                          className="mt-1"
                        />
                      </div>
                    ))}
                    {dayTasks.length === 0 ? (
                      <p className="text-[11px] text-charcoal/35">—</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </main>
    </>
  );
}
