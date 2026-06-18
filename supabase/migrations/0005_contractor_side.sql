-- =============================================================================
-- Hearth — contractor (pro) side
-- Real per-contractor accounts + a lead "inbox" with per-lead fees.
--
-- Design: a lead is a frozen PACKET. When a homeowner requests a pro we snapshot
-- the name/contact/address/issue onto contractor_leads, so a contractor reads
-- ONLY contractor_leads — never the homeowner's private properties/issues/users.
-- =============================================================================

-- ---- link a contractor company to an auth user -----------------------------
alter table public.contractors
  add column if not exists user_id uuid references auth.users (id) on delete set null;
create index if not exists contractors_user_id_idx on public.contractors (user_id);

-- ---- lead packet: snapshot + per-lead fee + simulated billing ---------------
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
-- payout_amount (existing) is the per-lead fee the contractor owes us.

-- ---- RLS: a contractor manages their own company row ------------------------
create policy "contractors insert own" on public.contractors
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "contractors update own" on public.contractors
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- RLS: a contractor sees / updates only leads assigned to them -----------
-- These are ADDITIONAL permissive policies; they OR with the existing
-- "contractor_leads owner all" homeowner policy, so both parties see the lead.
create policy "leads contractor select" on public.contractor_leads
  for select to authenticated
  using (
    contractor_id in (select id from public.contractors where user_id = auth.uid())
  );

create policy "leads contractor update" on public.contractor_leads
  for update to authenticated
  using (
    contractor_id in (select id from public.contractors where user_id = auth.uid())
  )
  with check (
    contractor_id in (select id from public.contractors where user_id = auth.uid())
  );
