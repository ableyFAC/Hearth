-- =============================================================================
-- Hearth — social & engagement tables
--   reviews            homeowner rates a contractor after a finished job
--   reports            either party flags a conversation for the Hearth team
--   message_reactions  emoji reactions on a chat message
--   lead_reads         per-side read receipts for a lead's thread
--
-- These were originally created by hand in the Supabase dashboard; this brings
-- them under version control. Written idempotently (IF NOT EXISTS / drop policy
-- first) so it is safe to run against an existing database as well as a fresh
-- one. Depends on can_access_lead() (0007) and owns_property() (0002).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.contractor_leads (id) on delete cascade,
  contractor_id uuid not null references public.contractors (id) on delete cascade,
  property_id   uuid references public.properties (id) on delete set null,
  rating        smallint not null check (rating between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now()
);
create index if not exists reviews_contractor_idx on public.reviews (contractor_id);
create index if not exists reviews_lead_idx on public.reviews (lead_id);

alter table public.reviews enable row level security;

-- Either party to the lead can read it; a contractor can also read reviews
-- written about them.
drop policy if exists "reviews select" on public.reviews;
create policy "reviews select" on public.reviews
  for select to authenticated
  using (
    public.can_access_lead(lead_id)
    or contractor_id in (select id from public.contractors where user_id = auth.uid())
  );

-- Only someone on the lead (the homeowner) can leave the review.
drop policy if exists "reviews insert" on public.reviews;
create policy "reviews insert" on public.reviews
  for insert to authenticated
  with check (public.can_access_lead(lead_id));

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.contractor_leads (id) on delete cascade,
  reporter_id   uuid references auth.users (id) on delete set null,
  reporter_role text not null,           -- homeowner, contractor
  reason        text,
  created_at    timestamptz not null default now()
);
create index if not exists reports_lead_idx on public.reports (lead_id, created_at desc);

alter table public.reports enable row level security;

-- Reporters can file a report and see their own; the Hearth team reviews
-- everything via the service role (which bypasses RLS).
drop policy if exists "reports insert" on public.reports;
create policy "reports insert" on public.reports
  for insert to authenticated
  with check (public.can_access_lead(lead_id) and reporter_id = auth.uid());

drop policy if exists "reports select" on public.reports;
create policy "reports select" on public.reports
  for select to authenticated
  using (reporter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Message reactions
-- ---------------------------------------------------------------------------
create table if not exists public.message_reactions (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages (id) on delete cascade,
  lead_id     uuid not null references public.contractor_leads (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  emoji       text not null,
  created_at  timestamptz not null default now()
);
-- One reaction of a given emoji per user per message (supports the toggle).
create unique index if not exists message_reactions_unique
  on public.message_reactions (message_id, user_id, emoji);
create index if not exists message_reactions_lead_idx
  on public.message_reactions (lead_id);

alter table public.message_reactions enable row level security;

drop policy if exists "reactions select" on public.message_reactions;
create policy "reactions select" on public.message_reactions
  for select to authenticated
  using (public.can_access_lead(lead_id));

drop policy if exists "reactions insert" on public.message_reactions;
create policy "reactions insert" on public.message_reactions
  for insert to authenticated
  with check (public.can_access_lead(lead_id) and user_id = auth.uid());

drop policy if exists "reactions delete" on public.message_reactions;
create policy "reactions delete" on public.message_reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Lead read receipts
-- ---------------------------------------------------------------------------
create table if not exists public.lead_reads (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.contractor_leads (id) on delete cascade,
  role       text not null,          -- homeowner, contractor
  read_at    timestamptz not null default now()
);
-- One row per side; the app upserts on (lead_id, role).
create unique index if not exists lead_reads_unique
  on public.lead_reads (lead_id, role);

alter table public.lead_reads enable row level security;

drop policy if exists "lead_reads select" on public.lead_reads;
create policy "lead_reads select" on public.lead_reads
  for select to authenticated
  using (public.can_access_lead(lead_id));

-- Upsert needs both insert and update permission.
drop policy if exists "lead_reads insert" on public.lead_reads;
create policy "lead_reads insert" on public.lead_reads
  for insert to authenticated
  with check (public.can_access_lead(lead_id));

drop policy if exists "lead_reads update" on public.lead_reads;
create policy "lead_reads update" on public.lead_reads
  for update to authenticated
  using (public.can_access_lead(lead_id))
  with check (public.can_access_lead(lead_id));
