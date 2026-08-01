import { StatusChip } from "@/components/ui/StatusChip";
import type { CreativeNodeType } from "@/lib/domain/creative-types";

export function NodeTypeChips({ types }: { types: CreativeNodeType[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((t) => (
        <StatusChip key={t} label={t} tone="accent" />
      ))}
    </div>
  );
}
