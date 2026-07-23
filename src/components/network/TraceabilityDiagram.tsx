import Link from "next/link";

interface TraceNode {
  label: string;
  detail?: string;
  href?: string;
  accent?: boolean;
}

function Node({ label, detail, href, accent }: TraceNode) {
  const className = `rounded-xl border px-3 py-2.5 text-center min-w-[120px] ${
    accent
      ? "border-aarla-red/40 bg-aarla-red/5"
      : "border-border bg-white"
  }`;
  const inner = (
    <>
      <p className="text-xs font-medium text-deep-navy">{label}</p>
      {detail ? <p className="text-[11px] text-charcoal/55 mt-0.5">{detail}</p> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`${className} hover:border-aarla-red/50 transition block`}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

function Arrow() {
  return <div className="text-border-strong text-lg leading-none py-1">↓</div>;
}

interface TraceabilityDiagramProps {
  productTitle: string;
  vendorName: string;
  batchNumber: string;
  partnerNames: string[];
  registrationRate: number;
  unknownInCirculation: number;
}

export function TraceabilityDiagram({
  productTitle,
  vendorName,
  batchNumber,
  partnerNames,
  registrationRate,
  unknownInCirculation,
}: TraceabilityDiagramProps) {
  return (
    <div className="card-surface p-6 md:p-8">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-aarla-red">
          Traceability
        </p>
        <h3 className="font-display text-2xl text-deep-navy mt-1">{productTitle}</h3>
        <p className="text-sm text-charcoal/60 mt-1">
          From vendor to community — the path every object can travel.
        </p>
      </div>

      <div className="flex flex-col items-center gap-1 text-sm">
        <Node label="Vendor" detail={vendorName} href="/inventory?tab=batches" />
        <Arrow />
        <Node label="Manufacturing Batch" detail={batchNumber} href="/inventory?tab=batches" accent />
        <Arrow />
        <Node label="Aarla Studio" detail="Received & QC" href="/inventory" />
        <Arrow />

        <div className="w-full max-w-lg grid grid-cols-2 gap-4 my-2">
          <div className="flex flex-col items-center gap-1">
            <Node
              label="Partner"
              detail={partnerNames.slice(0, 2).join(" · ") || "—"}
              href="/partners"
            />
            <Arrow />
            <Node label="Customer" href="/people?filter=customers" />
            <Arrow />
            <Node
              label="Registered?"
              detail={`${registrationRate}%`}
              href="/registrations"
              accent
            />
            <Arrow />
            <Node label="Known User" href="/people?filter=users" />
            <Arrow />
            <Node label="Community" href="/people?filter=community" accent />
          </div>
          <div className="flex flex-col items-center gap-1">
            <Node label="Shopify" href="/dispatch" />
            <Arrow />
            <Node label="Customer" href="/people?filter=customers" />
            <Arrow />
            <Node label="Registered?" detail="Varies" href="/register" />
            <Arrow />
            <Node
              label="Unknown User"
              detail={unknownInCirculation ? `${unknownInCirculation} in circulation` : "—"}
            />
            <Arrow />
            <Node label="In Circulation" detail="User unknown" />
          </div>
        </div>
      </div>
    </div>
  );
}
