/**
 * VendorWorkflowAI — structured draft from plain-English “how this vendor works”.
 * Heuristic parser always works; optional LLM if OPENAI_API_KEY / compatible base URL set.
 */
import type { VendorWorkflowAiDraft, WorkflowStepType } from "@/lib/domain/manufacture-types";

const DEFAULT_STEPS: VendorWorkflowAiDraft["steps"] = [
  { sequence: 1, name: "Order created", stepType: "CUSTOM", responsibility: "aarla", required: true, paymentPercentage: null, requiresApproval: false, requiresAttachment: false, requiresVendorConfirmation: false, notes: "" },
  { sequence: 2, name: "Send requirement", stepType: "SEND_ORDER", responsibility: "aarla", required: true, paymentPercentage: null, requiresApproval: false, requiresAttachment: false, requiresVendorConfirmation: false, notes: "" },
  { sequence: 3, name: "Await vendor confirmation", stepType: "AWAIT_CONFIRMATION", responsibility: "vendor", required: true, paymentPercentage: null, requiresApproval: false, requiresAttachment: false, requiresVendorConfirmation: true, notes: "" },
  { sequence: 4, name: "Confirm price", stepType: "QUOTE_APPROVAL", responsibility: "either", required: true, paymentPercentage: null, requiresApproval: true, requiresAttachment: false, requiresVendorConfirmation: false, notes: "" },
  { sequence: 5, name: "Pay advance", stepType: "ADVANCE_PAYMENT", responsibility: "aarla", required: true, paymentPercentage: 50, requiresApproval: false, requiresAttachment: false, requiresVendorConfirmation: false, notes: "" },
  { sequence: 6, name: "Material / blank procurement", stepType: "MATERIAL_PROCUREMENT", responsibility: "vendor", required: false, paymentPercentage: null, requiresApproval: false, requiresAttachment: false, requiresVendorConfirmation: false, notes: "" },
  { sequence: 7, name: "Production", stepType: "PRODUCTION", responsibility: "vendor", required: true, paymentPercentage: null, requiresApproval: false, requiresAttachment: false, requiresVendorConfirmation: false, notes: "" },
  { sequence: 8, name: "Vendor photo / QC proof", stepType: "VENDOR_QC", responsibility: "vendor", required: true, paymentPercentage: null, requiresApproval: false, requiresAttachment: true, requiresVendorConfirmation: false, notes: "" },
  { sequence: 9, name: "Approve QC", stepType: "PHOTO_APPROVAL", responsibility: "aarla", required: true, paymentPercentage: null, requiresApproval: true, requiresAttachment: false, requiresVendorConfirmation: false, notes: "" },
  { sequence: 10, name: "Pay balance", stepType: "BALANCE_PAYMENT", responsibility: "aarla", required: true, paymentPercentage: 50, requiresApproval: false, requiresAttachment: false, requiresVendorConfirmation: false, notes: "" },
  { sequence: 11, name: "Vendor dispatch", stepType: "DISPATCH", responsibility: "vendor", required: true, paymentPercentage: null, requiresApproval: false, requiresAttachment: false, requiresVendorConfirmation: false, notes: "" },
  { sequence: 12, name: "Receive at Aarla", stepType: "RECEIVE", responsibility: "aarla", required: true, paymentPercentage: null, requiresApproval: false, requiresAttachment: false, requiresVendorConfirmation: false, notes: "" },
  { sequence: 13, name: "Aarla QC", stepType: "AARLA_QC", responsibility: "aarla", required: true, paymentPercentage: null, requiresApproval: true, requiresAttachment: false, requiresVendorConfirmation: false, notes: "" },
  { sequence: 14, name: "Receive into inventory", stepType: "INVENTORY_RECEIPT", responsibility: "aarla", required: true, paymentPercentage: null, requiresApproval: false, requiresAttachment: false, requiresVendorConfirmation: false, notes: "" },
  { sequence: 15, name: "Close order", stepType: "CUSTOM", responsibility: "aarla", required: true, paymentPercentage: null, requiresApproval: false, requiresAttachment: false, requiresVendorConfirmation: false, notes: "" },
];

function extractPercent(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
}

function extractDays(text: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  // “3-week” / “3 weeks”
  const weeks = text.match(/(\d+)\s*-?\s*weeks?/i);
  if (weeks?.[1]) return Number(weeks[1]) * 7;
  return null;
}

