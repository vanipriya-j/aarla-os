-- Your Story. Our Telling. — inbound leads from GYVFT (and future web forms).
-- Idempotent on (organization_id, idempotency_key). Stores raw payload for audit.

create table if not exists story_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  idempotency_key text not null,
  source text not null default 'gyvft',
  module text not null default 'your_story_our_telling'
    check (module = 'your_story_our_telling'),
  form_key text not null
    check (form_key in (
      'tell_your_story',
      'become_a_merch_partner',
      'book_a_discovery',
      'upload_a_brief'
    )),
  lead_type text not null
    check (lead_type in (
      'tell_your_story',
      'merch_partner',
      'discovery',
      'brief_upload'
    )),
  status text not null default 'new'
    check (status in (
      'new',
      'reviewed',
      'in_progress',
      'converted',
      'declined',
      'archived'
    )),
  submitted_at timestamptz not null default now(),
  -- Contact
  full_name text not null,
  email text not null,
  phone text,
  organisation_name text,
  designation text,
  preferred_contact_method text
    check (
      preferred_contact_method is null
      or preferred_contact_method in ('email', 'phone', 'whatsapp')
    ),
  -- Story / brief fields (nullable; form-dependent)
  story_description text,
  occasion_type text,
  audiences jsonb not null default '[]'::jsonb,
  preferred_formats jsonb not null default '[]'::jsonb,
  target_date text,
  quantity_range text,
  budget_range text,
  primary_city text,
  discussion_topic text,
  timeline text,
  additional_context text,
  -- Consent
  consent_communication boolean not null default false,
  consent_marketing boolean not null default false,
  -- Attribution
  landing_page text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  -- Optional brief attachment (upload_a_brief only)
  attachment_filename text,
  attachment_content_type text,
  attachment_bytes bytea,
  attachment_byte_size integer
    check (attachment_byte_size is null or attachment_byte_size >= 0),
  -- Audit
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create index if not exists story_leads_org_created_idx
  on story_leads (organization_id, created_at desc);

create index if not exists story_leads_org_status_idx
  on story_leads (organization_id, status, created_at desc);

create index if not exists story_leads_org_form_key_idx
  on story_leads (organization_id, form_key, created_at desc);

create index if not exists story_leads_org_email_idx
  on story_leads (organization_id, lower(email));

create trigger story_leads_updated_at
  before update on story_leads
  for each row execute function set_updated_at();
