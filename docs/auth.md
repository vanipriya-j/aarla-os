# Role-based cookie sessions

Aarla OS supports two shared logins via a sign-in form and HttpOnly cookies.

| Role | Access |
|------|--------|
| **admin** | Full founder OS (all pages + `/setup` + diagnostics) |
| **crm** | Outreach only: `/customer-calls` and `/api/commerce/sync/*` |

`/api/health` stays public for uptime checks. `/login` and `/api/auth/login` are public so users can sign in. `/setup` and `/api/setup` stay public so you can migrate (including `auth_sessions`) before the first login — `/api/setup` still requires `SETUP_SECRET`. `POST /api/integrations/shopify/reservations` is public to cookie auth (Shopify machine callers) but gated by `SHOPIFY_INTEGRATION_SECRET`.

## Enable (Vercel / production)

Set:

```
AUTH_ADMIN_USERNAME=admin
AUTH_ADMIN_PASSWORD=…
AUTH_CRM_USERNAME=crm
AUTH_CRM_PASSWORD=…
```

Optional:

```
AUTH_SESSION_TTL_DAYS=14
```

Usernames default to `admin` / `crm` if omitted. Auth turns on when **at least one** password is non-empty.

**First deploy with auth on:** open `/setup` (no login required), run migrations with `SETUP_SECRET`, then sign in at `/login`. Without that migration, login cannot create sessions.

Locally, leave passwords unset to keep the open-dev experience (treated as admin for navigation).

## Behaviour

1. Unauthenticated browsers are redirected to `/login`.
2. Successful login creates a row in `auth_sessions` and sets the `aarla_session` cookie.
3. CRM users opening `/`, `/diagnostics`, `/setup`, etc. are redirected to `/customer-calls`.
4. Sidebar / mobile nav only list screens the role can open.
5. **Sign out** (sidebar / mobile) revokes the current session and clears the cookie.
6. **Admin → Diagnostics → Login sessions** lists active sessions and can sign out any other session (or all others at once). Revoked sessions fail on the next request.

## Notes

- This replaces HTTP Basic Auth so logout and remote session revoke work reliably.
- Shared-secret roles — not SSO / per-user accounts.
- Rotate passwords by changing env vars and redeploying; also revoke active sessions from Diagnostics if needed.
- Playwright / local tests run with auth **off** unless passwords are set in the test env.
