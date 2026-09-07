-- Team member personal / onboarding details (lightweight KYC for office ops).
-- Stored separately from CRM People — admin Team access only.
-- Idempotent for /setup.

create table if not exists team_personal_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  team_relationship_id uuid references team_relationships(id) on delete set null,

  -- Identity
  legal_name text not null default '',
  date_of_birth date,
  gender text not null default ''
    check (gender in ('', 'female', 'male', 'non_binary', 'prefer_not_to_say', 'other')),
  blood_group text not null default '',

  -- Contact beyond Person.phone
  personal_email text not null default '',
  alternate_phone text not null default '',

  -- Address
  address_line1 text not null default '',
  address_line2 text not null default '',
  city text not null default '',
  state text not null default '',
  pincode text not null default '',

  -- Emergency
  emergency_contact_name text not null default '',
  emergency_contact_phone text not null default '',
  emergency_contact_relation text not null default '',

  -- ID document (office onboarding — not biometric)
  id_document_type text not null default ''
    check (id_document_type in (
      '', 'aadhaar', 'pan', 'driving_licence', 'passport', 'voter_id', 'other'
    )),
  id_document_number text not null default '',

  -- Joining
  start_date date,
  notes text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, person_id)
);

create index if not exists team_personal_profiles_org_idx
  on team_personal_profiles(organization_id);

create index if not exists team_personal_profiles_team_idx
  on team_personal_profiles(team_relationship_id);

drop trigger if exists team_personal_profiles_updated_at on team_personal_profiles;
create trigger team_personal_profiles_updated_at
before update on team_personal_profiles
for each row execute function set_updated_at();
