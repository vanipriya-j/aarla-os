# Design system — Aarla OS

## Colour palette

| Token | Hex | Use |
|-------|-----|-----|
| Aarla red | `#B60426` | Primary actions, selected nav, alerts |
| Deep navy | `#17365D` | Headings, strong text, structure |
| Warm cream | `#F6EEDC` | Application background |
| Soft beige | `#E8D8BC` | Subtle fills, tracks |
| Mustard yellow | `#E5AD2F` | Restrained accent (charts, chips) |
| Warm orange | `#D97732` | Restrained accent |
| Muted light green | `#A9B98E` | Success / calm confirmation |
| Charcoal | `#292622` | Body text |
| White | `#FFFFFF` | Cards / working surfaces |
| Pale cream | `#FBF7EF` | Secondary surfaces |

Avoid: generic SaaS blue, purple gradients, glassmorphism, neon, dark corporate sidebars.

## Typography

- **DM Serif Display** — page titles and editorial headings (`.font-display`)
- **Inter** — UI text, forms, buttons, tables, labels

## Layout

- Persistent left sidebar (desktop)
- Collapsible mobile nav
- Spacious sections, soft corners (`12px`), subtle shadows, restrained borders
- Cards for working surfaces; avoid dashboard clutter on the first home viewport beyond the intended composition

## Motion

- `fade-up` and `fade-in` for tiles and panels
- Staggered entrance on primary tiles
- Hover colour shift on tiles (cream icon well → Aarla red)

## Components

Shared in `src/components/ui` and `src/components/layout`:

Sidebar, Header, TaskTile, StatusChip, DataTable, EmptyState, FormSection, SummaryCard, StepWorkflow, Modal, Button, AskAarla
