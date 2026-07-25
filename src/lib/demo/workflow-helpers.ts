/**
 * Non-persisted workflow helpers (not business state).
 * Explore generates a local idea sketch; packaging checklist is UI defaults.
 * These are not sources of inventory/order truth.
 */
import type { IdeaExploration } from "@/lib/types";

export function exploreIdea(theme: string): IdeaExploration {
  const t = theme.trim() || "Muruga";
  return {
    worlds: [t, `${t} & Everyday Ritual`, `Contemporary ${t}`],
    stories: [
      `${t} as a morning companion`,
      `Passing ${t} stories across generations`,
      `${t} in the city — temple steps to studio desks`,
    ],
    objects: [
      "Water bottle",
      "Fridge magnet set",
      "Pouch",
      "Brass tumbler",
      "Story card pack",
      "Framed art print",
    ],
    experiences: [
      "Desk ritual kit",
      "Festival gifting hamper",
      "Children's story hour bundle",
      "Studio / office welcome set",
    ],
    customerSegments: [
      "Urban diaspora families",
      "Design-conscious professionals",
      "Parents of 4–10 year olds",
      "Institutional gifting buyers",
      "Temple & cultural event organisers",
    ],
    existingProducts: [],
    productOpportunities: [
      {
        id: "opp-1",
        name: `${t} Water Bottle — Indigo`,
        rationale: `Extends proven bottle format into a ${t}-led colour story for desks and travel.`,
        moq: 100,
        unitCost: 335,
        estimatedCapital: 33500,
        vendor: "Sri Velan Bottles",
      },
      {
        id: "opp-2",
        name: `${t} Magnet Triptych`,
        rationale: "Low capital, high giftability, strong festival and institutional attach rate.",
        moq: 200,
        unitCost: 92,
        estimatedCapital: 18400,
        vendor: "Pondy Print House",
      },
      {
        id: "opp-3",
        name: `${t} Story Pouch + Card`,
        rationale: "Textile + narrative combo for hampers without heavy inventory risk.",
        moq: 75,
        unitCost: 210,
        estimatedCapital: 15750,
        vendor: "Kanchi Weave Studio",
      },
    ],
    relevantVendors: [
      "Sri Velan Bottles",
      "Pondy Print House",
      "Kanchi Weave Studio",
      "Moradabad Brass Collective",
    ],
  };
}

export const packagingChecklistDefaults = [
  "Product checked",
  "Bubble wrap added",
  "Thank-you card added",
  "QR card added",
  "Package sealed",
  "Shipping label attached",
];
