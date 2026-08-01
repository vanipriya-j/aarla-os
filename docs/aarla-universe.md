# Aarla Universe — living idea & affinity map

Creative knowledge graph for Aarla OS. Capture first, connect broadly, classify progressively.

## Boundaries

```
UI (/explore, /universe/[id])
  → universe-actions
    → universe-service
      → CreativeEngine
        → AffinitySuggestionProvider (rule-based; LLM later, never auto-commits)
        → Postgres creative_* tables
```

Inventory / commerce stays in the Business Engine. Universe does not mutate stock.

## Key tables

- `creative_nodes`
- `creative_relationships` (explanation required)
- `creative_node_aliases`
- `creative_node_assets`
- `creative_node_notes`
- `creative_events`

## Seed highlights

- Temple Bell multi-type object with affinities across Worlds, Concepts, Collections, Content, Research, People, Places
- Drishti as future Concept (`is_future=true`, exploring / emerging)
