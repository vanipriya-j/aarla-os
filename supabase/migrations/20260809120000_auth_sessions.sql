-- Browser login sessions (cookie auth). Opaque token hash only — never store raw tokens.
-- Idempotent for runtime ensure + /setup.

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  username text not null,
  role text not null check (role in ('admin', 'crm')),
  user_agent text,
  ip text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists auth_sessions_active_idx
  on auth_sessions (last_seen_at desc)
  where revoked_at is null;

create index if not exists auth_sessions_expires_idx
  on auth_sessions (expires_at)
  where revoked_at is null;
