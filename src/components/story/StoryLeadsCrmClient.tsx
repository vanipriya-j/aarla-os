"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  createManualStoryLeadAction,
  getStoryLeadAction,
  listStoryLeadsAction,
  markStoryLeadLostAction,
  markStoryLeadWonAction,
  updateStoryLeadAction,
} from "@/app/actions/story-leads-actions";
import { StoryLeadStatusChip } from "@/components/story/StoryLeadStatusChip";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import {
  Field,
  FormSection,
  inputClass,
  selectClass,
  textareaClass,
} from "@/components/ui/FormSection";
import { Modal } from "@/components/ui/Modal";
import { StatusChip } from "@/components/ui/StatusChip";
import { storyLeadManufactureHref } from "@/lib/domain/story-lead-manufacture-link";
import {
  STORY_FORM_KEYS,
  STORY_FORM_KEY_LABELS,
  STORY_LEAD_CRM_STATUSES,
  STORY_LEAD_STATUS_LABELS,
  STORY_PREFERRED_CONTACT_METHODS,
  normalizeStoryLeadStatus,
  type StoryFormKey,
  type StoryLeadCrmStatus,
  type StoryLeadDetail,
  type StoryLeadRecord,
  type StoryPreferredContactMethod,
} from "@/lib/domain/story-lead-types";
import { Factory, Plus, RefreshCw, ShoppingBag } from "lucide-react";

type StatusFilter = "open" | "closed" | "all" | StoryLeadCrmStatus;

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "reviewed", label: "Reviewed" },
  { id: "in_progress", label: "In Progress" },
  { id: "qualified", label: "Qualified" },
  { id: "proposal", label: "Proposal" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "closed", label: "Closed" },
  { id: "archived", label: "Archived" },
];

