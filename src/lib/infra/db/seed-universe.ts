import type { PoolClient } from "pg";
import { ORG_ID, stableId } from "./ids";
import type { CreativeNodeType } from "@/lib/domain/creative-types";

type DbClient = Pick<PoolClient, "query">;

type SeedNode = {
  slug: string;
  title: string;
  description: string;
  nodeTypes: CreativeNodeType[];
  lifecycleStatus?: string;
  maturityStatus?: string;
  isFuture?: boolean;
  aliases?: string[];
};

type SeedRel = {
  from: string;
  to: string;
  type: string;
  score: number;
  status: "established" | "suggested" | "inferred";
  explanation: string;
};

function nid(slug: string) {
  return stableId(`universe-node:${slug}`);
}

function rid(from: string, to: string, type: string) {
  return stableId(`universe-rel:${from}:${to}:${type}`);
}

const NODES: SeedNode[] = [
  // Worlds
  { slug: "everyday-culture", title: "Everyday Culture", description: "Lived rituals of Tamil everyday life.", nodeTypes: ["world"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "temple-architecture", title: "Temple Architecture", description: "Form, threshold and sacred geometry.", nodeTypes: ["world"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "carnatic-music", title: "Carnatic Music", description: "Raga, rhythm and listening culture.", nodeTypes: ["world"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "bharatanatyam", title: "Bharatanatyam", description: "Gesture, posture and performance lineage.", nodeTypes: ["world"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "chennai", title: "Chennai", description: "City as cultural operating system.", nodeTypes: ["world", "place"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "festivals", title: "Festivals", description: "Seasonal celebration cycles.", nodeTypes: ["world", "occasion"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "morning-rituals", title: "Morning Rituals", description: "Dawn practices that open the day.", nodeTypes: ["world", "theme"], lifecycleStatus: "active", maturityStatus: "developed", isFuture: false },
  { slug: "sacred-sounds", title: "Sacred Sounds", description: "Auspicious sound before silence.", nodeTypes: ["world", "theme"], lifecycleStatus: "exploring", maturityStatus: "emerging", isFuture: false },

  // Concepts
  { slug: "drishti", title: "Drishti", description: "Ritual protection and auspicious gaze at thresholds.", nodeTypes: ["concept"], lifecycleStatus: "exploring", maturityStatus: "emerging", isFuture: true },
  { slug: "temple-sounds", title: "Temple Sounds", description: "Bell, conch and acoustic presence in temples.", nodeTypes: ["concept"], lifecycleStatus: "exploring", maturityStatus: "emerging", isFuture: false },
  { slug: "sacred-thresholds", title: "Sacred Thresholds", description: "Moments of crossing into consecrated space.", nodeTypes: ["concept"], lifecycleStatus: "exploring", maturityStatus: "emerging", isFuture: true },
  { slug: "anjarai-petti", title: "Anjarai Petti", description: "Spice box as domestic ritual architecture.", nodeTypes: ["concept"], lifecycleStatus: "active", maturityStatus: "developed", isFuture: false },
  { slug: "chennai-cubism", title: "Chennai Cubism", description: "Fragmented city forms as visual language.", nodeTypes: ["concept"], lifecycleStatus: "exploring", maturityStatus: "emerging", isFuture: true },

  // Collections
  { slug: "margazhi", title: "Margazhi", description: "December music and devotion collection world.", nodeTypes: ["collection", "occasion"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "guru-parampara", title: "Guru Parampara", description: "Lineage gifts for teachers and guides.", nodeTypes: ["collection"], lifecycleStatus: "developing", maturityStatus: "emerging", isFuture: true },
  { slug: "temple-essentials", title: "Temple Essentials", description: "Objects that accompany temple visits.", nodeTypes: ["collection"], lifecycleStatus: "active", maturityStatus: "developed", isFuture: false },
  { slug: "navarathri", title: "Navarathri", description: "Nine nights festival assortment.", nodeTypes: ["collection", "occasion"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "varalakshmi", title: "Varalakshmi", description: "Lakshmi vratam collection.", nodeTypes: ["collection", "occasion"], lifecycleStatus: "active", maturityStatus: "developed", isFuture: false },

  // Objects
  { slug: "temple-bell", title: "Temple Bell", description: "Bell that marks entry into sacred attention.", nodeTypes: ["object", "symbol", "motif", "research-topic", "content-concept"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false, aliases: ["Ghanta", "Kovil Mani"] },
  { slug: "small-brass-bell", title: "Small Brass Bell", description: "Compact brass bell for home shrine or gift.", nodeTypes: ["object", "product-opportunity"], lifecycleStatus: "captured", maturityStatus: "seed", isFuture: true },
  { slug: "kolam", title: "Kolam", description: "Threshold drawing practice.", nodeTypes: ["object", "motif"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "kuthu-vilakku", title: "Kuthu Vilakku", description: "Standing oil lamp.", nodeTypes: ["object"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "veena", title: "Veena", description: "String instrument of Carnatic lineage.", nodeTypes: ["object", "motif"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "peacock-feather", title: "Peacock Feather", description: "Muruga and beauty motif.", nodeTypes: ["object", "motif"], lifecycleStatus: "active", maturityStatus: "developed", isFuture: false },
  { slug: "dabara-tumbler", title: "Dabara Tumbler", description: "Chennai filter-coffee vessel pair.", nodeTypes: ["object", "product"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "banana-leaf", title: "Banana Leaf", description: "Serving leaf as hospitality symbol.", nodeTypes: ["object", "motif"], lifecycleStatus: "active", maturityStatus: "developed", isFuture: false },
  { slug: "tulasi", title: "Tulasi", description: "Sacred basil plant and devotion.", nodeTypes: ["object", "symbol"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "bell-magnet", title: "Bell Magnet", description: "Fridge magnet carrying temple-bell motif.", nodeTypes: ["object", "product-opportunity"], lifecycleStatus: "captured", maturityStatus: "seed", isFuture: true },
  { slug: "bell-bookmark-charm", title: "Bell Bookmark Charm", description: "Small charm for books and journals.", nodeTypes: ["object", "product-opportunity"], lifecycleStatus: "captured", maturityStatus: "seed", isFuture: true },

  // Materials
  { slug: "brass", title: "Brass", description: "Warm metal of ritual objects.", nodeTypes: ["material"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "panchaloha", title: "Panchaloha", description: "Five-metal sacred alloy.", nodeTypes: ["material", "research-topic"], lifecycleStatus: "researching", maturityStatus: "emerging", isFuture: false },
  { slug: "wood", title: "Wood", description: "Carved and turned wooden forms.", nodeTypes: ["material"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "stainless-steel", title: "Stainless Steel", description: "Contemporary durable metal.", nodeTypes: ["material"], lifecycleStatus: "active", maturityStatus: "developed", isFuture: false },
  { slug: "fabric", title: "Fabric", description: "Textile grounds for motif.", nodeTypes: ["material"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },

  // Content
  { slug: "why-ring-temple-bell", title: "Why do we ring a temple bell?", description: "Explainer on ritual sound.", nodeTypes: ["content-concept", "story"], lifecycleStatus: "developing", maturityStatus: "emerging", isFuture: false },
  { slug: "science-acoustics-bells", title: "Science and acoustics of temple bells", description: "Physics meets ritual.", nodeTypes: ["content-concept", "research-topic"], lifecycleStatus: "captured", maturityStatus: "seed", isFuture: true },
  { slug: "meet-bell-makers", title: "Meet traditional bell makers", description: "Craft documentary direction.", nodeTypes: ["content-concept"], lifecycleStatus: "captured", maturityStatus: "seed", isFuture: true },
  { slug: "bell-traditions-tn", title: "Bell traditions across Tamil Nadu", description: "Regional survey.", nodeTypes: ["content-concept"], lifecycleStatus: "captured", maturityStatus: "seed", isFuture: true },
  { slug: "lost-wax-casting", title: "Lost-wax casting", description: "Process story for metal icons and bells.", nodeTypes: ["content-concept", "research-topic"], lifecycleStatus: "researching", maturityStatus: "emerging", isFuture: false },
  { slug: "no-two-bells-same", title: "Why no two bells sound the same", description: "Variation as craft signature.", nodeTypes: ["content-concept"], lifecycleStatus: "captured", maturityStatus: "seed", isFuture: true },

  // Research
  { slug: "metallurgy", title: "Metallurgy", description: "Alloy science for ritual metals.", nodeTypes: ["research-topic"], lifecycleStatus: "researching", maturityStatus: "emerging", isFuture: false },
  { slug: "acoustics", title: "Acoustics", description: "Sound behaviour in temple halls.", nodeTypes: ["research-topic"], lifecycleStatus: "researching", maturityStatus: "emerging", isFuture: false },
  { slug: "agama-traditions", title: "Agama traditions", description: "Textual guidance for temple practice.", nodeTypes: ["research-topic"], lifecycleStatus: "exploring", maturityStatus: "emerging", isFuture: true },

  // People
  { slug: "bell-makers", title: "Bell makers", description: "Artisan communities casting bells.", nodeTypes: ["person", "collaboration"], lifecycleStatus: "active", maturityStatus: "developed", isFuture: false },
  { slug: "metallurgists", title: "Metallurgists", description: "Technical collaborators on alloys.", nodeTypes: ["person", "collaboration"], lifecycleStatus: "exploring", maturityStatus: "seed", isFuture: true },
  { slug: "temple-architects", title: "Temple architects", description: "Sthapati and design lineage.", nodeTypes: ["person", "collaboration"], lifecycleStatus: "exploring", maturityStatus: "emerging", isFuture: true },
  { slug: "musicians", title: "Musicians", description: "Performers and teachers.", nodeTypes: ["person"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "priests", title: "Priests", description: "Ritual practitioners.", nodeTypes: ["person"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "historians", title: "Historians", description: "Contextual researchers.", nodeTypes: ["person", "collaboration"], lifecycleStatus: "exploring", maturityStatus: "emerging", isFuture: true },

  // Places
  { slug: "swamimalai", title: "Swamimalai", description: "Bronze and casting town.", nodeTypes: ["place"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "kumbakonam", title: "Kumbakonam", description: "Temple town of the Kaveri belt.", nodeTypes: ["place"], lifecycleStatus: "active", maturityStatus: "established", isFuture: false },
  { slug: "nachiar-koil", title: "Nachiar Koil", description: "Known for ritual metal craft.", nodeTypes: ["place"], lifecycleStatus: "exploring", maturityStatus: "emerging", isFuture: false },
];

const RELS: SeedRel[] = [
  { from: "temple-bell", to: "temple-architecture", type: "belongs-to", score: 92, status: "established", explanation: "Temple bells are architectural-acoustic instruments of the temple threshold." },
  { from: "temple-bell", to: "sacred-sounds", type: "belongs-to", score: 95, status: "established", explanation: "The bell is a primary carrier of sacred sound before silence." },
  { from: "temple-bell", to: "morning-rituals", type: "suitable-for", score: 84, status: "established", explanation: "Morning puja often begins with the clear call of a bell." },
  { from: "temple-bell", to: "everyday-culture", type: "fits-with", score: 78, status: "established", explanation: "Home shrines bring temple sound into everyday domestic life." },
  { from: "temple-bell", to: "temple-sounds", type: "related-to", score: 94, status: "established", explanation: "Temple Sounds is the concept frame for ritual acoustic objects like bells." },
  { from: "temple-bell", to: "sacred-thresholds", type: "related-to", score: 88, status: "established", explanation: "Ringing marks the crossing into consecrated attention." },
  { from: "temple-bell", to: "drishti", type: "related-to", score: 86, status: "suggested", explanation: "Connected through ritual protection, thresholds, auspicious sound, brass objects and the act of marking a transition into sacred space." },
  { from: "temple-bell", to: "temple-essentials", type: "featured-in", score: 90, status: "established", explanation: "A temple essentials assortment naturally includes a bell." },
  { from: "temple-bell", to: "margazhi", type: "fits-with", score: 72, status: "inferred", explanation: "Margazhi devotion season amplifies temple-sound storytelling." },
  { from: "temple-bell", to: "guru-parampara", type: "suitable-for", score: 70, status: "suggested", explanation: "A finely made bell can serve as a respectful guru gift." },
  { from: "temple-bell", to: "small-brass-bell", type: "can-become", score: 91, status: "established", explanation: "Small Brass Bell is a product opportunity distilled from the Temple Bell idea." },
  { from: "temple-bell", to: "bell-magnet", type: "can-become", score: 74, status: "suggested", explanation: "Motif transfer into an accessible everyday object." },
  { from: "temple-bell", to: "bell-bookmark-charm", type: "can-become", score: 71, status: "suggested", explanation: "Charm-scale expression of the same motif for books and journals." },
  { from: "temple-bell", to: "brass", type: "made-of", score: 89, status: "established", explanation: "Most domestic and many temple bells are cast or formed in brass." },
  { from: "temple-bell", to: "panchaloha", type: "researched-through", score: 80, status: "inferred", explanation: "Sacred alloy research deepens how premium bells could be specified." },
  { from: "temple-bell", to: "why-ring-temple-bell", type: "tells-story-of", score: 93, status: "established", explanation: "Core explainer content for the Temple Bell cultural logic." },
  { from: "temple-bell", to: "science-acoustics-bells", type: "tells-story-of", score: 87, status: "suggested", explanation: "Science storytelling extends Temple Bell into research-led content." },
  { from: "temple-bell", to: "meet-bell-makers", type: "tells-story-of", score: 85, status: "suggested", explanation: "Maker stories humanise the object and open collaboration." },
  { from: "temple-bell", to: "bell-traditions-tn", type: "tells-story-of", score: 79, status: "suggested", explanation: "Regional survey content expands the Temple Bell world." },
  { from: "temple-bell", to: "lost-wax-casting", type: "researched-through", score: 82, status: "established", explanation: "Process knowledge for how complex metal sound-objects are made." },
  { from: "temple-bell", to: "no-two-bells-same", type: "tells-story-of", score: 76, status: "suggested", explanation: "Celebrates craft variation as a brandable truth." },
  { from: "temple-bell", to: "metallurgy", type: "researched-through", score: 81, status: "inferred", explanation: "Alloy and casting knowledge underpins quality and sound." },
  { from: "temple-bell", to: "acoustics", type: "researched-through", score: 83, status: "inferred", explanation: "Acoustic behaviour explains why temple bells feel present in space." },
  { from: "temple-bell", to: "agama-traditions", type: "researched-through", score: 75, status: "suggested", explanation: "Textual ritual context for when and why bells are sounded." },
  { from: "temple-bell", to: "bell-makers", type: "collaborates-with", score: 88, status: "established", explanation: "Bell makers are primary collaborators for authentic production." },
  { from: "temple-bell", to: "metallurgists", type: "collaborates-with", score: 68, status: "suggested", explanation: "Technical partners for alloy and durability questions." },
  { from: "temple-bell", to: "temple-architects", type: "collaborates-with", score: 66, status: "suggested", explanation: "Architects situate bells within spatial acoustic design." },
  { from: "temple-bell", to: "priests", type: "collaborates-with", score: 77, status: "inferred", explanation: "Priests hold practice knowledge of when the bell is rung." },
  { from: "temple-bell", to: "historians", type: "collaborates-with", score: 64, status: "suggested", explanation: "Historical framing for content and collection narratives." },
  { from: "temple-bell", to: "swamimalai", type: "located-in", score: 86, status: "established", explanation: "Swamimalai is a key place for metal casting lineages." },
  { from: "temple-bell", to: "kumbakonam", type: "located-in", score: 78, status: "inferred", explanation: "Temple-town context for ritual metal objects." },
  { from: "temple-bell", to: "nachiar-koil", type: "located-in", score: 74, status: "suggested", explanation: "Known craft geography for ritual metalwork." },
  { from: "temple-bell", to: "chennai", type: "located-in", score: 60, status: "inferred", explanation: "Chennai is where Aarla interprets and retails the idea." },

  { from: "drishti", to: "sacred-thresholds", type: "related-to", score: 90, status: "established", explanation: "Drishti practices protect and mark thresholds." },
  { from: "drishti", to: "morning-rituals", type: "fits-with", score: 80, status: "inferred", explanation: "Morning ritual sequences often include protective gestures." },
  { from: "small-brass-bell", to: "brass", type: "made-of", score: 92, status: "established", explanation: "Specified as a brass object opportunity." },
  { from: "small-brass-bell", to: "temple-essentials", type: "fits-with", score: 85, status: "suggested", explanation: "Fits a compact essentials assortment." },
  { from: "small-brass-bell", to: "guru-parampara", type: "suitable-for", score: 73, status: "suggested", explanation: "Appropriate scale for a thoughtful guru gift." },
];

export async function seedUniverse(client: DbClient): Promise<void> {
  console.log(`[seed-db] creative_nodes (${NODES.length})…`);
  for (const n of NODES) {
    await client.query(
      `insert into creative_nodes (
        id, organization_id, title, slug, description, node_types,
        lifecycle_status, maturity_status, is_future, confidence, source, created_by, notes
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,1.0,'seed','seed','')
      on conflict (organization_id, slug) do nothing`,
      [
        nid(n.slug),
        ORG_ID,
        n.title,
        n.slug,
        n.description,
        n.nodeTypes,
        n.lifecycleStatus ?? "captured",
        n.maturityStatus ?? "seed",
        n.isFuture ?? false,
      ],
    );
    for (const alias of n.aliases ?? []) {
      await client.query(
        `insert into creative_node_aliases (id, organization_id, node_id, alias)
         values ($1,$2,$3,$4) on conflict do nothing`,
        [stableId(`universe-alias:${n.slug}:${alias}`), ORG_ID, nid(n.slug), alias],
      );
    }
  }

  console.log(`[seed-db] creative_relationships (${RELS.length})…`);
  for (const r of RELS) {
    await client.query(
      `insert into creative_relationships (
        id, organization_id, from_node_id, to_node_id, relationship_type,
        affinity_score, relationship_status, explanation, evidence, source, confirmed_by
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,'[]'::jsonb,$9,$10)
      on conflict do nothing`,
      [
        rid(r.from, r.to, r.type),
        ORG_ID,
        nid(r.from),
        nid(r.to),
        r.type,
        r.score,
        r.status,
        r.explanation,
        r.status === "established" ? "seed" : "rule-based",
        r.status === "established" ? "seed" : null,
      ],
    );
  }

  await client.query(
    `insert into creative_events (
      id, organization_id, event_type, entity_type, entity_id, actor, source, new_value, reasoning
    ) values ($1,$2,'Idea Captured','creative_node',$3,'seed','seed',$4::jsonb,$5)`,
    [
      stableId("universe-event:seed"),
      ORG_ID,
      nid("temple-bell"),
      JSON.stringify({ seeded: true, nodes: NODES.length, relationships: RELS.length }),
      "Universe seed graph loaded.",
    ],
  );
}
