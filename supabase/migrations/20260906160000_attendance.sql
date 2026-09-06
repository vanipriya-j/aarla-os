-- Small attendance module: team roster + one mark per person per day.
-- Dates are calendar days (Asia/Kolkata in application code). Idempotent for /setup.

create table if not exists attendance_staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists attendance_staff_org_idx
  on attendance_staff(organization_id);
create index if not exists attendance_staff_org_active_idx
  on attendance_staff(organization_id, is_active, sort_order);

drop trigger if exists attendance_staff_updated_at on attendance_staff;
create trigger attendance_staff_updated_at
  before update on attendance_staff
  for each row execute function set_updated_at();

create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  staff_id uuid not null references attendance_staff(id) on delete cascade,
  work_date date not null,
  status text not null
    check (status in ('present', 'absent', 'half-day', 'leave')),
  notes text not null default '',
  marked_by text not null default 'founder',
  marked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, staff_id, work_date)
);
create index if not exists attendance_records_org_date_idx
  on attendance_records(organization_id, work_date);

drop trigger if exists attendance_records_updated_at on attendance_records;
create trigger attendance_records_updated_at
  before update on attendance_records
  for each row execute function set_updated_at();