export function generateVendorWorkflowHeuristic(input: {
  vendorDescription: string;
  vendorName?: string;
}): VendorWorkflowAiDraft {
  const desc = input.vendorDescription.trim();
  const lower = desc.toLowerCase();
  const advance = extractPercent(lower.includes("advance") ? desc : `${desc} 50% advance`) ?? 50;
  const vendorLead =
    extractDays(desc, [
      /usually\s+says?\s+(\d+)\s*days?/i,
      /(\d+)\s*days?\s+(?:lead|turnaround|delivery)/i,
      /says?\s+(\d+)\s*days?/i,
      /within\s+(\d+)\s*days?/i,
    ]) ?? 10;
  const bufferWeeks = desc.match(
    /(\d+)\s*-?\s*weeks?\s+(?:internal|buffer|safety)|(?:internal|buffer|safety)\s+(?:of\s+)?(\d+)\s*-?\s*weeks?|(?:another|want(?:\s+a)?)\s+(\d+)\s*-?\s*weeks?/i,
  );
  const bufferDaysExplicit = extractDays(desc, [
    /(?:buffer|internally|internal)\s+(\d+)\s*days?/i,
    /(?:want)\s+(?:another\s+)?(\d+)\s*days?\s+(?:internal|buffer)/i,
  ]);
  const buffer =
    bufferDaysExplicit ??
    (bufferWeeks
      ? Number(bufferWeeks[1] || bufferWeeks[2] || bufferWeeks[3]) * 7
      : null) ??
    21;

  const steps = DEFAULT_STEPS.map((s) => {
    if (s.stepType === "ADVANCE_PAYMENT") {
      return {
        ...s,
        name: `Pay ${advance}% advance`,
        paymentPercentage: advance,
      };
    }
    if (s.stepType === "BALANCE_PAYMENT") {
      return {
        ...s,
        name: `Pay balance (${Math.max(0, 100 - advance)}%)`,
        paymentPercentage: Math.max(0, 100 - advance),
      };
    }
    return { ...s };
  });

  // Soft-omit steps that clearly don't appear
  const filtered = steps.filter((s) => {
    if (s.stepType === "ARTWORK_SHARE" && !/art(work)?|design|file/i.test(desc)) return true;
    if (s.stepType === "MATERIAL_PROCUREMENT" && !/blank|material|fabric|procure/i.test(desc)) {
      return false;
    }
    if (s.stepType === "VENDOR_QC" && !/photo|picture|qc|proof|sample/i.test(desc)) {
      // keep lightly — photos are common; still include
      return true;
    }
    return true;
  }).map((s, i) => ({ ...s, sequence: i + 1 }));

  return {
    name: input.vendorName ? `${input.vendorName} workflow` : "Vendor workflow draft",
    vendorLeadTimeDays: vendorLead,
    internalBufferDays: buffer,
    advancePercentage: advance,
    steps: filtered,
    extractedRules: {
      vendorLeadTime: `${vendorLead} days`,
      internalSafetyBuffer: `${buffer} days`,
      advance: `${advance}%`,
      balance: lower.includes("before dispatch") || lower.includes("before he ships")
        ? "Before dispatch"
        : "After QC / before dispatch",
      proofRequired: /photo|picture|qc/i.test(desc) ? "Photo before balance payment" : null,
      inventoryUpdate: "Only after successful Receive Stock",
    },
    source: "heuristic",
  };
}

function isStepType(v: string): v is WorkflowStepType {
  return [
    "SEND_ORDER", "AWAIT_CONFIRMATION", "QUOTE_APPROVAL", "ADVANCE_PAYMENT", "ARTWORK_SHARE",
    "MATERIAL_PROCUREMENT", "PRODUCTION", "VENDOR_QC", "PHOTO_APPROVAL", "BALANCE_PAYMENT",
    "DISPATCH", "TRANSIT", "RECEIVE", "AARLA_QC", "INVENTORY_RECEIPT", "CUSTOM",
  ].includes(v);
}

