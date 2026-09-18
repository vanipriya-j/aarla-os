/**
 * Client-safe deep-link from a story lead into Manufacture → Needs Making.
 */
import { manufactureReorderHref } from "@/lib/domain/manufacture-reorder-link";

function parseQuantityHint(range: string | null | undefined): number {
  if (!range?.trim()) return 1;
  const nums = range.match(/\d+/g)?.map((n) => Number(n)) ?? [];
  if (!nums.length) return 1;
  return Math.max(1, Math.floor(nums[nums.length - 1]!));
}

export function storyLeadManufactureHref(lead: {
  id: string;
  fullName: string;
  organisationName?: string | null;
  quantityRange?: string | null;
  occasionType?: string | null;
}): string {
  const label = [
    lead.organisationName?.trim() || lead.fullName.trim(),
    lead.occasionType?.trim() || "Story lead",
  ]
    .filter(Boolean)
    .join(" · ");
  return manufactureReorderHref({
    productId: "",
    quantity: parseQuantityHint(lead.quantityRange),
    label: `${label} (${lead.id.slice(0, 8)})`,
  });
}
