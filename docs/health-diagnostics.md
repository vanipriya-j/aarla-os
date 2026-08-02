# Health & diagnostics APIs

## `GET /api/health`

Public liveness check.

```json
{
  "ok": true,
  "service": "aarla-os",
  "timestamp": "…",
  "database": { "ok": true, "latencyMs": 12, "error": null }
}
```

Returns HTTP 503 when the database is unreachable.

## `GET /api/diagnostics`

Founder/ops view of integration readiness + row counts. Never returns tokens or full customer records.

```
GET /api/diagnostics
GET /api/diagnostics?probe=shopify&secret=<SETUP_SECRET>
```

`probe=shopify` exchanges credentials and runs `{ shop { name } }`. Requires `SETUP_SECRET` via query `secret=` or header `x-setup-secret`.

## UI

`/diagnostics` — same data with Refresh + optional Shopify probe.
