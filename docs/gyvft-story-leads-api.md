# GYVFT → Your Story. Our Telling. (inbound leads)

Stable HTTPS API for [gyvft.vercel.app](https://gyvft.vercel.app) public forms to create leads in Aarla OS **Your Story. Our Telling.** (`/story`).

Does **not** use Aarla cookie/login auth.

## Endpoint

```
POST /api/integrations/story/leads
```

**Production:** `https://<your-aarla-os-host>/api/integrations/story/leads`  
**Staging:** same path on your Vercel preview / staging host (when available).

## Auth

### Preferred — Bearer API key

| Header | Value |
|--------|--------|
| `Authorization` | `Bearer <STORY_LEADS_API_KEY>` |

Also accepted: `x-aarla-story-leads-key: <STORY_LEADS_API_KEY>`

### Alternative — HMAC

| Header | Value |
|--------|--------|
| `X-Aarla-Timestamp` | Unix time in **seconds** (or ms) |
| `X-Aarla-Signature` | `sha256=<hex>` where hex = HMAC-SHA256(`STORY_LEADS_API_KEY`, `` `${timestamp}.${rawBody}` ``) |

**Skew window:** ±**300 seconds** (5 minutes).

### Secret: get / rotate

1. Generate a long random string (e.g. `openssl rand -hex 32`).
2. Set on Aarla OS (Vercel → Environment Variables → Production + Preview):
   - `STORY_LEADS_API_KEY=<secret>`
   - Alias also supported: `GYVFT_LEADS_API_KEY` (used if `STORY_LEADS_API_KEY` is unset)
3. Redeploy Aarla OS.
4. Put the **same** value in GYVFT env (e.g. `AARLA_STORY_LEADS_API_KEY`).
5. To rotate: set a new value on both sides, redeploy both, then drop the old key.

If the secret is missing on the server, the API returns **503** `misconfigured`.

## Success response

**201** (created) or **200** (idempotent replay of the same `idempotency_key`):

```json
{
  "ok": true,
  "lead_id": "uuid",
  "module": "your_story_our_telling",
  "form_key": "tell_your_story",
  "lead_type": "tell_your_story",
  "created": true
}
```

Duplicate `idempotency_key` → **same** `lead_id`, `created: false`, HTTP **200** (not a second lead; not 409).

## Errors

| HTTP | `code` | When |
|------|--------|------|
| 401 | `unauthorized` | Bad/missing Bearer or HMAC |
| 422 | `validation_error` | Invalid JSON / fields (`fields` map when useful) |
| 500 | `server_error` | Unexpected failure |
| 503 | `misconfigured` | `STORY_LEADS_API_KEY` not set |

```json
{ "ok": false, "code": "unauthorized", "error": "Invalid API key." }
```

## Request body

Unknown fields are **ignored** (forward-compatible). Accept at least:

```json
{
  "idempotency_key": "uuid",
  "source": "gyvft",
  "module": "your_story_our_telling",
  "form_key": "tell_your_story",
  "submitted_at": "2026-09-18T10:00:00.000Z",
  "contact": {
    "full_name": "Ada Lovelace",
    "email": "ada@example.com",
    "phone": "+91 90000 00000",
    "organisation_name": "Analytical Engines",
    "designation": "Founder",
    "preferred_contact_method": "whatsapp"
  },
  "story": {
    "description": "…",
    "occasion_type": "institutional",
    "audiences": ["teachers"],
    "preferred_formats": ["hamper"],
    "target_date": null,
    "quantity_range": "50-100",
    "budget_range": "1000-1500",
    "primary_city": "Chennai",
    "discussion_topic": null,
    "timeline": null,
    "additional_context": null
  },
  "consent": { "communication": true, "marketing": false },
  "attribution": {
    "landing_page": "https://gyvft.vercel.app/…",
    "referrer": null,
    "utm_source": "instagram",
    "utm_medium": "social",
    "utm_campaign": null
  }
}
```

`attachment` **only** for `form_key: "upload_a_brief"` (omit otherwise). Max decoded size **5 MiB**.

```json
"attachment": {
  "filename": "brief.pdf",
  "content_type": "application/pdf",
  "content_base64": "…"
}
```

## Field mapping → Your Story. Our Telling.

| `form_key` | Internal `lead_type` | Intent |
|------------|----------------------|--------|
| `tell_your_story` | `tell_your_story` | Story / gift brief |
| `become_a_merch_partner` | `merch_partner` | Merch partner inquiry |
| `book_a_discovery` | `discovery` | Discovery call |
| `upload_a_brief` | `brief_upload` | Brief file upload |

Stored in Postgres table `story_leads` (status starts at `new`). Full JSON kept in `raw_payload` for audit.

Contact → `full_name`, `email`, `phone`, `organisation_name`, `designation`, `preferred_contact_method`  
Story → description, occasion, audiences, formats, dates, budget, city, etc.  
Consent / attribution / attachment → matching columns

## Example curl (Bearer)

```bash
export AARLA_HOST="https://YOUR_AARLA_OS_HOST"
export STORY_LEADS_API_KEY="replace-with-shared-secret"

curl -sS -X POST "$AARLA_HOST/api/integrations/story/leads" \
  -H "Authorization: Bearer $STORY_LEADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "idempotency_key": "11111111-1111-4111-8111-111111111111",
    "source": "gyvft",
    "module": "your_story_our_telling",
    "form_key": "tell_your_story",
    "submitted_at": "2026-09-18T10:00:00.000Z",
    "contact": {
      "full_name": "Ada Lovelace",
      "email": "ada@example.com",
      "phone": null,
      "organisation_name": null,
      "designation": null,
      "preferred_contact_method": "email"
    },
    "story": {
      "description": "Teacher appreciation",
      "occasion_type": "institutional",
      "audiences": ["teachers"],
      "preferred_formats": ["hamper"],
      "target_date": null,
      "quantity_range": null,
      "budget_range": null,
      "primary_city": "Chennai",
      "discussion_topic": null,
      "timeline": null,
      "additional_context": null
    },
    "consent": { "communication": true, "marketing": false },
    "attribution": {
      "landing_page": "https://gyvft.vercel.app/tell",
      "referrer": null,
      "utm_source": null,
      "utm_medium": null,
      "utm_campaign": null
    }
  }'
```

## Example curl (HMAC)

```bash
BODY='{"idempotency_key":"22222222-2222-4222-8222-222222222222","source":"gyvft","module":"your_story_our_telling","form_key":"book_a_discovery","contact":{"full_name":"Grace Hopper","email":"grace@example.com"},"consent":{"communication":true,"marketing":false}}'
TS=$(date +%s)
SIG=$(printf '%s' "${TS}.${BODY}" | openssl dgst -sha256 -hmac "$STORY_LEADS_API_KEY" | awk '{print $2}')

curl -sS -X POST "$AARLA_HOST/api/integrations/story/leads" \
  -H "Content-Type: application/json" \
  -H "X-Aarla-Timestamp: $TS" \
  -H "X-Aarla-Signature: sha256=$SIG" \
  -d "$BODY"
```

## Ops notes

- After deploy, run `/setup` (migrations only / demo unchecked) once so `story_leads` exists, **or** let migrate apply on next setup.
- Listing UI on `/story` can follow; leads are already queryable in DB.
