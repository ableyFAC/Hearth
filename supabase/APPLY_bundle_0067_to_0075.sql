-- =============================================================================
-- HEARTH MIGRATION BUNDLE: 0067 through 0075  (paste into Supabase SQL editor)
-- =============================================================================
-- These nine migrations were written this session. Unlike the old 0062-0066
-- bundle, every statement here is IDEMPOTENT (create ... if not exists,
-- create or replace, drop policy if exists), so this bundle is safe to re-run.
--
-- >>> BEFORE YOU RUN: one prerequisite check for 0072 <<<
-- 0072 adds a UNIQUE index on contractors.user_id. It will FAIL if any user
-- already has two contractor rows. Run this FIRST and make sure it returns 0 rows:
--
--   select user_id, count(*) from public.contractors
--    where user_id is not null group by user_id having count(*) > 1;
--
-- If it returns rows, resolve the duplicates before running this bundle.
--
-- >>> AFTER YOU RUN <<<
--  * 0070 restores AI features (the app fails "limit reached" until this is live).
--  * 0074 turns ON the Orange County restriction. serves_orange_county defaults
--    to FALSE, so EVERY existing pro is waitlisted until they re-check the box.
--    If you have known OC pros already, run:
--       update public.contractors set serves_orange_county = true where <your condition>;
--  * The dispute-clawback migration is NOT in this bundle. It is still pending
--    the live-DB check (whether 0058/0065 are applied). Run the 4-value query
--    when you can so it can be written safely.
--
-- Apply top-to-bottom; they are already in dependency order.
-- =============================================================================




-- ========================================================================
-- 0067_contractors_rls_hardening.sql
-- ========================================================================

-- Contractors RLS hardening (0067). RUN AGAINST LIVE DB.
create or replace function public.contractor_related_to_me(p_contractor uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.contractor_leads cl
    where cl.contractor_id = p_contractor and public.owns_property(cl.property_id)
  ) or exists (
    select 1 from public.lead_applications la
    join public.contractor_leads cl on cl.id = la.lead_id
    where la.contractor_id = p_contractor and public.owns_property(cl.property_id)
  );
$$;

drop policy if exists "contractors read" on public.contractors;
create policy "contractors read" on public.contractors
  for select to authenticated
  using ( user_id = auth.uid() or public.contractor_related_to_me(id) );

create or replace function public.resolve_referral_code(p_code text)
returns uuid language plpgsql security definer stable set search_path = public as $$
declare v_code text := lower(btrim(p_code)); v_id uuid; v_cnt int;
begin
  if v_code = '' or length(v_code) > 100 then return null; end if;
  begin
    select id into v_id from public.contractors where id = v_code::uuid;
    if v_id is not null then return v_id; end if;
  exception when invalid_text_representation then null; end;
  select id into v_id from public.contractors where lower(slug) = v_code limit 1;
  if v_id is not null then return v_id; end if;
  if v_code ~ '^[0-9a-f]{8}$' then
    select count(*) into v_cnt from public.contractors where left(id::text,8) = v_code;
    if v_cnt = 1 then
      select id into v_id from public.contractors where left(id::text,8) = v_code;
      return v_id;
    end if;
  end if;
  return null;
end; $$;
grant execute on function public.resolve_referral_code(text) to authenticated;

revoke select on public.contractors from authenticated;
revoke select on public.contractors from anon;
grant select
  (id, user_id, name, categories, service_area, rating, review_count,
   license_number, contact_phone, contact_email, slug, logo_url, about, created_at)
  on public.contractors to authenticated;


-- ========================================================================
-- 0068_rate_limits.sql
-- ========================================================================

-- Generic fixed-window rate limiter (0068). RUN AGAINST LIVE DB.
create table if not exists public.rate_limits (
  bucket        text        not null,
  window_start  timestamptz not null,
  count         int         not null default 0,
  primary key (bucket, window_start)
);
alter table public.rate_limits enable row level security;
-- No policies: only the SECURITY DEFINER RPC (via service_role) touches it.

