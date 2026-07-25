"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles } from "lucide-react";

export function AskAarla({ tipPrompts = [] }: { tipPrompts?: string[] }) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const submit = (value?: string) => {
    const q = (value ?? query).trim();
    if (!q) {
      router.push("/advice");
      return;
    }
    router.push(`/advice?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="card-surface p-4 md:p-5 animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-aarla-red" />
        <p className="text-sm font-medium text-deep-navy">Ask Aarla</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-charcoal/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What should I manufacture before Navarathri?"
            className="w-full rounded-xl border border-border bg-pale-cream pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-aarla-red/25 focus:border-aarla-red/40"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-aarla-red text-white px-5 py-3 text-sm font-medium hover:bg-[#9a0320] transition shrink-0"
        >
          Ask
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {tipPrompts.slice(0, 3).map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => submit(prompt)}
            className="text-xs rounded-full border border-border bg-white px-3 py-1.5 text-charcoal/70 hover:border-aarla-red/40 hover:text-aarla-red transition"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
