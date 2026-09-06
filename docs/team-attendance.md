# Team, Attendance & Internal Access

Operational people layer for Aarla OS — **not** a generic HRMS and **not** a replacement for CRM **People**.

## Concepts

| Concept | Meaning |
|---------|---------|
| **Person** (`people`) | One human known to Aarla (customer / owner / community) |
| **Team relationship** | Operational link (Operations, Creative, …) on a Person |
| **Internal account** | Username + hashed PIN — **no email required** |
| **Work location** | Ashok Nagar office, future studios/warehouses (≠ inventory locations) |
| **Attendance session** | One check-in/out per person per Asia/Kolkata work date |

CRM People UI labels product owners as **Owners** (still stored as role `User` in data). Internal staff live under **Admin → Team**.

## Routes

- `/team` — overview
- `/team/new` — add team member (Person lookup first)
- `/team/[id]` — member detail / deactivate / disable account
- `/team/attendance` — today + week board
- `/team/access` — RBAC roles
- `/team/locations` — work locations
- `/account/change-pin` — forced first-login PIN change
- `/attendance/check-in` · `/attendance/check-out` — camera evidence flow

## Auth

Env `admin` / `crm` logins unchanged. Internal accounts authenticate with the same `/api/auth/login` form (username + PIN). Session role `team` is path-gated by access roles (`OPERATIONS`, `CREATIVE`, …).

Credentials are **scrypt**-hashed. Never stored plaintext.

## Attendance evidence

Camera captures are **not** facial recognition. Images are stored as `bytea` and served only via authenticated `/api/attendance/evidence/[id]`. Retention: keep while operationally needed; deletion/expiry can be added as policy without schema rewrite.

## Setup

Run `/setup` (or `npm run db:migrate`) so `20260906190000_team_attendance_access.sql` applies.
