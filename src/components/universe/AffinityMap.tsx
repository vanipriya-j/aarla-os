"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { AffinityCategory, AffinityResult, CreativeNode } from "@/lib/domain/creative-types";

const RING: AffinityCategory[] = [
  "Worlds",
  "Concepts",
  "Collections",
  "Objects",
  "Stories / Content",
  "Research",
  "People / Places",
];

type Props = {
  center: CreativeNode;
  byCategory: Record<AffinityCategory, AffinityResult[]>;
  onSelect?: (affinity: AffinityResult) => void;
};

export function AffinityMap({ center, byCategory, onSelect }: Props) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const layout = useMemo(() => {
    const nodes: {
      affinity: AffinityResult;
      x: number;
      y: number;
      category: AffinityCategory;
    }[] = [];
    const cx = 320;
    const cy = 260;
    RING.forEach((category, ringIndex) => {
      const items = byCategory[category] ?? [];
      const radius = 110 + ringIndex * 28;
      items.slice(0, 6).forEach((affinity, i) => {
        const count = Math.min(items.length, 6);
        const angle = (Math.PI * 2 * i) / Math.max(count, 1) - Math.PI / 2 + ringIndex * 0.12;
        nodes.push({
          affinity,
          category,
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * (radius * 0.72),
        });
      });
    });
    return { cx, cy, nodes };
  }, [byCategory]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-charcoal/60">
        <button type="button" className="underline" onClick={() => setScale((s) => Math.min(1.6, s + 0.1))}>
          Zoom in
        </button>
        <button type="button" className="underline" onClick={() => setScale((s) => Math.max(0.7, s - 0.1))}>
          Zoom out
        </button>
        <button
          type="button"
          className="underline"
          onClick={() => {
            setScale(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          Reset
        </button>
        <span>Drag to pan · click a node for detail</span>
      </div>

      <div
        className="hidden md:block overflow-hidden rounded-2xl border border-border bg-[radial-gradient(ellipse_at_center,_#fbf7ef_0%,_#f6eedc_55%,_#e8d8bc_100%)]"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPan({
            x: drag.current.px + (e.clientX - drag.current.x),
            y: drag.current.py + (e.clientY - drag.current.y),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
      >
        <svg viewBox="0 0 640 520" className="w-full h-[420px] cursor-grab active:cursor-grabbing">
          <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`} style={{ transformOrigin: "320px 260px" }}>
            {layout.nodes.map(({ affinity, x, y }) => (
              <line
                key={`l-${affinity.relationship.id}`}
                x1={layout.cx}
                y1={layout.cy}
                x2={x}
                y2={y}
                stroke={
                  affinity.relationship.relationshipStatus === "established"
                    ? "#17365d"
                    : affinity.relationship.relationshipStatus === "suggested"
                      ? "#d97732"
                      : "#a9b98e"
                }
                strokeOpacity={0.35}
                strokeWidth={1.2}
              />
            ))}
            <circle cx={layout.cx} cy={layout.cy} r={46} fill="#b60426" />
            <text
              x={layout.cx}
              y={layout.cy}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#fff"
              fontSize="11"
              fontFamily="var(--font-dm-serif), serif"
            >
              {center.title.length > 16 ? `${center.title.slice(0, 14)}…` : center.title}
            </text>
            {layout.nodes.map(({ affinity, x, y, category }) => (
              <g
                key={affinity.relationship.id}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(affinity);
                }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={affinity.node.isFuture ? 22 : 20}
                  fill="#fff"
                  stroke={affinity.node.isFuture ? "#e5ad2f" : "#17365d"}
                  strokeWidth={affinity.relationship.relationshipStatus === "suggested" ? 1.5 : 2}
                  strokeDasharray={
                    affinity.relationship.relationshipStatus === "suggested" ? "4 3" : undefined
                  }
                />
                <text x={x} y={y - 2} textAnchor="middle" fontSize="9" fill="#17365d">
                  {affinity.node.title.length > 12
                    ? `${affinity.node.title.slice(0, 10)}…`
                    : affinity.node.title}
                </text>
                <text x={x} y={y + 10} textAnchor="middle" fontSize="8" fill="#b60426">
                  {affinity.score}%
                </text>
                <title>
                  {category}: {affinity.node.title} — {affinity.score}% — {affinity.explanation}
                </title>
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* Mobile / fallback list */}
      <div className="md:hidden space-y-3">
        {RING.map((category) => {
          const items = byCategory[category] ?? [];
          if (!items.length) return null;
          return (
            <div key={category}>
              <h4 className="font-display text-base text-deep-navy mb-2">{category}</h4>
              <ul className="space-y-2">
                {items.map((a) => (
                  <li key={a.relationship.id}>
                    <button
                      type="button"
                      onClick={() => onSelect?.(a)}
                      className="w-full text-left rounded-xl border border-border bg-white/80 px-3 py-2"
                    >
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="text-deep-navy font-medium">{a.node.title}</span>
                        <span className="text-aarla-red">{a.score}%</span>
                      </div>
                      <p className="text-xs text-charcoal/65 mt-1">{a.explanation}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-charcoal/55">
        Center node:{" "}
        <Link href={`/universe/${center.id}`} className="underline text-deep-navy">
          {center.title}
        </Link>
        {center.isFuture ? " · Future" : " · Existing"}
      </p>
    </div>
  );
}
