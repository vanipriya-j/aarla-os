# Role-based cookie sessions

Aarla OS supports shared env logins **and** internal team accounts.

| Role | Access |
|------|--------|
| **admin** | Full founder OS (env credentials) |
| **crm** | Outreach only: `/customer-calls` and `/api/commerce/sync/*` |
| **team** | Internal username + PIN accounts; paths gated by access roles (Operations, Creative, …) |

`/api/health` stays public for uptime checks. `/login` and `/api/auth/login` are public so users can sign in. `/setup` and `/api/setup` stay public so you can migrate (including `auth_sessions` + team tables) before the first login — `/api/setup` still requires `SETUP_SECRET`.

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

**First deploy with auth on:** open `/setup` (no login required), run migrations with `SETUP_SECRET`, then sign in at `/login`.

Team members are created under **Admin → Team** (no email). They log in with username + PIN. Credentials are scrypt-hashed in `internal_accounts`.

## Behaviour

1. Unauthenticated browsers are redirected to `/login`.
2. Successful login creates a row in `auth_sessions` and sets the `aarla_session` cookie.
3. Env admin/crm are checked first; otherwise internal team accounts are tried.
4. Team users who must change a temporary PIN go to `/account/change-pin`, then attendance check-in when required.
5. CRM users opening `/`, `/diagnostics`, `/setup`, etc. are redirected to `/customer-calls`.
6. Sidebar / mobile nav only list screens the role can open.
7. **Sign out** revokes the current session and clears the cookie.

## Notes

- Shared-secret env roles remain for founder/CRM; team accounts are per-person DB rows.
- Attendance camera images are evidence only (not face recognition); served only via authenticated `/api/attendance/evidence/[id]`.
- Rotate env passwords by changing env vars and redeploying; also revoke active sessions from Diagnostics if needed.
- Playwright / local tests run with auth **off** unless passwords are set in the test env.
