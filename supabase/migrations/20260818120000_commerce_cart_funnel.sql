-- Enhanced Cart Tracking + Live Campaign Commerce Funnel (PR 8)
-- Pixel/cart sessions are demand signal only — NEVER write stock_movements
-- or soft channel_reservations from this path.
-- Idempotent for /setup after PR 8.

-- ---------------------------------------------------------------------------
-- commerce_events (immutable-ish event log; fingerprint uniqueness)
-- ---------------------------------------------------------------------------
create table if not exists commerce_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('shopify')),
  event_fingerprint text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  anonymous_session_id text,
  shopify_client_id text,
  cart_token text,
  checkout_token text,
  order_external_id text,
  customer_external_id text,
  email text,
  phone text,
  customer_name text,
  product_external_id text,
  variant_external_id text,
  sku text,
  product_title text,
  quantity integer,
  unit_price numeric(12, 2),
  currency text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  campaign_id uuid references campaigns(id) on delete set null,
  consent_state text,
  privacy_state text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, provider, event_fingerprint)
);

create index if not exists commerce_events_occurred_idx
  on commerce_events(organization_id, occurred_at desc);
create index if not exists commerce_events_anon_idx
  on commerce_events(organization_id, anonymous_session_id)
  where anonymous_session_id is not null;
create index if not exists commerce_events_cart_token_idx
  on commerce_events(organization_id, cart_token)
  where cart_token is not null;
create index if not exists commerce_events_checkout_token_idx
  on commerce_events(organization_id, checkout_token)
  where checkout_token is not null;
create index if not exists commerce_events_campaign_idx
  on commerce_events(organization_id, campaign_id, occurred_at desc)
  where campaign_id is not null;
create index if not exists commerce_events_type_idx
  on commerce_events(organization_id, event_type, occurred_at desc);

-- ---------------------------------------------------------------------------
-- cart_sessions (materialized session for ops / Customer Calls)
-- ---------------------------------------------------------------------------
create table if not exists cart_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('shopify')),
  anonymous_session_id text,
  cart_token text,
  checkout_token text,
  checkout_external_id text,
  order_external_id text,
  customer_external_id text,
  customer_name text,
  email text,
  phone text,
  status text not null default 'ACTIVE'
    check (status in (
      'ACTIVE',
      'CART_ABANDONED',
      'CHECKOUT_ABANDONED',
      'IDENTIFIED',
      'OUTREACH_PENDING',
      'OUTREACH_COMPLETED',
      'RECOVERED',
      'CONVERTED',
      'EXPIRED'
    )),
  cart_value numeric(12, 2) not null default 0,
  currency text not null default 'INR',
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  campaign_id uuid references campaigns(id) on delete set null,
  recovery_url text,
  outreach_state text,
  assigned_to text,
  notes text,
  first_activity_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  abandoned_at timestamptz,
  recovered_at timestamptz,
  converted_at timestamptz,
  recovered_order_external_id text,
  recovered_revenue numeric(12, 2),
  identity_provenance text,
  consent_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cart_sessions_org_status_idx
  on cart_sessions(organization_id, status, last_activity_at desc);
create index if not exists cart_sessions_anon_idx
  on cart_sessions(organization_id, anonymous_session_id)
  where anonymous_session_id is not null;
create index if not exists cart_sessions_campaign_idx
  on cart_sessions(organization_id, campaign_id)
  where campaign_id is not null;
create index if not exists cart_sessions_phone_idx
  on cart_sessions(organization_id, phone)
  where phone is not null;

create unique index if not exists cart_sessions_cart_token_uidx
  on cart_sessions(organization_id, provider, cart_token)
  where cart_token is not null;
create unique index if not exists cart_sessions_checkout_token_uidx
  on cart_sessions(organization_id, provider, checkout_token)
  where checkout_token is not null;

drop trigger if exists cart_sessions_updated_at on cart_sessions;
create trigger cart_sessions_updated_at
  before update on cart_sessions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- cart_session_items
-- ---------------------------------------------------------------------------
create table if not exists cart_session_items (
  id uuid primary key default gen_random_uuid(),
  cart_session_id uuid not null references cart_sessions(id) on delete cascade,
  product_external_id text,
  variant_external_id text,
  sku text,
  title text not null default '',
  variant_title text,
  quantity integer not null default 0 check (quantity >= 0),
  unit_price numeric(12, 2) not null default 0,
  line_value numeric(12, 2) not null default 0,
  image_url text
);

create index if not exists cart_session_items_session_idx
  on cart_session_items(cart_session_id);

create unique index if not exists cart_session_items_line_uidx
  on cart_session_items (
    cart_session_id,
    coalesce(variant_external_id, ''),
    coalesce(sku, ''),
    title
  );

-- ---------------------------------------------------------------------------
-- campaign_utm_mappings (thin UTM → campaign link)
-- ---------------------------------------------------------------------------
create table if not exists campaign_utm_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  utm_campaign text not null,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (organization_id, utm_campaign)
);

create index if not exists campaign_utm_mappings_campaign_idx
  on campaign_utm_mappings(campaign_id);
