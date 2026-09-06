-- Team + Attendance + Internal Access (operational people layer).
-- Links to existing `people` (Person) — does not replace CRM People UI.
-- Idempotent for /setup.

-- ---------------------------------------------------------------------------
-- People: email optional for team-only humans (no CRM email required)
-- ---------------------------------------------------------------------------
alter table people alter column email drop not null;
alter table people alter column email set default '';

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'people_organization_id_email_key'
  ) then
    alter table people drop constraint people_organization_id_email_key;
  end if;
end $$;

create unique index if not exists people_org_email_unique
  on people (organization_id, lower(email))
  where email is not null and btrim(email) <> '';

-- Optional photo URL / asset reference for Person
alter table people
  add column if not exists image_url text;

-- ---------------------------------------------------------------------------
-- Work locations (offices / studios — separate from inventory locations)
-- ---------------------------------------------------------------------------
create table if not exists work_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  location_type text not null default 'office'
    check (location_type in (
      'office', 'studio', 'warehouse', 'franchise', 'partner', 'other'
    )),
  timezone text not null default 'Asia/Kolkata',
  active boolean not null default true,
  -- Future validation hooks (IP / geo / QR) — optional JSON config
  validation_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists work_locations_org_idx
  on work_locations(organization_id);

drop trigger if exists work_locations_updated_at on work_locations;
create trigger work_locations_updated_at
before update on work_locations
for each row execute function set_updated_at();

insert into work_locations (organization_id, code, name, location_type, timezone, active)
select o.id, 'ashok-nagar', 'Ashok Nagar', 'office', 'Asia/Kolkata', true
from organizations o
where o.code = 'org-aarla'
on conflict (organization_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- Team relationships (Person ↔ operational role)
-- ---------------------------------------------------------------------------
create table if not exists team_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  person_id uuid not null references people(id) on delete restrict,
  relationship_type text not null default 'TEAM_MEMBER'
    check (relationship_type in (
      'TEAM_MEMBER', 'COLLABORATOR', 'INTERN', 'FOUNDER', 'CONTRACTOR'
    )),
  role_title text not null default '',
  team_function text not null default 'Operations'
    check (team_function in (
      'Operations', 'Creative', 'Admin', 'Founder', 'Other'
    )),
  default_location_id uuid references work_locations(id) on delete set null,
  attendance_required boolean not null default true,
  expected_start_time time,
  expected_end_time time,
  expected_days int[] not null default '{1,2,3,4,5}', -- Mon–Fri (ISO DOW 1–7)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_relationships_org_idx
  on team_relationships(organization_id);

create index if not exists team_relationships_person_idx
  on team_relationships(person_id);

create unique index if not exists team_relationships_one_active_per_person
  on team_relationships(organization_id, person_id)
  where active = true;

drop trigger if exists team_relationships_updated_at on team_relationships;
create trigger team_relationships_updated_at
before update on team_relationships
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Internal accounts (username + hashed PIN/password — no email)
-- ---------------------------------------------------------------------------
create table if not exists internal_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  person_id uuid not null references people(id) on delete restrict,
  username text not null,
  credential_hash text not null,
  must_change_credential boolean not null default true,
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, username),
  unique (organization_id, person_id)
);

create index if not exists internal_accounts_username_idx
  on internal_accounts(organization_id, lower(username));