function validateDraft(raw: unknown, fallback: VendorWorkflowAiDraft): VendorWorkflowAiDraft {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const stepsIn = Array.isArray(o.steps) ? o.steps : null;
  if (!stepsIn?.length) return fallback;
  const steps: VendorWorkflowAiDraft["steps"] = [];
  for (let i = 0; i < stepsIn.length; i++) {
    const s = stepsIn[i] as Record<string, unknown>;
    const stepType = typeof s.stepType === "string" && isStepType(s.stepType) ? s.stepType : "CUSTOM";
    const resp =
      s.responsibility === "vendor" || s.responsibility === "either" ? s.responsibility : "aarla";
    steps.push({
      sequence: i + 1,
      name: String(s.name ?? `Step ${i + 1}`).slice(0, 120),
      stepType,
      responsibility: resp,
      required: s.required !== false,
      paymentPercentage:
        typeof s.paymentPercentage === "number" ? s.paymentPercentage : null,
      requiresApproval: Boolean(s.requiresApproval),
      requiresAttachment: Boolean(s.requiresAttachment),
      requiresVendorConfirmation: Boolean(s.requiresVendorConfirmation),
      notes: String(s.notes ?? ""),
    });
  }
  return {
    name: String(o.name ?? fallback.name).slice(0, 120),
    vendorLeadTimeDays:
      typeof o.vendorLeadTimeDays === "number" ? o.vendorLeadTimeDays : fallback.vendorLeadTimeDays,
    internalBufferDays:
      typeof o.internalBufferDays === "number" ? o.internalBufferDays : fallback.internalBufferDays,
    advancePercentage:
      typeof o.advancePercentage === "number" ? o.advancePercentage : fallback.advancePercentage,
    steps,
    extractedRules: {
      ...fallback.extractedRules,
      ...(typeof o.extractedRules === "object" && o.extractedRules
        ? (o.extractedRules as VendorWorkflowAiDraft["extractedRules"])
        : {}),
    },
    source: "llm",
  };
}

/** Optional OpenAI-compatible chat completion. Falls back to heuristic on any failure. */
async function tryLlmDraft(input: {
  vendorDescription: string;
  vendorName?: string;
  categories?: string[];
}): Promise<VendorWorkflowAiDraft | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || process.env.AARLA_LLM_API_KEY?.trim();
  if (!apiKey) return null;
  const base =
    process.env.OPENAI_BASE_URL?.trim() ||
    process.env.AARLA_LLM_BASE_URL?.trim() ||
    "https://api.openai.com/v1";
  const model = process.env.AARLA_LLM_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const system = `You convert a founder's plain-English description of how a manufacturing vendor works into a JSON workflow draft for Aarla OS.
Return ONLY JSON matching:
{"name":string,"vendorLeadTimeDays":number|null,"internalBufferDays":number,"advancePercentage":number|null,
"steps":[{"sequence":number,"name":string,"stepType":string,"responsibility":"aarla"|"vendor"|"either","required":boolean,"paymentPercentage":number|null,"requiresApproval":boolean,"requiresAttachment":boolean,"requiresVendorConfirmation":boolean,"notes":string}],
"extractedRules":{"vendorLeadTime":string|null,"internalSafetyBuffer":string|null,"advance":string|null,"balance":string|null,"proofRequired":string|null,"inventoryUpdate":string|null}}
stepType must be one of: SEND_ORDER,AWAIT_CONFIRMATION,QUOTE_APPROVAL,ADVANCE_PAYMENT,ARTWORK_SHARE,MATERIAL_PROCUREMENT,PRODUCTION,VENDOR_QC,PHOTO_APPROVAL,BALANCE_PAYMENT,DISPATCH,TRANSIT,RECEIVE,AARLA_QC,INVENTORY_RECEIPT,CUSTOM.
Inventory must only update after Receive Stock.`;

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: JSON.stringify({
              vendorName: input.vendorName,
              categories: input.categories,
              description: input.vendorDescription,
            }),
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as unknown as VendorWorkflowAiDraft;
  } catch {
    return null;
  }
}

export async function generateVendorWorkflow(input: {
  vendorDescription: string;
  vendorName?: string;
  categories?: string[];
}): Promise<VendorWorkflowAiDraft> {
  const heuristic = generateVendorWorkflowHeuristic({
    vendorDescription: input.vendorDescription,
    vendorName: input.vendorName,
  });
  if (!input.vendorDescription.trim()) return heuristic;
  const llm = await tryLlmDraft(input);
  if (!llm) return heuristic;
  return validateDraft(llm, heuristic);
}