function sourceLabel(source: string): string {
  if (source === "gyvft") return "GYVFT";
  if (source === "aarla_os") return "Aarla OS";
  return source;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type EditDraft = {
  status: StoryLeadCrmStatus;
  fullName: string;
  email: string;
  phone: string;
  organisationName: string;
  designation: string;
  preferredContactMethod: string;
  storyDescription: string;
  occasionType: string;
  audiences: string;
  preferredFormats: string;
  targetDate: string;
  quantityRange: string;
  budgetRange: string;
  primaryCity: string;
  discussionTopic: string;
  timeline: string;
  additionalContext: string;
  notes: string;
  lostReason: string;
};

function draftFromLead(lead: StoryLeadDetail): EditDraft {
  return {
    status: normalizeStoryLeadStatus(lead.status),
    fullName: lead.fullName,
    email: lead.email,
    phone: lead.phone ?? "",
    organisationName: lead.organisationName ?? "",
    designation: lead.designation ?? "",
    preferredContactMethod: lead.preferredContactMethod ?? "",
    storyDescription: lead.storyDescription ?? "",
    occasionType: lead.occasionType ?? "",
    audiences: lead.audiences.join(", "),
    preferredFormats: lead.preferredFormats.join(", "),
    targetDate: lead.targetDate ?? "",
    quantityRange: lead.quantityRange ?? "",
    budgetRange: lead.budgetRange ?? "",
    primaryCity: lead.primaryCity ?? "",
    discussionTopic: lead.discussionTopic ?? "",
    timeline: lead.timeline ?? "",
    additionalContext: lead.additionalContext ?? "",
    notes: lead.notes ?? "",
    lostReason: lead.lostReason ?? "",
  };
}

function splitList(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const emptyCreate = {
  formKey: "tell_your_story" as StoryFormKey,
  fullName: "",
  email: "",
  phone: "",
  organisationName: "",
  designation: "",
  preferredContactMethod: "" as string,
  storyDescription: "",
  occasionType: "",
  quantityRange: "",
  budgetRange: "",
  primaryCity: "",
  notes: "",
};

export function StoryLeadsCrmClient() {
  const [leads, setLeads] = useState<StoryLeadRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StoryLeadDetail | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [formFilter, setFormFilter] = useState<StoryFormKey | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "gyvft" | "aarla_os">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState(emptyCreate);
  const [wonQty, setWonQty] = useState("1");
  const [wonPrice, setWonPrice] = useState("");

  const loadList = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const res = await listStoryLeadsAction({
        status: statusFilter,
        formKey: formFilter,
        source: sourceFilter,
        q: query.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        setLoaded(true);
        return;
      }
      setLeads(res.data);
      setLoaded(true);
      if (selectedId && !res.data.some((l) => l.id === selectedId)) {
        setSelectedId(null);
        setDetail(null);
        setDraft(null);
      }
    });
  }, [statusFilter, formFilter, sourceFilter, query, selectedId]);

  const loadDetail = useCallback((id: string) => {
    startTransition(async () => {
      setError(null);
      const res = await getStoryLeadAction(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDetail(res.data);
      setDraft(draftFromLead(res.data));
      setWonQty(
        String(
          Math.max(
            1,
            Number((res.data.quantityRange ?? "").match(/\d+/g)?.pop() ?? 1) || 1,
          ),
        ),
      );
      setWonPrice(
        (res.data.budgetRange ?? "").replace(/[^\d.]/g, "").split(/\s+/).pop() ??
          "",
      );
    });
  }, []);

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional on filter change
  }, [statusFilter, formFilter, sourceFilter]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const openCount = useMemo(
    () =>
      leads.filter(
        (l) =>
          !["won", "lost", "converted", "declined", "archived"].includes(
            l.status,
          ),
      ).length,
    [leads],
  );

  const saveEdit = () => {
    if (!selectedId || !draft) return;
    startTransition(async () => {
      setError(null);
      setToast(null);
      const preferred =
        draft.preferredContactMethod &&
        (STORY_PREFERRED_CONTACT_METHODS as readonly string[]).includes(
          draft.preferredContactMethod,
        )
          ? (draft.preferredContactMethod as StoryPreferredContactMethod)
          : null;
      const res = await updateStoryLeadAction(selectedId, {
        status: draft.status,
        fullName: draft.fullName,
        email: draft.email,
        phone: draft.phone.trim() || null,
        organisationName: draft.organisationName.trim() || null,
        designation: draft.designation.trim() || null,
        preferredContactMethod: preferred,
        storyDescription: draft.storyDescription.trim() || null,
        occasionType: draft.occasionType.trim() || null,
        audiences: splitList(draft.audiences),
        preferredFormats: splitList(draft.preferredFormats),
        targetDate: draft.targetDate.trim() || null,
        quantityRange: draft.quantityRange.trim() || null,
        budgetRange: draft.budgetRange.trim() || null,
        primaryCity: draft.primaryCity.trim() || null,
        discussionTopic: draft.discussionTopic.trim() || null,
        timeline: draft.timeline.trim() || null,
        additionalContext: draft.additionalContext.trim() || null,
        notes: draft.notes,
        lostReason: draft.lostReason.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDetail(res.data);
      setDraft(draftFromLead(res.data));
      setToast("Lead saved.");
      loadList();
    });
  };

  const markWon = () => {
    if (!selectedId) return;
    startTransition(async () => {
      setError(null);
      setToast(null);
      const res = await markStoryLeadWonAction(selectedId, {
        notes: draft?.notes,
        createShopifyDraft: true,
        quantity: Math.max(1, Math.floor(Number(wonQty) || 1)),
        unitPrice: wonPrice.trim() ? Number(wonPrice).toFixed(2) : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDetail(res.data.lead);
      setDraft(draftFromLead(res.data.lead));
      if (res.data.shopify.softFailed) {
        setToast(
          `Marked Closed Won. Shopify draft skipped: ${res.data.shopify.error ?? "credentials/scopes"}`,
        );
      } else {
        setToast(
          res.data.shopify.draftOrderName
            ? `Closed Won — Shopify draft ${res.data.shopify.draftOrderName} created.`
            : "Closed Won.",
        );
      }
      loadList();
    });
  };

  const markLost = () => {
    if (!selectedId) return;
    startTransition(async () => {
      setError(null);
      setToast(null);
      const res = await markStoryLeadLostAction(selectedId, {
        lostReason: draft?.lostReason?.trim() || null,
        notes: draft?.notes,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDetail(res.data);
      setDraft(draftFromLead(res.data));
      setToast("Marked Closed Lost.");
      loadList();
    });
  };

  const createLead = () => {
    startTransition(async () => {
      setError(null);
      setToast(null);
      const preferred =
        createDraft.preferredContactMethod &&
        (STORY_PREFERRED_CONTACT_METHODS as readonly string[]).includes(
          createDraft.preferredContactMethod,
        )
          ? (createDraft.preferredContactMethod as StoryPreferredContactMethod)
          : null;
      const res = await createManualStoryLeadAction({
        formKey: createDraft.formKey,
        fullName: createDraft.fullName,
        email: createDraft.email,
        phone: createDraft.phone || null,
        organisationName: createDraft.organisationName || null,
        designation: createDraft.designation || null,
        preferredContactMethod: preferred,
        storyDescription: createDraft.storyDescription || null,
        occasionType: createDraft.occasionType || null,
        quantityRange: createDraft.quantityRange || null,
        budgetRange: createDraft.budgetRange || null,
        primaryCity: createDraft.primaryCity || null,
        notes: createDraft.notes || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCreateOpen(false);
      setCreateDraft(emptyCreate);
      setSelectedId(res.data.id);
      setDetail(res.data);
      setDraft(draftFromLead(res.data));
      setToast("Lead created on Aarla OS.");
      loadList();
    });
  };

  const manufactureHref = detail
    ? storyLeadManufactureHref(detail)
    : "/manufacture/needs";

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
      {toast ? (
        <div className="rounded-xl bg-muted-green/30 border border-muted-green/50 px-4 py-3 text-sm text-deep-navy">
          {toast}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                statusFilter === f.id
                  ? "bg-deep-navy text-white border-deep-navy"
                  : "bg-white text-charcoal/70 border-border hover:border-deep-navy/40"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadList()}
            disabled={pending}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New lead
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <Field label="Search">
          <input
            className={inputClass}
            placeholder="Name, email, org, phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadList();
            }}
          />
        </Field>
        <Field label="Form">
          <select
            className={selectClass}
            value={formFilter}
            onChange={(e) =>
              setFormFilter(e.target.value as StoryFormKey | "all")
            }
          >
            <option value="all">All forms</option>
            {STORY_FORM_KEYS.map((k) => (
              <option key={k} value={k}>
                {STORY_FORM_KEY_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source">
          <select
            className={selectClass}
            value={sourceFilter}
            onChange={(e) =>
              setSourceFilter(e.target.value as "all" | "gyvft" | "aarla_os")
            }
          >
            <option value="all">All sources</option>
            <option value="gyvft">GYVFT</option>
            <option value="aarla_os">Aarla OS</option>
          </select>
        </Field>
        <div className="flex items-end">
          <Button variant="secondary" size="sm" onClick={() => loadList()}>
            Apply search
          </Button>
        </div>
      </div>

      <p className="text-xs text-charcoal/55">
        {loaded
          ? `${leads.length} lead${leads.length === 1 ? "" : "s"} · ${openCount} open in this view`
          : "Loading…"}
      </p>

      <div className="grid lg:grid-cols-5 gap-4 items-start">
        <div className="lg:col-span-2 space-y-3">
          <DataTable
            rows={leads}
            rowKey={(r) => r.id}
            emptyMessage="No leads yet. Create one here or wait for GYVFT submissions."
            onRowClick={(r) => setSelectedId(r.id)}
            columns={[
              {
                key: "contact",
                header: "Lead",
                render: (r) => (
                  <div className={selectedId === r.id ? "font-medium" : ""}>
                    <div className="text-deep-navy">{r.fullName}</div>
                    <div className="text-xs text-charcoal/55 truncate">
                      {r.organisationName || r.email}
                    </div>
                  </div>
                ),
              },
              {
                key: "status",
                header: "Status",
                render: (r) => <StoryLeadStatusChip status={r.status} />,
              },
              {
                key: "source",
                header: "Source",
                render: (r) => (
                  <StatusChip
                    label={sourceLabel(r.source)}
                    tone={r.source === "gyvft" ? "accent" : "info"}
                  />
                ),
              },
            ]}
          />
        </div>

        <div className="lg:col-span-3">
          {!selectedId || !draft || !detail ? (
            <div className="card-surface-pale p-10 text-center text-sm text-charcoal/60">
              Select a lead to review, edit status, close won/lost, or start manufacture.
            </div>
          ) : (
            <div className="space-y-4">
              <FormSection
                title={detail.fullName}
                description={`${STORY_FORM_KEY_LABELS[detail.formKey]} · ${sourceLabel(detail.source)} · submitted ${formatWhen(detail.submittedAt)}`}
              >
                <div className="flex flex-wrap gap-2 mb-2">
                  <StoryLeadStatusChip status={detail.status} />
                  {detail.shopifyDraftOrderId ? (
                    <StatusChip
                      label={
                        detail.shopifyDraftOrderName
                          ? `Shopify ${detail.shopifyDraftOrderName}`
                          : "Shopify draft"
                      }
                      tone="success"
                    />
                  ) : null}
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Pipeline status">
                    <select
                      className={selectClass}
                      value={draft.status}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          status: e.target.value as StoryLeadCrmStatus,
                        })
                      }
                    >
                      {STORY_LEAD_CRM_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STORY_LEAD_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Preferred contact">
                    <select
                      className={selectClass}
                      value={draft.preferredContactMethod}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          preferredContactMethod: e.target.value,
                        })
                      }
                    >
                      <option value="">—</option>
                      {STORY_PREFERRED_CONTACT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Full name">
                    <input
                      className={inputClass}
                      value={draft.fullName}
                      onChange={(e) =>
                        setDraft({ ...draft, fullName: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      className={inputClass}
                      value={draft.email}
                      onChange={(e) =>
                        setDraft({ ...draft, email: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      className={inputClass}
                      value={draft.phone}
                      onChange={(e) =>
                        setDraft({ ...draft, phone: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Organisation">
                    <input
                      className={inputClass}
                      value={draft.organisationName}
                      onChange={(e) =>
                        setDraft({ ...draft, organisationName: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Designation">
                    <input
                      className={inputClass}
                      value={draft.designation}
                      onChange={(e) =>
                        setDraft({ ...draft, designation: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="City">
                    <input
                      className={inputClass}
                      value={draft.primaryCity}
                      onChange={(e) =>
                        setDraft({ ...draft, primaryCity: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Occasion">
                    <input
                      className={inputClass}
                      value={draft.occasionType}
                      onChange={(e) =>
                        setDraft({ ...draft, occasionType: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Quantity range">
                    <input
                      className={inputClass}
                      value={draft.quantityRange}
                      onChange={(e) =>
                        setDraft({ ...draft, quantityRange: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Budget range">
                    <input
                      className={inputClass}
                      value={draft.budgetRange}
                      onChange={(e) =>
                        setDraft({ ...draft, budgetRange: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Target date">
                    <input
                      className={inputClass}
                      value={draft.targetDate}
                      onChange={(e) =>
                        setDraft({ ...draft, targetDate: e.target.value })
                      }
                    />
                  </Field>
                </div>

                <Field label="Story / brief">
                  <textarea
                    className={textareaClass}
                    rows={3}
                    value={draft.storyDescription}
                    onChange={(e) =>
                      setDraft({ ...draft, storyDescription: e.target.value })
                    }
                  />
                </Field>
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Audiences (comma-separated)">
                    <input
                      className={inputClass}
                      value={draft.audiences}
                      onChange={(e) =>
                        setDraft({ ...draft, audiences: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Preferred formats">
                    <input
                      className={inputClass}
                      value={draft.preferredFormats}
                      onChange={(e) =>
                        setDraft({ ...draft, preferredFormats: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field label="Additional context">
                  <textarea
                    className={textareaClass}
                    rows={2}
                    value={draft.additionalContext}
                    onChange={(e) =>
                      setDraft({ ...draft, additionalContext: e.target.value })
                    }
                  />
                </Field>
                <Field label="CRM notes">
                  <textarea
                    className={textareaClass}
                    rows={2}
                    value={draft.notes}
                    onChange={(e) =>
                      setDraft({ ...draft, notes: e.target.value })
                    }
                  />
                </Field>
                <Field label="Lost reason (if closed lost)">
                  <input
                    className={inputClass}
                    value={draft.lostReason}
                    onChange={(e) =>
                      setDraft({ ...draft, lostReason: e.target.value })
                    }
                  />
                </Field>

                {detail.attachmentFilename ? (
                  <p className="text-xs text-charcoal/60">
                    Attachment: {detail.attachmentFilename}
                    {detail.attachmentByteSize != null
                      ? ` (${Math.round(detail.attachmentByteSize / 1024)} KB)`
                      : ""}
                  </p>
                ) : null}

                {detail.shopifyOrderError ? (
                  <p className="text-xs text-aarla-red">{detail.shopifyOrderError}</p>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button onClick={saveEdit} disabled={pending}>
                    Save changes
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={markWon}
                    disabled={pending}
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Closed Won → Shopify
                  </Button>
                  <Button variant="danger" onClick={markLost} disabled={pending}>
                    Closed Lost
                  </Button>
                  <Link href={manufactureHref}>
                    <Button variant="outline" type="button">
                      <Factory className="h-4 w-4" />
                      Manufacture
                    </Button>
                  </Link>
                  {detail.shopifyDraftOrderUrl ? (
                    <a
                      href={detail.shopifyDraftOrderUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button variant="ghost" type="button">
                        Open Shopify draft
                      </Button>
                    </a>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                  <Field label="Won qty (Shopify line)">
                    <input
                      className={inputClass}
                      value={wonQty}
                      onChange={(e) => setWonQty(e.target.value)}
                    />
                  </Field>
                  <Field label="Unit price ₹ (optional)">
                    <input
                      className={inputClass}
                      value={wonPrice}
                      onChange={(e) => setWonPrice(e.target.value)}
                      placeholder="From budget"
                    />
                  </Field>
                </div>
              </FormSection>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New story lead"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createLead} disabled={pending}>
              Create lead
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-charcoal/65">
            Capture a lead directly in Aarla OS (alongside GYVFT inbound forms).
          </p>
          <Field label="Form type">
            <select
              className={selectClass}
              value={createDraft.formKey}
              onChange={(e) =>
                setCreateDraft({
                  ...createDraft,
                  formKey: e.target.value as StoryFormKey,
                })
              }
            >
              {STORY_FORM_KEYS.map((k) => (
                <option key={k} value={k}>
                  {STORY_FORM_KEY_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Full name">
              <input
                className={inputClass}
                value={createDraft.fullName}
                onChange={(e) =>
                  setCreateDraft({ ...createDraft, fullName: e.target.value })
                }
              />
            </Field>
            <Field label="Email">
              <input
                className={inputClass}
                value={createDraft.email}
                onChange={(e) =>
                  setCreateDraft({ ...createDraft, email: e.target.value })
                }
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass}
                value={createDraft.phone}
                onChange={(e) =>
                  setCreateDraft({ ...createDraft, phone: e.target.value })
                }
              />
            </Field>
            <Field label="Organisation">
              <input
                className={inputClass}
                value={createDraft.organisationName}
                onChange={(e) =>
                  setCreateDraft({
                    ...createDraft,
                    organisationName: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Occasion">
              <input
                className={inputClass}
                value={createDraft.occasionType}
                onChange={(e) =>
                  setCreateDraft({ ...createDraft, occasionType: e.target.value })
                }
              />
            </Field>
            <Field label="City">
              <input
                className={inputClass}
                value={createDraft.primaryCity}
                onChange={(e) =>
                  setCreateDraft({ ...createDraft, primaryCity: e.target.value })
                }
              />
            </Field>
            <Field label="Quantity">
              <input
                className={inputClass}
                value={createDraft.quantityRange}
                onChange={(e) =>
                  setCreateDraft({
                    ...createDraft,
                    quantityRange: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Budget">
              <input
                className={inputClass}
                value={createDraft.budgetRange}
                onChange={(e) =>
                  setCreateDraft({ ...createDraft, budgetRange: e.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Story">
            <textarea
              className={textareaClass}
              rows={3}
              value={createDraft.storyDescription}
              onChange={(e) =>
                setCreateDraft({
                  ...createDraft,
                  storyDescription: e.target.value,
                })
              }
            />
          </Field>
          <Field label="Notes">
            <textarea
              className={textareaClass}
              rows={2}
              value={createDraft.notes}
              onChange={(e) =>
                setCreateDraft({ ...createDraft, notes: e.target.value })
              }
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