drop trigger if exists internal_accounts_updated_at on internal_accounts;
create trigger internal_accounts_updated_at
before update on internal_accounts
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RBAC foundation
-- ---------------------------------------------------------------------------
create table if not exists access_permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists access_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  label text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists access_role_permissions (
  role_id uuid not null references access_roles(id) on delete cascade,
  permission_id uuid not null references access_permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists internal_account_roles (
  account_id uuid not null references internal_accounts(id) on delete cascade,
  role_id uuid not null references access_roles(id) on delete cascade,
  primary key (account_id, role_id)
);

insert into access_permissions (code, label, description) values
  ('home.view', 'View home', 'Home / today workspace'),
  ('orders.view', 'View orders', 'See fulfilment queue'),
  ('orders.fulfil', 'Fulfil orders', 'Stock check, pack, ship'),
  ('inventory.view', 'View inventory', 'Stock tables'),
  ('inventory.receive', 'Receive inventory', 'Receive stock'),
  ('manufacture.view', 'Manufacture', 'Vendor POs and needs'),
  ('content.view', 'Content studio', 'Content and creative tools'),
  ('calls.view', 'Customer calls', 'Outreach queues'),
  ('finance.view', 'Finance', 'GST and sensitive finance'),
  ('vendor_costs.view', 'Vendor costs', 'PO rates and cost history'),
  ('team.manage', 'Manage team', 'Create/edit team members'),
  ('attendance.correct', 'Correct attendance', 'Admin attendance corrections'),
  ('admin.access', 'Admin access', 'Diagnostics, setup, access control')
on conflict (code) do nothing;

insert into access_roles (organization_id, code, label, description)
select o.id, r.code, r.label, r.description
from organizations o
cross join (values
  ('FOUNDER_ADMIN', 'Founder admin', 'Full access'),
  ('OPERATIONS', 'Operations', 'Daily ops — fulfil, stock, receive'),
  ('CREATIVE', 'Creative', 'Content and brand tools'),
  ('ADMIN', 'Admin', 'Team and attendance admin'),
  ('COLLABORATOR', 'Collaborator', 'Limited collaborative access')
) as r(code, label, description)
where o.code = 'org-aarla'
on conflict (organization_id, code) do nothing;

-- Founder admin: all permissions
insert into access_role_permissions (role_id, permission_id)
select ar.id, ap.id
from access_roles ar
join organizations o on o.id = ar.organization_id and o.code = 'org-aarla'
cross join access_permissions ap
where ar.code = 'FOUNDER_ADMIN'
on conflict do nothing;

-- Operations
insert into access_role_permissions (role_id, permission_id)
select ar.id, ap.id
from access_roles ar
join organizations o on o.id = ar.organization_id and o.code = 'org-aarla'
join access_permissions ap on ap.code in (
  'home.view', 'orders.view', 'orders.fulfil', 'inventory.view',
  'inventory.receive', 'manufacture.view', 'calls.view'
)
where ar.code = 'OPERATIONS'
on conflict do nothing;

-- Creative
insert into access_role_permissions (role_id, permission_id)
select ar.id, ap.id
from access_roles ar
join organizations o on o.id = ar.organization_id and o.code = 'org-aarla'
join access_permissions ap on ap.code in (
  'home.view', 'content.view', 'inventory.view'
)
where ar.code = 'CREATIVE'
on conflict do nothing;

-- Admin (office)
insert into access_role_permissions (role_id, permission_id)
select ar.id, ap.id
from access_roles ar
join organizations o on o.id = ar.organization_id and o.code = 'org-aarla'
join access_permissions ap on ap.code in (
  'home.view', 'team.manage', 'attendance.correct', 'orders.view',
  'inventory.view', 'calls.view'
)
where ar.code = 'ADMIN'
on conflict do nothing;

-- Collaborator
insert into access_role_permissions (role_id, permission_id)
select ar.id, ap.id
from access_roles ar
join organizations o on o.id = ar.organization_id and o.code = 'org-aarla'
join access_permissions ap on ap.code in ('home.view', 'content.view')
where ar.code = 'COLLABORATOR'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Attendance sessions + evidence + audited adjustments
-- ---------------------------------------------------------------------------
create table if not exists attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  person_id uuid not null references people(id) on delete restrict,
  team_relationship_id uuid not null references team_relationships(id) on delete restrict,
  work_date date not null,
  location_id uuid references work_locations(id) on delete set null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  status text not null default 'PRESENT'
    check (status in (
      'PRESENT', 'CHECKED_OUT', 'MISSED_CHECKOUT',
      'MANUAL_CORRECTION', 'ABSENT', 'ATTENDANCE_NOT_REQUIRED'
    )),
  check_in_method text
    check (check_in_method is null or check_in_method in (
      'camera', 'manual_admin', 'manual_self'
    )),
  check_out_method text
    check (check_out_method is null or check_out_method in (
      'camera', 'manual_admin', 'manual_self'
    )),
  check_in_evidence_id uuid,
  check_out_evidence_id uuid,
  manual_correction boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, person_id, work_date)
);

create index if not exists attendance_sessions_org_date_idx
  on attendance_sessions(organization_id, work_date desc);

create index if not exists attendance_sessions_person_idx
  on attendance_sessions(person_id, work_date desc);

drop trigger if exists attendance_sessions_updated_at on attendance_sessions;
create trigger attendance_sessions_updated_at
before update on attendance_sessions
for each row execute function set_updated_at();

create table if not exists attendance_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  attendance_session_id uuid not null references attendance_sessions(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('CHECK_IN', 'CHECK_OUT')),
  filename text not null default 'capture.jpg',
  mime_type text not null default 'image/jpeg',
  byte_size integer not null check (byte_size >= 0),
  content bytea not null,
  captured_at timestamptz not null default now(),
  device_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists attendance_evidence_session_idx
  on attendance_evidence(attendance_session_id);

-- Wire evidence FKs (deferred until evidence table exists)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_sessions_check_in_evidence_fk'
  ) then
    alter table attendance_sessions
      add constraint attendance_sessions_check_in_evidence_fk
      foreign key (check_in_evidence_id) references attendance_evidence(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_sessions_check_out_evidence_fk'
  ) then
    alter table attendance_sessions
      add constraint attendance_sessions_check_out_evidence_fk
      foreign key (check_out_evidence_id) references attendance_evidence(id) on delete set null;
  end if;
end $$;

create table if not exists attendance_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  attendance_session_id uuid not null references attendance_sessions(id) on delete cascade,
  changed_by_username text not null,
  changed_by_account_id uuid references internal_accounts(id) on delete set null,
  reason text not null,
  original_values jsonb not null,
  corrected_values jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists attendance_adjustments_session_idx
  on attendance_adjustments(attendance_session_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Auth sessions: support team role + optional account/person linkage
-- ---------------------------------------------------------------------------
alter table auth_sessions
  add column if not exists account_id uuid references internal_accounts(id) on delete set null;

alter table auth_sessions
  add column if not exists person_id uuid references people(id) on delete set null;

alter table auth_sessions
  add column if not exists access_role_code text;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'auth_sessions_role_check'
  ) then
    alter table auth_sessions drop constraint auth_sessions_role_check;
  end if;
end $$;

alter table auth_sessions
  add constraint auth_sessions_role_check
  check (role in ('admin', 'crm', 'team'));

-- Login audit (lightweight)
create table if not exists auth_login_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  username text not null,
  outcome text not null check (outcome in ('success', 'failure', 'disabled')),
  role text,
  account_id uuid,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists auth_login_events_created_idx
  on auth_login_events(created_at desc);

-- ---------------------------------------------------------------------------
-- Minimal internal messaging identity hook (not a chat product)
-- ---------------------------------------------------------------------------
create table if not exists operational_inbox_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  context_type text not null default 'direct'
    check (context_type in (
      'direct', 'order', 'customer_case', 'vendor_order',
      'product', 'work_item', 'content_item'
    )),
  context_id text,
  subject text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists operational_inbox_participants (
  thread_id uuid not null references operational_inbox_threads(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  primary key (thread_id, person_id)
);
