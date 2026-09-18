-- Story leads CRM: pipeline statuses, notes, Shopify draft-order link on won.

-- Expand status check for CRM pipeline (keep converted/declined as legacy aliases).
alter table story_leads drop constraint if exists story_leads_status_check;
alter table story_leads
  add constraint story_leads_status_check
  check (status in (
    'new',
    'reviewed',
    'in_progress',
    'qualified',
    'proposal',
    'won',
    'lost',
    'converted',
    'declined',
    'archived'
  ));

alter table story_leads
  add column if not exists notes text not null default '';

alter table story_leads
  add column if not exists lost_reason text;

alter table story_leads
  add column if not exists closed_at timestamptz;

alter table story_leads
  add column if not exists shopify_draft_order_id text;

alter table story_leads
  add column if not exists shopify_draft_order_name text;

alter table story_leads
  add column if not exists shopify_draft_order_url text;

alter table story_leads
  add column if not exists shopify_order_error text;
