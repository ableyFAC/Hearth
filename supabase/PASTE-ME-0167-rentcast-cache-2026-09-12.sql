-- =============================================================================
-- PASTE-ME-0167-rentcast-cache-2026-09-12.sql   (built 2026-09-12)
-- Everything not yet on live from this change: migration 0167 only.
-- Live is expected to be through 0162 (PASTE-ME-ALL-PENDING-2026-09-08.sql).
--
-- Paste the WHOLE file into the Supabase SQL editor and run it once. Every
-- statement is idempotent, so running it twice is a no-op, not an error. If a
-- section raises, read the message, fix the cause, and re-run the whole file.
--
-- WHAT IT DOES: adds public.rentcast_cache (one row per normalized address per
-- RentCast endpoint) and the service-role view public.rentcast_usage_monthly.
-- It grants NOTHING to authenticated/anon, deliberately - this is a copy of
-- supabase/migrations/0167_rentcast_cache.sql with the order guard below added
-- on top.
--
-- WHY IT MATTERS MORE THAN A NORMAL CACHE: RentCast's free tier is FIFTY calls
-- a month and the paid tier is waiting on the business card. Until this is
-- pasted, the app degrades on purpose rather than crashing - every read and
-- write of the table goes through isMissingSchemaError (src/lib/dbErrors.ts)
-- and falls back to "just call RentCast", which is exactly the behaviour that
-- existed before this change. Nothing breaks; the month's budget simply is not
-- protected, and the usage query at the bottom of this file returns nothing.
--
-- HOW TO SEE WHAT IS LEFT once it is applied:
--   select * from public.rentcast_usage_monthly order by month desc;
-- See docs/RENTCAST.md.
-- =============================================================================

-- ---- ORDER GUARD: do not paste this out of order ---------------------------
-- 0162 (one owner per address) is the last migration in the previous paste
-- bundle, and its index is the cheapest proof that bundle actually ran. If it
-- is missing, this database is behind and the earlier bundle has to go first.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'properties'
      and indexname = 'properties_address_unique'
  ) then
    raise exception
      'PRECHECK: index public.properties_address_unique (migration 0162) is missing, so this database has not run the 2026-09-08 paste bundle yet. Run supabase/PASTE-ME-ALL-PENDING-2026-09-08.sql FIRST, then this file. NOTHING WAS CHANGED.';
  end if;
end
$$;

-- ---- PRECHECK: the table the usage view reads ------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_events'
  ) then
    raise exception 'PRECHECK: public.app_events is missing. Apply migration 0093 before this file (the usage view below reads it). Nothing was changed.';
  end if;
end
$$;

-- ---- THE CALL CACHE --------------------------------------------------------
-- address_key is the app's normalized address line plus ZIP (and, for an AVM
-- only, the unit), produced by rentcastAddressKey in src/lib/rentcastCache.ts
-- off the SAME normalizers the onboarding confirm step uses
-- (houseNumberOf/streetTokensOf, src/lib/addressMatch.ts). It is deliberately
-- an opaque app-side string rather than an expression this file recomputes:
-- the canonicalization ("1770 South Harbor Boulevard" -> "1770 s harbor blvd")
-- lives in one place in TypeScript, and a second copy here in SQL could drift
-- from it silently and start missing every cache hit.
--
-- kind is the endpoint, because the two have different lifetimes: a property
-- record is permanent ('ok' served forever; a 'not_found' is re-asked after 90
-- days because coverage improves) and an estimate is not (served for 30 days). A 'quota' or 'error' row of either kind is served for
-- one hour - long enough that an outage costs one call instead of one per page
-- load, short enough that a transient failure is not frozen in front of a home
-- for the rest of the day.
create table if not exists public.rentcast_cache (
  address_key text        not null,
  kind        text        not null check (kind in ('property', 'avm')),
  status      text        not null check (status in ('ok', 'not_found', 'quota', 'error')),
  -- The parsed response body for an 'ok' row; null for every other status. A
  -- provider's error text is not worth keeping, and nothing reads it.
  payload     jsonb,
  fetched_at  timestamptz not null default now(),
  primary key (address_key, kind)
);

-- The app upserts on (address_key, kind); the primary key above is what that
-- ON CONFLICT target resolves to. Without it the upsert fails with 42P10,
-- which isMissingSchemaError (src/lib/dbErrors.ts) reads as "not migrated yet"
-- and degrades past - i.e. every call would silently stop being cached.

-- Sweeping stale negative rows by age is the only scan this table gets.
create index if not exists rentcast_cache_fetched_at_idx
  on public.rentcast_cache (fetched_at);

alter table public.rentcast_cache enable row level security;

-- NO POLICIES, deliberately. RLS on with zero policies denies every
-- user-facing role outright; the service-role client bypasses RLS and is the
-- only reader and writer. The revokes below are the belt to that brace, since
-- a future ALTER DEFAULT PRIVILEGES could otherwise hand out table grants.
revoke all on public.rentcast_cache from anon, authenticated;

comment on table public.rentcast_cache is
  'F2/F5: one row per (normalized address, RentCast endpoint), so the 50-calls/month free tier is never spent twice on the same question. Service-role only. A property ok is served forever, a property not_found for 90 days, and an avm (ok/not_found) for 30 days; quota/error rows are served for 1 hour to stop a retry storm without freezing a transient outage. Written by src/lib/rentcastCache.ts; sits under parcel_cache (0071), which caches derived facts and by design never caches a non-answer.';

-- ---- THE USAGE COUNTER -----------------------------------------------------
-- Every REAL outbound call (a cache hit is not a call) writes one app_events
-- row with event 'rentcast_call', from rentcastRequest in src/lib/parcel.ts.
-- This view is the answer to "how much of the month is left?", which is the
-- one question the free tier makes urgent.
--
-- security_invoker: the view runs with the CALLER's rights, so it cannot be
-- used as a hole through app_events' own service-role-only RLS (0093). Paired
-- with the revoke below, that makes it service-role only twice over.
drop view if exists public.rentcast_usage_monthly;
create view public.rentcast_usage_monthly
  with (security_invoker = true)
  as
select
  date_trunc('month', created_at)::date              as month,
  coalesce(props ->> 'endpoint', 'unknown')          as endpoint,
  count(*)                                           as calls
from public.app_events
where event = 'rentcast_call'
group by 1, 2;

revoke all on public.rentcast_usage_monthly from anon, authenticated;

comment on view public.rentcast_usage_monthly is
  'F4: billed RentCast calls per month per endpoint, from app_events rows with event=''rentcast_call'' (written by src/lib/parcel.ts on cache misses only). Service-role only. Read it with: select * from public.rentcast_usage_monthly order by month desc; - see docs/RENTCAST.md.';

-- ---- VERIFY -----------------------------------------------------------------
-- select table_name from information_schema.tables
--   where table_schema = 'public' and table_name = 'rentcast_cache';
-- -- expect one row.
--
-- select relrowsecurity from pg_class
--   where oid = 'public.rentcast_cache'::regclass;
-- -- expect true.
--
-- select count(*) from pg_policies
--   where schemaname = 'public' and tablename = 'rentcast_cache';
-- -- expect 0 (service-role only).
--
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public'
--     and table_name in ('rentcast_cache', 'rentcast_usage_monthly')
--     and grantee in ('anon', 'authenticated');
-- -- expect zero rows.
--
-- select * from public.rentcast_usage_monthly order by month desc;
-- -- the monthly call count. Zero rows until the first real (uncached) call.
