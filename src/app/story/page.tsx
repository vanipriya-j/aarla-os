"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { StoryHamperBrief } from "@/components/story/StoryHamperBrief";
import { StoryLeadsCrmClient } from "@/components/story/StoryLeadsCrmClient";

type StoryTab = "leads" | "hampers";

export default function StoryPage() {
  const [tab, setTab] = useState<StoryTab>("leads");

  return (
    <>
      <Header
        title="Your Story. Our Telling."
        subtitle="CRM for GYVFT and Aarla OS leads — pipeline, Shopify closed-won, manufacture handoff."
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-16 space-y-6 max-w-6xl">
        <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
          {(
            [
              { id: "leads" as const, label: "Leads" },
              { id: "hampers" as const, label: "Hamper brief" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-1.5 text-sm rounded-lg border transition ${
                tab === t.id
                  ? "bg-deep-navy text-white border-deep-navy"
                  : "bg-white text-charcoal/70 border-border hover:border-deep-navy/40"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "leads" ? <StoryLeadsCrmClient /> : <StoryHamperBrief />}
      </main>
    </>
  );
}
