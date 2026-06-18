-- =============================================================================
-- Hearth — initial schema (Phase 1)
-- Screens 1-5: Onboarding, Home Profile, Dashboard, Report Issue, Find a Pro.
-- Phase 2 tables (improvements, intent_signals, documents) are included so the
-- foreign keys and RLS story are coherent from day one, but no UI ships yet.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- users — mirrors auth.users (Supabase Auth owns identity/credentials).
-- A row is created automatically on signup via the trigger below.
-- -----------------------------------------------------------------------------
create table public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text unique,
  phone       text,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- Auto-provision a public.users row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, phone)
  values (new.id, new.email, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- properties — the claimed home; links to the parcel layer.
-- -----------------------------------------------------------------------------
create table public.properties (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users (id) on delete cascade,
  parcel_id           text,            -- FK to Layer-1 parcel data (Regrid / county)
  address_line1       text not null,
  city                text,
  state               text,
  zip                 text,
  year_built          int,
  sqft                int,
  beds                int,
  baths               numeric(3,1),
  lot_size_sqft       int,
  property_type       text,            -- single_family, condo, townhouse, ...
  purchase_date       date,
  ownership_verified  boolean not null default false,
  created_at          timestamptz not null default now()
);
create index properties_user_id_idx on public.properties (user_id);
create index properties_parcel_id_idx on public.properties (parcel_id);

-- -----------------------------------------------------------------------------
-- system_lifespans — reference defaults so the dashboard can predict work
-- without the owner having to know typical lifespans. Seeded in 0003.
-- -----------------------------------------------------------------------------
create table public.system_lifespans (
  system_type             text primary key,
  expected_lifespan_years int not null,
  label                   text not null
);

-- -----------------------------------------------------------------------------
-- home_systems — the condition core.
-- -----------------------------------------------------------------------------
create table public.home_systems (
  id                       uuid primary key default gen_random_uuid(),
  property_id              uuid not null references public.properties (id) on delete cascade,
  system_type              text not null,  -- roof, hvac, water_heater, electrical_panel, plumbing, windows, foundation, appliance
  material_or_model        text,
  install_year             int,
  last_serviced            date,
  condition_rating         int check (condition_rating between 1 and 5),
  expected_lifespan_years  int,            -- defaults from system_lifespans by type
  notes                    text,
  created_at               timestamptz not null default now()
);
create index home_systems_property_id_idx on public.home_systems (property_id);

-- -----------------------------------------------------------------------------
-- maintenance_tasks — dashboard items.
-- -----------------------------------------------------------------------------
create table public.maintenance_tasks (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties (id) on delete cascade,
  system_id     uuid references public.home_systems (id) on delete set null,
  title         text not null,
  due_date      date,
  recurrence    text not null default 'none',  -- none, monthly, seasonal, annual
  status        text not null default 'open',  -- open, done, snoozed
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index maintenance_tasks_property_id_idx on public.maintenance_tasks (property_id);

-- -----------------------------------------------------------------------------
-- issues — reported problems; condition signal + contractor-lead trigger.
-- -----------------------------------------------------------------------------
create table public.issues (
  id                 uuid primary key default gen_random_uuid(),
  property_id        uuid not null references public.properties (id) on delete cascade,
  system_id          uuid references public.home_systems (id) on delete set null,
  category           text not null,    -- roof, plumbing, electrical, hvac, structural, other
  severity           text not null,    -- low, medium, urgent
  description        text,
  status             text not null default 'open',  -- open, resolved
  converted_to_lead  boolean not null default false,
  created_at         timestamptz not null default now()
);
create index issues_property_id_idx on public.issues (property_id);

-- -----------------------------------------------------------------------------
-- photos — polymorphic attachments (issue / improvement / system).
-- -----------------------------------------------------------------------------
create table public.photos (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties (id) on delete cascade,
  related_type  text not null,         -- issue, improvement, system
  related_id    uuid not null,
  url           text not null,
  uploaded_at   timestamptz not null default now()
);
create index photos_related_idx on public.photos (related_type, related_id);
create index photos_property_id_idx on public.photos (property_id);

-- -----------------------------------------------------------------------------
-- improvements — remodel log (Phase 2 UI, schema present now).
-- -----------------------------------------------------------------------------
create table public.improvements (
  id                uuid primary key default gen_random_uuid(),
  property_id       uuid not null references public.properties (id) on delete cascade,
  system_id         uuid references public.home_systems (id) on delete set null,
  improvement_type  text not null,     -- roof_replacement, kitchen_remodel, addition, ...
  description       text,
  completed_date    date,
  cost              numeric(12,2),
  permit_id         text,              -- FK to detected permit (Layer 2)
  source            text not null default 'self_reported',  -- self_reported, permit_matched
  created_at        timestamptz not null default now()
);
create index improvements_property_id_idx on public.improvements (property_id);

-- -----------------------------------------------------------------------------
-- contractors — vetted directory (shared reference data, not user-owned).
-- -----------------------------------------------------------------------------
create table public.contractors (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  license_number  text,
  categories      text[],              -- {roofing, plumbing, ...}
  service_area    text,
  contact_email   text,
  contact_phone   text,
  vetted          boolean not null default false,
  rating          numeric(2,1),
  created_at      timestamptz not null default now()
);
create index contractors_categories_idx on public.contractors using gin (categories);

-- -----------------------------------------------------------------------------
-- contractor_leads — the revenue object.
-- -----------------------------------------------------------------------------
create table public.contractor_leads (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties (id) on delete cascade,
  issue_id      uuid references public.issues (id) on delete set null,
  contractor_id uuid references public.contractors (id) on delete set null,
  category      text not null,
  status        text not null default 'new',  -- new, sent, accepted, closed, lost
  payout_amount numeric(10,2),
  created_at    timestamptz not null default now()
);
create index contractor_leads_property_id_idx on public.contractor_leads (property_id);
create index contractor_leads_contractor_id_idx on public.contractor_leads (contractor_id);

-- -----------------------------------------------------------------------------
-- intent_signals — sell-readiness, kept separate for governance/consent.
-- (Phase 2 UI; schema present now.)
-- -----------------------------------------------------------------------------
create table public.intent_signals (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties (id) on delete cascade,
  signal_type     text not null,       -- stay_timeline, wants_valuation, considering_selling
  value           text,
  shared_consent  boolean not null default false,
  captured_at     timestamptz not null default now()
);
create index intent_signals_property_id_idx on public.intent_signals (property_id);

-- -----------------------------------------------------------------------------
-- documents — vault (Phase 2 UI; schema present now).
-- -----------------------------------------------------------------------------
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties (id) on delete cascade,
  doc_type      text,                  -- warranty, manual, receipt, inspection_report
  file_url      text not null,
  uploaded_at   timestamptz not null default now()
);
create index documents_property_id_idx on public.documents (property_id);
