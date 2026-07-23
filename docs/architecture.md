# Architecture — Aarla OS v0.1

## Stack

- **Next.js** (App Router)
- **TypeScript**
- **Tailwind CSS** v4 (CSS variables + `@theme inline`)
- **lucide-react** icons
- Google fonts: DM Serif Display, Inter

## Topology

```
Browser
  └── Next.js App Router (static / client components)
        ├── AppShell (Sidebar + page)
        ├── Pages under src/app/*
        └── Mock data layer (src/lib/mock-data.ts)
```

No API routes, no database, no auth providers, no external SaaS SDKs.

## Layers

1. **Presentation** — `src/app/**` pages and `src/components/**`
2. **Domain types** — `src/lib/types.ts`
3. **Mock data** — `src/lib/mock-data.ts` (products, vendors, POs, orders, projects, content, metrics, advice)
4. **Navigation config** — `src/lib/navigation.ts`

## State

- Server components where possible (home, projects list/detail, dashboard)
- Client components for interactive workflows (advice, explore, story, manufacture, receive, dispatch, launch, content)
- In-session React state only; refresh resets to mock seeds

## Styling

Tokens live in `src/app/globals.css` as CSS custom properties mapped into Tailwind via `@theme inline`. Utility classes `card-surface`, `app-bg`, and motion helpers keep pages consistent.

## Extending later

- Replace mock modules with fetchers behind the same types
- Add Server Actions only when a real persistence layer exists
- Keep workflow step UIs; swap simulation modals for real send/print adapters
