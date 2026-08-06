# Role-based HTTP Basic Auth

Aarla OS supports two browser logins via HTTP Basic Auth.

| Role | Access |
|------|--------|
| **admin** | Full founder OS (all pages + `/setup` + diagnostics) |
| **crm** | Outreach only: `/customer-calls` and `/api/commerce/sync/*` |

`/api/health` stays public for uptime checks.

## Enable (Vercel / production)

Set:

```
AUTH_ADMIN_USERNAME=admin
AUTH_ADMIN_PASSWORD=…
AUTH_CRM_USERNAME=crm
AUTH_CRM_PASSWORD=…
```

Usernames default to `admin` / `crm` if omitted. Auth turns on when **at least one** password is non-empty.

Locally, leave passwords unset to keep the open-dev experience (treated as admin for navigation).

## Behaviour

1. Browser shows the native Basic Auth dialog.
2. CRM users opening `/`, `/diagnostics`, `/setup`, etc. are redirected to `/customer-calls`.
3. Sidebar / mobile nav only list screens the role can open.
4. Server Actions on Customer Calls inherit the same Basic Auth (same origin).

## Notes

- This is intentionally simple shared-secret auth — not SSO / per-user accounts.
- Rotate passwords by changing env vars and redeploying.
- Playwright / local tests run with auth **off** unless passwords are set in the test env.
