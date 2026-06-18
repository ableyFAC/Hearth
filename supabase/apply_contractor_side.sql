-- =============================================================================
-- Hearth — apply the contractor-side migrations (0005 + 0006 + 0007)
-- Run this once in the Supabase SQL Editor if onboarding fails with
--   "Could not find the 'user_id' column of 'contractors'".
-- It is safe to re-run: columns use IF NOT EXISTS, policies are dropped first.
-- =============================================================================

-- ---- 0005: contractor (pro) side -------------------------------------------

-- link a contractor company to an auth user
alter table public.contractors
  add column if not exists user_id uuid references auth.users (id) on delete set null;
create index if not exists contractors_user_id_idx on public.contractors (user_id);

-- lead packet: snapshot + per-lead fee + simulated billing
alter table public.contractor_leads
  add column if not exists homeowner_name    text,
  add column if not exists homeowner_email   text,
  add column if not exists homeowner_phone   text,
  add column if not exists property_address  text,
  add column if not exists issue_description text,
  add column if not exists issue_severity    text,
  add column if not exists timing            text,
  add column if not exists paid              boolean not null default false,
  add column if not exists paid_at           timestamptz;

-- RLS: a contractor manages their own company row
drop policy if exists "contractors insert own" on public.contractors;
create policy "contractors insert own" on public.contractors
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "contractors update own" on public.contractors;
create policy "contractors update own" on public.contractors
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- RLS: a contractor sees / updates only leads assigned to them
drop policy if exists "leads contractor select" on public.contractor_leads;
create policy "leads contractor select" on public.contractor_leads
  for select to authenticated
  using (
    contractor_id in (select id from public.contractors where user_id = auth.uid())
  );

drop policy if exists "leads contractor update" on public.contractor_leads;
create policy "leads contractor update" on public.contractor_leads
  for update to authenticated
  using (
    contractor_id in (select id from public.contractors where user_id = auth.uid())
  )
  with check (
    contractor_id in (select id from public.contractors where user_id = auth.uid())
  );

-- ---- 0006: public lead previews (non-PII teaser) ----------------------------

create or replace view public.lead_previews as
select
  l.id,
  l.category,
  l.issue_severity                                          as severity,
  l.payout_amount                                           as lead_fee,
  nullif(trim(split_part(l.property_address, ',', 2)), '')  as area,
  l.created_at
from public.contractor_leads l
where l.status = 'new';

grant select on public.lead_previews to anon, authenticated;

-- ---- 0007: lead messaging (homeowner <-> contractor) ------------------------

create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.contractor_leads (id) on delete cascade,
  sender_role  text not null,  -- homeowner, contractor
  sender_id    uuid references auth.users (id) on delete set null,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists messages_lead_idx on public.messages (lead_id, created_at);

alter table public.messages enable row level security;

create or replace function public.can_access_lead(p_lead_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.contractor_leads l
    where l.id = p_lead_id
      and (
        public.owns_property(l.property_id)
        or l.contractor_id in (
          select id from public.contractors where user_id = auth.uid()
        )
      )
  );
$$;

drop policy if exists "messages select" on public.messages;
create policy "messages select" on public.messages
  for select to authenticated
  using (public.can_access_lead(lead_id));

drop policy if exists "messages insert" on public.messages;
create policy "messages insert" on public.messages
  for insert to authenticated
  with check (public.can_access_lead(lead_id) and sender_id = auth.uid());