create or replace function public.rate_limit_hit(
  p_bucket text, p_limit int, p_window_seconds int
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits (bucket, window_start, count)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;
  return v_count <= p_limit;
end; $$;
revoke all on function public.rate_limit_hit(text,int,int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text,int,int) to service_role;


-- ========================================================================
-- 0069_parcel_cache.sql
-- ========================================================================

-- Parcel lookup cache (0069). RUN AGAINST LIVE DB. Cuts RentCast re-billing.
create table if not exists public.parcel_cache (
  cache_key   text primary key,
  facts       jsonb       not null,
  source      text        not null,
  fetched_at  timestamptz not null default now()
);
alter table public.parcel_cache enable row level security;
-- No policies: read/written only by the admin (service_role) client.
create index if not exists parcel_cache_fetched_at_idx on public.parcel_cache (fetched_at);


-- ========================================================================
-- 0070_ai_usage_atomic.sql
-- ========================================================================

-- Atomic AI usage counter (0070). RUN AGAINST LIVE DB *before* deploying the
-- code change: the new helper fails CLOSED, so shipping code first darks every
-- AI route. Requires 0024 (ai_usage).
create or replace function public.bump_ai_usage(p_user uuid, p_delta int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into ai_usage (user_id, usage_date, count)
    values (p_user, current_date, greatest(coalesce(p_delta, 1), 0))
    on conflict (user_id, usage_date)
    do update set count = ai_usage.count + greatest(coalesce(p_delta, 1), 0)
    returning count into v_count;
  return v_count;
end; $$;
revoke all on function public.bump_ai_usage(uuid, int) from public;
revoke all on function public.bump_ai_usage(uuid, int) from anon;
revoke all on function public.bump_ai_usage(uuid, int) from authenticated;
grant execute on function public.bump_ai_usage(uuid, int) to service_role;


-- ========================================================================
-- 0071_promo_claims.sql
-- ========================================================================

-- One-time promo claim ledger (0071). RUN AGAINST LIVE DB. Requires 0022.
create table if not exists public.promo_claims (
  user_id    uuid not null references auth.users (id) on delete cascade,
  promo_key  text not null,
  claimed_at timestamptz not null default now(),
  ref        text,
  primary key (user_id, promo_key)
);
alter table public.promo_claims enable row level security;
drop policy if exists "promo_claims owner read" on public.promo_claims;
create policy "promo_claims owner read" on public.promo_claims
  for select to authenticated using (user_id = auth.uid());

create or replace function public.claim_promo(p_user uuid, p_key text, p_ref text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into promo_claims (user_id, promo_key, ref)
    values (p_user, p_key, p_ref)
    on conflict (user_id, promo_key) do nothing;
  return found;
end; $$;
revoke all on function public.claim_promo(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_promo(uuid, text, text) to service_role;

create or replace function public.has_claimed_promo(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from promo_claims where user_id = auth.uid() and promo_key = p_key);
$$;
revoke all on function public.has_claimed_promo(text) from public, anon;
grant execute on function public.has_claimed_promo(text) to authenticated, service_role;

-- Backfill: every existing pro_ subscriber (any status) has consumed the intro.
insert into public.promo_claims (user_id, promo_key, ref)
select distinct s.user_id, 'pro_intro_monthly', 'backfill:0071'
  from public.subscriptions s
 where s.plan like 'pro\_%' and s.user_id is not null
on conflict (user_id, promo_key) do nothing;


-- ========================================================================
-- 0072_contractors_unique_user.sql
-- ========================================================================

-- One contractor row per user (0072). RUN AGAINST LIVE DB.
-- A non-unique index (0005) currently allows two contractor rows per user, which
-- mints two wallets and duplicates every one-time promo/referral/winback grant,
-- and crashes getCurrentContractor's .maybeSingle().
-- BEFORE applying, check for existing duplicates - this UNIQUE index will FAIL if any exist:
--   select user_id, count(*) from public.contractors where user_id is not null group by user_id having count(*) > 1;
create unique index if not exists contractors_user_id_uidx
  on public.contractors (user_id) where user_id is not null;

-- Soft dedupe signals for ops review. NON-unique on purpose: a hard uniqueness
-- constraint on phone/email would reject legitimate signups (franchises, shared
-- office lines). These exist so a human can spot clusters, not so the DB refuses.
create index if not exists contractors_contact_phone_idx
  on public.contractors (contact_phone) where contact_phone is not null;
create index if not exists contractors_contact_email_idx
  on public.contractors (lower(contact_email)) where contact_email is not null;


-- ========================================================================
-- 0073_terms_and_consent.sql
-- ========================================================================

-- Terms-of-service acceptance ledger + SMS consent flag (0073). RUN AGAINST LIVE DB.
--
-- terms_acceptances is an append-only audit trail: every time a user checks
-- the "I agree" box on a signup/consent flow we record one row here (see
-- src/app/(auth)/recordTermsAcceptance.ts). No update/delete policy on
-- purpose - a consent record that could be silently edited or removed after
-- the fact is worthless as evidence of acceptance.
--
-- user_id references public.users(id), not auth.users(id): the app-facing
-- identity table (0001_initial_schema.sql), same as every other user-owned
-- table in this schema.
create table if not exists public.terms_acceptances (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  doc          text not null,
  version      text not null,
  accepted_at  timestamptz not null default now(),
  ip           text,
  user_agent   text
);

create index if not exists terms_acceptances_user_id_idx
  on public.terms_acceptances (user_id);

alter table public.terms_acceptances enable row level security;

drop policy if exists "terms_acceptances read own" on public.terms_acceptances;
create policy "terms_acceptances read own" on public.terms_acceptances
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "terms_acceptances insert own" on public.terms_acceptances;
create policy "terms_acceptances insert own" on public.terms_acceptances
  for insert to authenticated with check (auth.uid() = user_id);

-- No update/delete policy: acceptances are append-only. The admin client used
-- by recordTermsAcceptance() bypasses RLS anyway, but the policy is still the
-- documented contract for any authenticated-role access.

-- SMS consent (TCPA): tracked separately from terms acceptance since it's an
-- opt-in, not a contract term, and needs its own timestamp for proof of consent.
alter table public.users
  add column if not exists sms_consent boolean not null default false,
  add column if not exists sms_consent_at timestamptz;


-- ========================================================================
-- 0074_orange_county.sql
-- ========================================================================

-- Orange County, CA launch restriction (0074). RUN AGAINST LIVE DB, AFTER 0073.
--
-- Hearth is launching in Orange County, CA only. Three changes:
--
-- 1. contractors.serves_orange_county: a pro must explicitly confirm they
--    serve Orange County before they can see or apply to jobs. Defaults to
--    false so every existing pro is opted OUT until they confirm (see
--    src/app/pro/actions.ts saveCompanyAction) - a hard gate, not a soft
--    preference like service_state.
--
-- 2. market_waitlist: a pro or homeowner outside the launch area lands here
--    instead of getting an account, so Hearth can reach out when it opens in
--    their area. Insert-only from the client (anon covers the homeowner
--    landing-page form, which runs before sign-in); no select policy, so the
--    table is admin-read only.
--
-- 3. open_jobs_for_me(): identical to 0047_job_budget.sql's definition
--    (budget_range preserved), plus (a) the property city in the return set
--    and (b) a hard `c.serves_orange_county = true` filter. Unlike the
--    service_state locality match, this is NOT permissive: a pro who hasn't
--    confirmed Orange County sees nothing, full stop.
--
-- Safe to re-run.
-- =============================================================================

-- ---- Orange County opt-in on the contractor row -------------------------------
alter table public.contractors
  add column if not exists serves_orange_county boolean not null default false;

comment on column public.contractors.serves_orange_county is
  'Pro explicitly confirmed they serve Orange County, CA (Hearth''s launch '
  'market). Hard gate on open_jobs_for_me() and applyToJobAction - defaults '
  'false, so every pro (new or existing) must opt in before they see or '
  'apply to jobs.';

-- ---- Market waitlist -----------------------------------------------------------
create table if not exists public.market_waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  role       text not null check (role in ('homeowner', 'pro')),
  zip        text,
  state      text,
  created_at timestamptz not null default now()
);

create unique index if not exists market_waitlist_email_role_uidx
  on public.market_waitlist (lower(email), role);

alter table public.market_waitlist enable row level security;

-- Insert-only, from anon (pre-sign-in homeowner landing form) and
-- authenticated (a pro rejected at onboarding). No select policy: reading
-- the waitlist is admin-only, via the service-role client.
drop policy if exists "market_waitlist insert" on public.market_waitlist;
create policy "market_waitlist insert" on public.market_waitlist
  for insert to anon, authenticated with check (true);

-- ---- open_jobs_for_me: 0047's definition + city + Orange County gate -----------
drop function if exists public.open_jobs_for_me();
create function public.open_jobs_for_me()
returns table (
  id                uuid,
  category          text,
  timing            text,
  issue_description text,
  issue_severity    text,
  payout_amount     numeric,
  created_at        timestamptz,
  application_count bigint,
  has_photos        boolean,
  plus_poster       boolean,
  budget_range      text,
  city              text
) language sql security definer set search_path = public as $$
  select cl.id, cl.category, cl.timing, cl.issue_description,
         cl.issue_severity, cl.payout_amount, cl.created_at,
         (select count(*) from lead_applications la
           where la.lead_id = cl.id and la.refunded_at is null),
         (cl.issue_id is not null and exists (
           select 1 from photos p
           where p.related_type = 'issue' and p.related_id = cl.issue_id)),
         -- plus_poster: the property owner holds a LIVE homeowner Hearth Plus
         -- subscription. Mirrors src/lib/subscription.ts (isLiveProPlanRow's
         -- homeowner inverse): homeowner-side row (side, or a plan that is not
         -- a pro_ plan), active or trialing, and not past a known period end.
         -- This implements the /plus "priority matching" promise.
         exists (
           select 1
           from subscriptions s
           where s.user_id = pr.user_id
             and (s.side = 'homeowner'
                  or s.plan is null
                  or s.plan not like 'pro\_%' escape '\')
             and s.status in ('active', 'trialing')
             and (s.current_period_end is null or s.current_period_end > now())
         ) as plus_poster,
         cl.budget_range,
         pr.city
  from contractor_leads cl
  join contractors c on c.user_id = auth.uid()
  left join properties pr on pr.id = cl.property_id
  where cl.contractor_id is null
    and cl.status = 'new'
    and (c.categories is null or cl.category = any (c.categories))
    -- LOCALITY: state-level match, cold-start safe. A job is hidden ONLY when
    -- BOTH sides have a state and the states differ. A pro without a
    -- service_state (null = grandfathered) sees everything, and a property
    -- without a state on file is shown to everyone: never hide jobs from
    -- unconfigured data.
    and (c.service_state is null
         or pr.state is null
         or upper(btrim(pr.state)) = upper(btrim(c.service_state)))
    -- ORANGE COUNTY LAUNCH GATE: hard filter, not permissive like the state
    -- match above. A pro who hasn't explicitly confirmed they serve Orange
    -- County sees nothing here.
    and c.serves_orange_county = true
    and not exists (
      select 1 from lead_applications la
      where la.lead_id = cl.id and la.contractor_id = c.id
    )
  -- PRIORITY: Plus posters' jobs first (the sold promise), newest first within
  -- each band. The pro board's default "new" sort keeps this DB order.
  order by plus_poster desc, cl.created_at desc;
$$;


-- ========================================================================
-- 0075_winback_user_guard.sql
-- ========================================================================

-- =============================================================================
-- Hearth - winback credit: survive a contractor/wallet rebuild (0075)
-- RUN THIS AGAINST THE LIVE DATABASE (Supabase SQL editor).
--
-- 0038's guard is once-per-WALLET-ever (a wallet_transactions row on the
-- wallet). 0072 made it one contractor row per user, which already stops a
-- single account from minting two wallets and double-collecting. What it
-- does not stop: a user deletes their contractor row (cascades the wallet,
-- per 0010) and onboards a fresh one under the SAME auth account. That
-- rebuilds a brand-new, empty wallet with no winback_credit row, so 0038's
-- guard alone would grant a second time to the same person.
--
-- Fix: also record the grant against the user, not just the wallet, via
-- 0071's promo_claims (key 'winback_credit', ref = contractor id). That
-- claim outlives any contractor/wallet rebuild for the same auth user, so
-- the guard now survives identity being rebuilt underneath it, not just
-- replayed against the same row.
--
-- This does NOT address N separate accounts (distinct auth users) each
-- claiming once - that needs identity dedup (email/phone/device), which is
-- a deliberately deferred, separate, heavier decision (see 0072's non-unique
-- contact_phone/contact_email indexes: soft signals for human review only,
-- not an automated block, because a hard constraint there would also reject
-- legitimate franchises/shared office lines).
--
-- Everything else here is 0038 unchanged: same locking, same 14-day/broke-
-- and-quiet eligibility, same return contract (true iff granted). The cron
-- caller (src/app/api/cron/pro-winback) already treats any non-true return
-- as "skip, don't grant" and loops on to the next candidate, so it needs no
-- change for this to take effect.
--
-- Safe to re-run.
-- =============================================================================

create or replace function public.grant_winback_credit(p_contractor uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_created timestamptz;
  v_user uuid;
  v_wallet uuid;
  v_cash bigint;
  v_bonus bigint;
  v_cash_after bigint;
  v_bonus_after bigint;
begin
  if p_contractor is null then return false; end if;
  select created_at, user_id into v_created, v_user from contractors where id = p_contractor;
  if v_created is null then return false; end if;

  v_wallet := get_or_create_wallet(p_contractor);

  -- Serialize concurrent calls for the same wallet: two overlapping cron runs
  -- both reach the guard below, and without this lock both could pass it. The
  -- second waits here, then sees the first's ledger row (same as 0034).
  -- Locking and reading the balances in one statement means the eligibility
  -- check below runs against post-lock values, never a stale snapshot.
  select cash_balance_cents, bonus_balance_cents into v_cash, v_bonus
    from wallets where id = v_wallet
    for update;

  -- Idempotency guard: once per contractor, ever. Any prior win-back row on
  -- this wallet, whatever its note says, means the credit was already given.
  if exists (
    select 1 from wallet_transactions
    where wallet_id = v_wallet and type = 'winback_credit'
  ) then
    return false;
  end if;

  -- Eligibility, verified in-DB after the lock. Two ways in:
  --   (a) never got going: onboarded 14+ days ago and zero applications ever
  --   (b) broke and quiet: wallet at exactly zero (cash and bonus), no
  --       application in the last 30 days, and onboarded 30+ days ago, so a
  --       brand-new signup with an (obviously) empty wallet does not qualify
  --       on day one.
  if not (
    (
      v_created <= now() - interval '14 days'
      and not exists (
        select 1 from lead_applications la
        where la.contractor_id = p_contractor
      )
    )
    or (
      coalesce(v_cash, 0) + coalesce(v_bonus, 0) = 0
      and v_created <= now() - interval '30 days'
      and not exists (
        select 1 from lead_applications la
        where la.contractor_id = p_contractor
          and la.created_at > now() - interval '30 days'
      )
    )
  ) then
    return false;
  end if;

  -- 0075: once per USER, ever, on top of the once-per-wallet guard above.
  -- claim_promo() inserts (user_id, 'winback_credit') and atomically reports
  -- whether it was new; false here means this account already collected the
  -- credit under some contractor row, so grant nothing even though this
  -- particular wallet's own ledger is clean. Skipped only when the
  -- contractor has no user_id (a deleted-user orphan, per 0005's "on delete
  -- set null") - there is no account to key on or to rebuild, so the
  -- wallet-only guard above is unchanged for that case, same as pre-0075.
  if v_user is not null
     and not coalesce(claim_promo(v_user, 'winback_credit', p_contractor::text), false)
  then
    return false;
  end if;

  -- Granted bonus behaves like bonus everywhere else: a tranche that expires
  -- (drawn FIFO by the spend paths) plus the wallet counter plus a ledger row.
  insert into bonus_grants (wallet_id, amount_cents, remaining_cents, expires_at)
    values (v_wallet, 1500, 1500, now() + interval '14 days');

  update wallets
     set bonus_balance_cents = bonus_balance_cents + 1500,
         updated_at = now()
   where id = v_wallet
   returning cash_balance_cents, bonus_balance_cents into v_cash_after, v_bonus_after;

  insert into wallet_transactions
    (wallet_id, type, bonus_delta_cents,
     cash_balance_after_cents, bonus_balance_after_cents, note)
    values (v_wallet, 'winback_credit', 1500,
            v_cash_after, v_bonus_after, 'One-time win-back credit');

  return true;
end; $$;

-- Cron-only entry point: no auth.uid() check inside, so client roles must
-- never be able to call it (same treatment as apply_deposit in 0019).
revoke all on function public.grant_winback_credit(uuid) from public;
revoke all on function public.grant_winback_credit(uuid) from anon;
revoke all on function public.grant_winback_credit(uuid) from authenticated;
grant execute on function public.grant_winback_credit(uuid) to service_role;
