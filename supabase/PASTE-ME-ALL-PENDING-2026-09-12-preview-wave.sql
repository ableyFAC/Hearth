-- =============================================================================
-- OakTend - ALL PENDING MIGRATIONS, 2026-09-12 preview wave (0164 -> 0168)
-- RUN THIS AGAINST THE LIVE DATABASE (Supabase SQL editor), once, top to bottom.
--
-- Concatenation, in order, of the five standalone paste files:
--   0164 stripe connect accounts   (PASTE-ME-0164-stripe-connect-2026-09-12.sql)
--   0165 internal / test accounts  (PASTE-ME-0165-internal-accounts-2026-09-12.sql)
--   0166 campaign attribution      (PASTE-ME-0166-campaign-attribution-2026-09-12.sql)
--   0167 rentcast cache            (PASTE-ME-0167-rentcast-cache-2026-09-12.sql)
--   0168 pro waitlist + home cap   (PASTE-ME-0168-pro-waitlist-2026-09-12.sql)
-- Each section keeps its own PRECHECK guards (order, grants) and is idempotent,
-- so a re-run after a partial failure is safe: finished sections are no-ops.
-- Applies AFTER 0162 (live). 0163 belongs to the unmerged rename branch and is
-- independent of everything here; paste it with that merge.
-- =============================================================================



-- #############################################################################
-- ##  BEGIN 0164-stripe-connect
-- #############################################################################

-- =============================================================================
-- PASTE-ME-0164-stripe-connect-2026-09-12.sql   (built 2026-09-12)
-- Everything not yet on live as of 2026-09-12: migration 0164 only.
-- Live is expected to be through 0162 (PASTE-ME-ALL-PENDING-2026-09-08.sql).
--
-- Paste the WHOLE file into the Supabase SQL editor and run it once. It is one
-- transaction: if any section raises, nothing is applied - read the message,
-- fix the cause, re-run the whole file. Every statement is idempotent, so
-- running it twice is a no-op, not an error.
--
-- WHAT IT DOES: adds the seven Stripe Connect columns to public.contractors
-- plus the one partial unique index on stripe_account_id. It grants NOTHING to
-- authenticated/anon, deliberately - see the long GRANTS note in
-- supabase/migrations/0164_stripe_connect_accounts.sql, which this file is a
-- copy of with the two order guards below added on top.
--
-- UNTIL THIS IS PASTED: the app degrades on purpose rather than crashing.
-- Every read of these columns goes through isMissingSchemaError
-- (src/lib/dbErrors.ts) and falls back to the "unavailable" state, which shows
-- "Payouts aren't switched on yet. Check back soon." on /pro/payouts and hides
-- the Home nudge entirely. Nothing else on the pro side changes.
-- =============================================================================

-- ---- ORDER GUARD 1: do not paste this out of order ------------------------
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

-- ---- ORDER GUARD 2: the table this file extends -----------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'contractors'
  ) then
    raise exception 'PRECHECK: public.contractors is missing. Apply migration 0001 before this file. Nothing was changed.';
  end if;
end
$$;

-- ---- PRECHECK: the column locks this file relies on are still in place -----
-- 0069 (SELECT) and 0085 (UPDATE/INSERT) revoked the TABLE-LEVEL privileges on
-- public.contractors from authenticated/anon and re-granted column-scoped ones.
-- That is the only reason a newly added column is private by default. If a
-- table-level grant has come back, adding the columns below would hand a money
-- destination and Stripe's verification verdict to every signed-in pro's own
-- browser client. Refuse rather than do that quietly.
do $$
declare v_bad text;
begin
  select string_agg(distinct grantee || ':' || privilege_type, ', ')
    into v_bad
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'contractors'
    and grantee in ('authenticated', 'anon')
    and privilege_type in ('SELECT', 'INSERT', 'UPDATE');
  if v_bad is not null then
    raise exception
      'PRECHECK: public.contractors still carries TABLE-LEVEL privileges for authenticated/anon (%). Migrations 0069 and 0085 revoked those and re-granted column-scoped ones; while a table-level grant stands, every column added below is readable AND writable from a pro''s own browser session. Re-apply 0069 and 0085 first. NOTHING WAS CHANGED.',
      v_bad;
  end if;
end
$$;

-- ############################ 0164 starts here ###############################

-- ---- The columns ----------------------------------------------------------
alter table public.contractors
  add column if not exists stripe_account_id text;

alter table public.contractors
  add column if not exists stripe_charges_enabled boolean not null default false;

alter table public.contractors
  add column if not exists stripe_payouts_enabled boolean not null default false;

alter table public.contractors
  add column if not exists stripe_details_submitted boolean not null default false;

alter table public.contractors
  add column if not exists stripe_requirements_currently_due text[] not null default '{}';

alter table public.contractors
  add column if not exists stripe_disabled_reason text;

alter table public.contractors
  add column if not exists stripe_account_synced_at timestamptz;

-- One connected account per contractor, and one contractor per connected
-- account. Partial so the (many) rows with no account yet do not collide on
-- NULL. Also the backstop for the create race in ensureConnectAccount().
create unique index if not exists contractors_stripe_account_id_uidx
  on public.contractors (stripe_account_id)
  where stripe_account_id is not null;

-- ---- Column comments ------------------------------------------------------
comment on column public.contractors.stripe_account_id is
  'Stripe Connect (Express) account id (acct_...) for this contractor, created '
  'silently when the pro onboarding wizard completes (ensureConnectAccount in '
  'src/lib/stripeConnect.ts). Written ONLY by service_role (the admin client); '
  'never granted to authenticated/anon. Kept after a deauthorization for the '
  'audit trail - stripe_disabled_reason carries the state, not this column.';

comment on column public.contractors.stripe_charges_enabled is
  'Mirror of Stripe account.charges_enabled. Written ONLY by service_role, from '
  'the Connect webhook (account.updated) and the on-return sync. Never trust it '
  'as anything but a cache: the authority is Stripe.';

comment on column public.contractors.stripe_payouts_enabled is
  'Mirror of Stripe account.payouts_enabled. Written ONLY by service_role. '
  'Together with stripe_charges_enabled this is what canSendInvoices() '
  '(src/lib/connectStatus.ts) requires before step 2 lets an invoice be sent.';

comment on column public.contractors.stripe_details_submitted is
  'Mirror of Stripe account.details_submitted - the pro finished Express '
  'onboarding, whether or not Stripe has since enabled them. Written ONLY by '
  'service_role. Distinguishes "in progress" from "restricted" on /pro/payouts.';

comment on column public.contractors.stripe_requirements_currently_due is
  'Mirror of Stripe account.requirements.currently_due, the raw requirement '
  'keys. Rendered through humanizeRequirement() in src/lib/connectStatus.ts so '
  'a pro reads "A bank account to pay out to" rather than "external_account". '
  'Written ONLY by service_role.';

comment on column public.contractors.stripe_disabled_reason is
  'Mirror of Stripe account.requirements.disabled_reason, plus the one value '
  'OakTend writes itself: ''deauthorized'', set when Stripe sends '
  'account.application.deauthorized (the pro disconnected OakTend from their '
  'Stripe account). Written ONLY by service_role.';

comment on column public.contractors.stripe_account_synced_at is
  'When the six columns above were last mirrored from Stripe. Also the '
  'out-of-order guard: syncConnectAccount() refuses to apply an event older '
  'than the value already stored, so a late-delivered account.updated cannot '
  'walk a newer state backwards. Written ONLY by service_role.';

-- ---- VERIFY (run these AFTER the paste succeeds) ----------------------------
-- -- 1. The columns exist (expect seven rows):
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'contractors'
--   and column_name like 'stripe\_%'
-- order by column_name;
--
-- -- 2. The unique index exists (expect one row):
-- select indexname from pg_indexes
-- where schemaname = 'public' and tablename = 'contractors'
--   and indexname = 'contractors_stripe_account_id_uidx';
--
-- -- 3. THE IMPORTANT ONE - no grant reached these columns (expect ZERO rows):
-- select grantee, privilege_type, column_name
-- from information_schema.column_privileges
-- where table_schema = 'public' and table_name = 'contractors'
--   and grantee in ('authenticated', 'anon')
--   and column_name like 'stripe\_%';


-- #############################################################################
-- ##  BEGIN 0165-internal-accounts
-- #############################################################################

-- =============================================================================
-- PASTE-ME-0165-internal-accounts-2026-09-12.sql   (built 2026-09-12)
-- Everything not yet on live as of 2026-09-12 after 0164: migration 0165 only.
-- Live is expected to be through 0164
-- (supabase/PASTE-ME-0164-stripe-connect-2026-09-12.sql).
--
-- Paste the WHOLE file into the Supabase SQL editor and run it once. It is one
-- transaction: if any section raises, nothing is applied - read the message,
-- fix the cause, re-run the whole file. Every statement is idempotent, so
-- running it twice is a no-op, not an error.
--
-- WHAT IT DOES: adds the internal / test-account flag (Landen request E4).
-- users.is_internal and contractors.is_internal, two helper functions, and one
-- added predicate or guard clause in each of nine existing objects so that
-- INTERNAL SEES INTERNAL AND REAL SEES ONLY REAL. It grants NOTHING on either
-- new column, deliberately - see the GRANTS note in
-- supabase/migrations/0165_internal_accounts.sql, which everything below the
-- order guards is a byte-for-byte copy of.
--
-- NOTHING HAPPENS UNTIL YOU MARK AN ACCOUNT. Both columns default to false, so
-- applying this file changes no behaviour for anybody. The flag only starts
-- doing anything after the admin one-liner (at the bottom of the copied
-- migration, and in docs/INTERNAL-ACCOUNTS.md) is run for a specific account.
--
-- UNTIL THIS IS PASTED: the app degrades on purpose rather than crashing. Every
-- app-side read of these columns goes through isMissingSchemaError
-- (src/lib/dbErrors.ts) via src/lib/internalAccounts.ts and falls back to
-- "not internal", which is exactly today's behaviour. Nothing changes for
-- anyone until both this file and the admin one-liner have run.
--
-- THIS FILE RE-CREATES THREE MONEY FUNCTIONS (apply_to_lead,
-- unlock_direct_request, choose_applicant) and five read paths
-- (open_jobs_for_me, my_direct_requests, browse_pros, public_pro_profile,
-- contractor_reviews) plus one policy and one trigger function. Each one is
-- the LATEST body in supabase/migrations, copied byte-for-byte, plus exactly
-- one predicate or one guard clause. The migration names its source for every
-- single one. The PRECHECK block that follows the order guards fingerprints
-- each of those latest bodies on the live database first and refuses the whole
-- paste if any of them is behind, so this file can never silently roll back
-- 0153's insurance gate, 0161's self-apply guard, 0155's banner or 0107's
-- credit-back loop.
-- =============================================================================

-- ---- ORDER GUARD 1: do not paste this out of order ------------------------
-- 0164 (Stripe Connect columns) is the previous paste. Its partial unique
-- index is the cheapest proof that file actually ran. If it is missing, this
-- database is behind and 0164 has to go first.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'contractors'
      and indexname = 'contractors_stripe_account_id_uidx'
  ) then
    raise exception
      'PRECHECK: index public.contractors_stripe_account_id_uidx (migration 0164) is missing, so this database has not run the 0164 paste yet. Run supabase/PASTE-ME-0164-stripe-connect-2026-09-12.sql FIRST, then this file. NOTHING WAS CHANGED.';
  end if;
end
$$;

-- ---- ORDER GUARD 2: the two tables this file extends ------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'users'
  ) then
    raise exception 'PRECHECK: public.users is missing. Apply migration 0001 before this file. Nothing was changed.';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'contractors'
  ) then
    raise exception 'PRECHECK: public.contractors is missing. Apply migration 0001 before this file. Nothing was changed.';
  end if;
end
$$;

-- ---- ORDER GUARD 3: the column locks this file relies on are still in place -
-- 0069 (SELECT) and 0085 (UPDATE/INSERT) revoked the TABLE-LEVEL privileges on
-- public.contractors from authenticated/anon and re-granted column-scoped
-- ones. That is the ONLY reason contractors.is_internal is private by default:
-- this file grants nothing on it. If a table-level grant has come back, adding
-- the column below would hand every signed-in pro's own browser client the
-- ability to read AND clear its own test-account flag - which is the entire
-- control this feature rests on. Refuse rather than do that quietly. Same
-- guard, and the same reasoning, as the 0164 paste.
do $$
declare v_bad text;
begin
  select string_agg(distinct grantee || ':' || privilege_type, ', ')
    into v_bad
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'contractors'
    and grantee in ('authenticated', 'anon')
    and privilege_type in ('SELECT', 'INSERT', 'UPDATE');
  if v_bad is not null then
    raise exception
      'PRECHECK: public.contractors has TABLE-LEVEL grants back on (%). Migrations 0069/0085 revoked those so that a newly added column is private by default; with them in place contractors.is_internal would be readable and writable by every signed-in account. Re-apply 0069 and 0085 first. NOTHING WAS CHANGED.',
      v_bad;
  end if;
end
$$;

-- ---- ORDER GUARD 4: the users column lock must still be armed ---------------
-- users.is_internal is protected by the 0139 trigger, not by a grant. Part 3
-- below re-creates that trigger function with is_internal added to its LOCKED
-- list - but if the trigger itself is gone, re-creating the function protects
-- nothing and every signed-in account could clear its own flag with one PATCH.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.users'::regclass
      and tgname = 'users_column_lock'
      and not tgisinternal
  ) then
    raise exception
      'PRECHECK: trigger users_column_lock on public.users is missing (migration 0139). Without it, users.is_internal would be writable from any account session. Apply 0139 first. NOTHING WAS CHANGED.';
  end if;
end
$$;


-- =============================================================================
-- Everything below this line is supabase/migrations/0165_internal_accounts.sql,
-- copied verbatim. Do not edit it here - edit the migration and rebuild.
-- =============================================================================

-- =============================================================================
-- OakTend - internal / test accounts flag (0165)
-- RUN THIS AGAINST THE LIVE DATABASE (Supabase SQL editor).
--
-- Landen request E4 (2026-09-12): the team's own test accounts - a homeowner
-- account and a contractor account we sign in as to walk the product - are
-- currently indistinguishable from real ones. Their jobs land on the real pro
-- job board, their pro profile shows up in browse/search/the public directory
-- and the sitemap, and a real pro can pay real wallet money to apply to a job
-- that was never a job. This migration marks those accounts and makes them
-- invisible to real users.
--
-- THE RULE, in one line: INTERNAL SEES INTERNAL, REAL SEES ONLY REAL.
--   * an internal homeowner's open jobs and direct requests reach internal
--     pros only; a real homeowner's reach real pros only.
--   * an internal contractor is listed, profiled and reviewable only for an
--     internal homeowner; a real contractor only for a real homeowner. An
--     anonymous visitor is never internal, so the public web only ever sees
--     real pros.
--   * everything else keeps working for the internal accounts themselves.
--     Nothing is hidden from an account about its OWN rows: an internal pro
--     still reads their own contractors row, their own leads, their own chats,
--     their own wallet. The flag only ever filters the OTHER side.
--
-- WHY SYMMETRIC (and not just "hide internal from real"). Both halves are
-- needed for the pairing rules below to be coherent. apply_to_lead /
-- unlock_direct_request refuse a cross-internal pairing in BOTH directions
-- (an internal pro must not pay for a real homeowner's job either - that is
-- real money against a real lead from a test account), so a board that showed
-- an internal pro every real job would be showing them jobs they cannot apply
-- to. The same argument runs on the homeowner side: an internal homeowner who
-- could still see real pros could still send a real pro a direct request.
-- Matching the two flags is the only shape where the list and the action
-- agree. See docs/INTERNAL-ACCOUNTS.md.
--
-- WHAT THIS ADDS
--   Part 1   users.is_internal, contractors.is_internal + two partial indexes
--   Part 2   is_internal_user() / is_internal_contractor() helpers
--   Part 3   0139's column-lock trigger, +1 entry: users.is_internal
--   Part 4   contractors.is_internal follows the owning user (2 triggers)
--   Part 5   open_jobs_for_me()            0161's body + one predicate
--   Part 6   my_direct_requests()          0116's body + one predicate
--   Part 7   "contractors read" policy     0069's body + one predicate
--   Part 8   browse_pros()                 0154's body + one predicate
--   Part 9   public_pro_profile()          0155's body + one predicate
--   Part 10  contractor_reviews()          0138's body + one predicate
--   Part 11  apply_to_lead()               0161's body + one guard clause
--   Part 12  unlock_direct_request()       0153's body + one guard clause
--   Part 13  choose_applicant()            0107's body + one guard clause
--
-- SERVICE-ROLE ONLY, BOTH COLUMNS. This is the whole point of the feature: an
-- account must not be able to un-mark itself (a real account that set
-- is_internal would vanish from every real pro's board while still costing
-- nothing, and an internal account that cleared it would start spending other
-- people's money again).
--   * public.users carries 0139's BEFORE UPDATE column-lock trigger, whose
--     LOCKED list is an explicit allow-list. Part 3 re-creates
--     enforce_users_column_lock() with 0139's body (the LATEST body in this
--     folder - no migration after 0139 re-creates it; grep confirms) and ONE
--     added array entry, 'is_internal'. Service-role and platform-role writes
--     still return early, so every admin-client path is unaffected.
--   * public.contractors needs NOTHING added. 0069 revoked table-level SELECT
--     from authenticated/anon and granted it back column-scoped (id, user_id,
--     name, categories, service_area, rating, review_count, license_number,
--     contact_phone, contact_email, slug, logo_url, about, created_at), and
--     0085 did the same for UPDATE/INSERT (later widened, column by column, by
--     0098 / 0124 / 0128 / 0141 - every one of them a named-column grant).
--     A column that is in none of those lists is not readable and not writable
--     by authenticated or anon. is_internal is in none of them. GRANT NOTHING
--     is therefore the complete answer, and this migration grants nothing on
--     either column - same posture, and the same reasoning, as 0164's Stripe
--     Connect columns.
--   * The "contractors read" policy in Part 7 still REFERENCES is_internal.
--     That is fine and is not a hole: an RLS policy expression is evaluated by
--     the system, not by the querying role, so column privileges never apply
--     to it. The policy can read a column the caller cannot select.
--
-- HELPER FUNCTIONS are SECURITY DEFINER + STABLE + set search_path = public,
-- and do exactly one indexed lookup each. They run inside policies and inside
-- the WHERE clause of list functions, so they have to stay this cheap. STABLE
-- (not VOLATILE) is what lets the planner evaluate is_internal_user(auth.uid())
-- once per query instead of once per row.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, CREATE OR
-- REPLACE / DROP + CREATE for functions, DROP + CREATE for policies and
-- triggers. Safe to re-run.
--
-- DEPENDS ON: 0139 (column lock), 0069 (contractors read + column grants),
-- 0085 (contractors column grants), 0107 (choose_applicant), 0116
-- (my_direct_requests), 0138 (contractor_reviews), 0153
-- (unlock_direct_request), 0154 (browse_pros), 0155 (public_pro_profile),
-- 0161 (open_jobs_for_me, apply_to_lead). Run AFTER 0164.
-- =============================================================================


-- ---- PRECHECK: refuse to run against a database that is not ready ----------
-- Every function below is re-created from the LATEST body in this folder. If
-- the live database is behind one of those, replacing it here would silently
-- roll that work back, so each one is fingerprinted first and nothing is
-- applied unless all of them match.
do $precheck$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'open_jobs_for_me' and pronamespace = 'public'::regnamespace
      and prosrc like '%pr.user_id is distinct from auth.uid()%'
  ) then
    raise exception 'PRECHECK: public.open_jobs_for_me() is not on 0161''s body (no SEC-1 owner exclusion). Apply 0161 before this file. Nothing was changed.';
  end if;
  if not exists (
    select 1 from pg_proc
    where proname = 'apply_to_lead' and pronamespace = 'public'::regnamespace
      and prosrc like '%You cannot apply to your own job.%'
  ) then
    raise exception 'PRECHECK: public.apply_to_lead() is not on 0161''s body (no SEC-1 self-apply guard). Apply 0161 before this file. Nothing was changed.';
  end if;
  if not exists (
    select 1 from pg_proc
    where proname = 'unlock_direct_request' and pronamespace = 'public'::regnamespace
      and prosrc like '%Insurance required for big jobs%'
  ) then
    raise exception 'PRECHECK: public.unlock_direct_request() is not on 0153''s body (no big-job insurance gate). Apply 0153 before this file. Nothing was changed.';
  end if;
  if not exists (
    select 1 from pg_proc
    where proname = 'public_pro_profile' and pronamespace = 'public'::regnamespace
      and prosrc like '%banner_url%'
  ) then
    raise exception 'PRECHECK: public.public_pro_profile() is not on 0155''s body (no banner_url). Apply 0155 before this file. Nothing was changed.';
  end if;
  if not exists (
    select 1 from pg_proc
    where proname = 'enforce_users_column_lock' and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'PRECHECK: public.enforce_users_column_lock() does not exist (migration 0139). Apply 0139 before this file. Nothing was changed.';
  end if;
end;
$precheck$;


-- =============================================================================
-- Part 1: the two columns
-- =============================================================================
alter table public.users
  add column if not exists is_internal boolean not null default false;

alter table public.contractors
  add column if not exists is_internal boolean not null default false;

comment on column public.users.is_internal is
  'True for an OakTend team / test account (0165). Service role only: listed '
  'in enforce_users_column_lock()''s LOCKED array, so no account session can '
  'set or clear it. Internal accounts only ever see other internal accounts, '
  'and are invisible to real ones. See docs/INTERNAL-ACCOUNTS.md.';

comment on column public.contractors.is_internal is
  'True for an OakTend team / test pro (0165). Follows the owning user: set '
  'on INSERT by contractors_internal_follows_user and kept in step by '
  'users_internal_propagates. Service role only - not in any column-level '
  'GRANT (0069 SELECT, 0085/0098/0124/0128/0141 INSERT/UPDATE), so '
  'authenticated and anon can neither read it nor write it.';

-- Partial, so each index holds only the handful of internal rows rather than
-- a bool entry per account. Every read below asks "is THIS row internal", so
-- the index matters far less than the column being cheap; these exist so an
-- admin sweep (`where is_internal`) over the whole table is instant.
create index if not exists users_is_internal_idx
  on public.users (id)
  where is_internal;

create index if not exists contractors_is_internal_idx
  on public.contractors (id)
  where is_internal;


-- =============================================================================
-- Part 2: the two helpers
-- =============================================================================
-- SECURITY DEFINER because they are called from inside the "contractors read"
-- policy (Part 7), where the caller is `authenticated` and has no SELECT
-- privilege on users.is_internal / contractors.is_internal at all. STABLE so
-- the planner may hoist is_internal_user(auth.uid()) out of a per-row loop.
-- A missing row reads as NOT internal, which is the safe default in every
-- call site below: an unknown account is treated as real, so nothing real is
-- ever hidden from a real user by a lookup that came up empty.
create or replace function public.is_internal_user(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select u.is_internal from public.users u where u.id = p_user),
    false
  );
$$;

create or replace function public.is_internal_contractor(p_contractor uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select c.is_internal from public.contractors c where c.id = p_contractor),
    false
  );
$$;

-- EXECUTE posture, following 0123's lesson (revoking from anon alone leaves
-- the default PUBLIC grant standing): strip PUBLIC first, then grant back the
-- one role that actually needs it. `authenticated` needs it because the
-- "contractors read" policy in Part 7 evaluates is_internal_user() as the
-- querying role. `anon` does not: every anon-reachable surface
-- (public_pro_profile, contractor_reviews, browse_pros) is SECURITY DEFINER
-- and calls these as the function owner, never as anon.
revoke execute on function public.is_internal_user(uuid) from public;
revoke execute on function public.is_internal_contractor(uuid) from public;
grant execute on function public.is_internal_user(uuid) to authenticated;
grant execute on function public.is_internal_contractor(uuid) to authenticated;

comment on function public.is_internal_user(uuid) is
  'True when this auth user is an OakTend team / test account (0165). False '
  'for a null argument and for an unknown id, so an anonymous caller '
  '(auth.uid() is null) is never internal.';

comment on function public.is_internal_contractor(uuid) is
  'True when this contractors row is an OakTend team / test pro (0165). False '
  'for a null argument and for an unknown id.';


-- =============================================================================
-- Part 3: users.is_internal joins 0139's LOCKED list
-- =============================================================================
-- 0139's body byte-for-byte (it is the latest in this folder: nothing after it
-- re-creates this function), plus ONE array entry, 'is_internal'. Everything
-- else - the service-role/platform-role early return, the to_jsonb comparison,
-- the 42501 raise - is unchanged.
create or replace function public.enforce_users_column_lock()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Keep this in step with the table. A new counter, credit, plan flag,
  -- consent field or identity column on public.users belongs here the day it
  -- is added; anything not listed stays writable by the row's owner, which is
  -- the behaviour that existed before this migration.
  v_locked constant text[] := array[
    'id',
    'email',
    'created_at',
    'free_doc_reads_used',
    'free_inspection_reads_used',
    'free_quote_used_at',
    'free_plan_used_at',
    'sms_consent',
    'sms_consent_at',
    'referral_code',
    'referred_by',
    -- 0165: the internal / test-account flag. An account that could set this
    -- would disappear from every real pro's board while still costing
    -- nothing; one that could clear it would start spending real pros'
    -- wallet money again. Service role only, always.
    'is_internal'
  ];
  v_role    text;
  v_changed text[];
begin
  begin
    v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb
                ->> 'role';
  exception when others then
    v_role := null;
  end;

  if v_role = 'service_role'
     or current_user in ('service_role', 'postgres', 'supabase_admin',
                         'supabase_auth_admin')
  then
    return new;
  end if;

  -- Compared through jsonb rather than named IF branches so the list above is
  -- the single source of truth, and so a column that does not exist on this
  -- database yet reads NULL on both sides instead of failing to compile.
  -- `is distinct from` means a write that re-sends a locked column UNCHANGED
  -- is fine: only an actual change is refused, which keeps a plain profile
  -- save working even when it names more columns than it edits.
  select array_agg(t.col order by t.col)
    into v_changed
    from unnest(v_locked) as t(col)
   where to_jsonb(new) -> t.col is distinct from to_jsonb(old) -> t.col;

  if v_changed is not null then
    raise exception
      'These fields are managed by Hearth and cannot be changed from an account session: %',
      array_to_string(v_changed, ', ')
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists users_column_lock on public.users;
create trigger users_column_lock
  before update on public.users
  for each row execute function public.enforce_users_column_lock();

comment on function public.enforce_users_column_lock() is
  'BEFORE UPDATE guard on public.users (0139, latest body 0165). Raises 42501 '
  'when a locked column (paywall counters, consent record, referral '
  'attribution, id, email, created_at, and as of 0165 the is_internal test- '
  'account flag) actually changes and the caller is not the service role or a '
  'platform role.';


-- =============================================================================
-- Part 4: contractors.is_internal follows the owning user
-- =============================================================================
-- The failure this prevents: an internal homeowner account opens the pro side
-- to test it, a contractors row is created by ordinary onboarding, and that
-- row is REAL - it lands in browse, in /p/<id>, in the sitemap, and starts
-- getting real direct requests. Making the pro side inherit the flag on
-- INSERT closes that by construction; nobody has to remember the second half
-- of the admin one-liner.
--
-- SECURITY DEFINER on both: they read/write columns the calling role has no
-- privilege on. Neither one trusts anything the caller supplied except
-- new.user_id, which the "contractors insert own" policy (0005) has already
-- pinned to auth.uid() by the time a BEFORE INSERT trigger runs.
create or replace function public.contractors_set_internal_from_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.is_internal := public.is_internal_user(new.user_id);
  return new;
end;
$$;

drop trigger if exists contractors_internal_follows_user on public.contractors;
create trigger contractors_internal_follows_user
  before insert on public.contractors
  for each row execute function public.contractors_set_internal_from_user();

-- The other direction: flipping users.is_internal (service role only) carries
-- through to every contractors row that account owns, so the admin one-liner
-- at the bottom of this file is really only needed for rows that already
-- existed before the flag was set. Guarded on an actual change so an ordinary
-- profile save never writes contractors at all.
create or replace function public.users_propagate_internal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_internal is distinct from old.is_internal then
    update public.contractors
       set is_internal = new.is_internal
     where user_id = new.id
       and is_internal is distinct from new.is_internal;
  end if;
  return null;
end;
$$;

drop trigger if exists users_internal_propagates on public.users;
create trigger users_internal_propagates
  after update of is_internal on public.users
  for each row execute function public.users_propagate_internal();

comment on function public.contractors_set_internal_from_user() is
  'BEFORE INSERT on public.contractors (0165): a new pro row inherits the '
  'owning user''s is_internal, so a test pro created from an internal account '
  'is internal without anyone remembering to set it.';

comment on function public.users_propagate_internal() is
  'AFTER UPDATE OF is_internal on public.users (0165): keeps that account''s '
  'contractors rows in step with the flag.';


-- =============================================================================
-- Part 5: open_jobs_for_me() - 0161's body + the internal-matching predicate
-- =============================================================================
-- 0161's body byte-for-byte (the latest in this folder: 0161
-- lead_owner_exclusion, Part 1), plus ONE added WHERE clause:
--
--   and public.is_internal_user(pr.user_id) = public.is_internal_user(auth.uid())
--
-- Both sides are plain booleans, never null (the helpers coalesce), so this is
-- a total comparison and needs no `is not distinct from`. A lead whose
-- properties row failed to join reads as a real (non-internal) owner, which is
-- the pre-0165 behaviour for every real pro and hides it only from internal
-- pros - the safe direction.
--
-- DROP + CREATE, not CREATE OR REPLACE: the RETURNS TABLE shape is unchanged
-- from 0161, but that is the convention in this folder for this function
-- (0096, 0104, 0116, 0155, 0161 all did it), and re-running CREATE FUNCTION
-- reproduces its always-been-default EXECUTE-to-PUBLIC posture, so no grant
-- statement is needed here either.
drop function if exists public.open_jobs_for_me();
create function public.open_jobs_for_me()
returns table (
  id                 uuid,
  category           text,
  timing             text,
  issue_description  text,
  issue_severity     text,
  payout_amount      numeric,
  created_at         timestamptz,
  application_count  bigint,
  has_photos         boolean,
  plus_poster        boolean,
  budget_range       text,
  city               text,
  ownership_verified boolean,
  photo_urls         text[],
  square_footage     integer,
  material_notes     text,
  has_plans_permits  boolean,
  homeowner_display  text
) language sql security definer set search_path = public as $$
  select cl.id, cl.category, cl.timing, cl.issue_description,
         cl.issue_severity, cl.payout_amount, cl.created_at,
         (select count(*) from lead_applications la
           where la.lead_id = cl.id and la.refunded_at is null),
         (cl.issue_id is not null and exists (
           select 1 from photos p
           where p.related_type = 'issue' and p.related_id = cl.issue_id)),
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
         pr.city,
         coalesce(pr.ownership_status = 'verified', false) as ownership_verified,
         (select array_agg(p.url order by p.uploaded_at)
            from photos p
           where p.related_type = 'issue'
             and p.related_id = cl.issue_id) as photo_urls,
         cl.square_footage,
         cl.material_notes,
         cl.has_plans_permits,
         -- First name + last initial only (C4): never the full name before a
         -- pro has applied and the homeowner has accepted them.
         case
           when cl.homeowner_name is null or btrim(cl.homeowner_name) = '' then null
           else (
             -- First name capped at 40 chars: homeowner_name has no length
             -- limit at the source (see the same cap in
             -- src/app/(app)/contractors/actions.ts), and this string is
             -- printed on a card, not a place for a 500-char "name".
             select case when array_length(parts, 1) > 1
                      then left(parts[1], 40) || ' '
                           || left(parts[array_length(parts, 1)], 1) || '.'
                      else left(parts[1], 40)
                    end
             from (select regexp_split_to_array(btrim(cl.homeowner_name), '\s+') as parts) s
           )
         end as homeowner_display
  from contractor_leads cl
  join contractors c on c.user_id = auth.uid()
  left join properties pr on pr.id = cl.property_id
  where cl.contractor_id is null
    and cl.status = 'new'
    and cl.direct_to is null
    -- 0161 SEC-1: never list a job the caller posted as a homeowner. A dual-
    -- side account (a contractors row AND a properties row on the same auth
    -- user) must not see, apply to, or pay to apply to its own job. `is
    -- distinct from` reads correctly even when pr.user_id is null (a
    -- property that failed to join): it only ever excludes the caller's own
    -- row, never anyone else's.
    and pr.user_id is distinct from auth.uid()
    -- 0165 internal accounts: the board pairs like with like. An internal
    -- (team test) homeowner's job is listed only for an internal pro, and a
    -- real homeowner's job only for a real pro. Both halves matter: the
    -- first keeps test jobs off real pros' boards, the second keeps this
    -- list in step with apply_to_lead, which refuses a cross-internal apply
    -- in both directions - a board row a pro cannot act on is worse than no
    -- row. Cheap: is_internal_user is STABLE, so auth.uid()'s side is
    -- evaluated once for the whole query, and the owner's side is one
    -- primary-key lookup per candidate row.
    and public.is_internal_user(pr.user_id) = public.is_internal_user(auth.uid())
    and (c.categories is null or cl.category = any (c.categories))
    and (c.service_state is null
         or pr.state is null
         or upper(btrim(pr.state)) = upper(btrim(c.service_state)))
    and c.serves_orange_county = true
    and public.launch_city_for_zip(pr.zip) = any (c.launch_cities)
    and not exists (
      select 1 from user_blocks b
      where (b.blocker_user_id = auth.uid() and b.blocked_user_id = pr.user_id)
         or (b.blocker_user_id = pr.user_id and b.blocked_user_id = auth.uid())
    )
    and not exists (
      select 1 from lead_applications la
      where la.lead_id = cl.id and la.contractor_id = c.id
    )
  order by plus_poster desc, cl.created_at desc
  limit 200;
$$;

comment on function public.open_jobs_for_me() is
  'Open job board for the signed-in pro (0012, latest body 0165). 0161 added '
  'the SEC-1 owner-exclusion predicate; 0165 adds the internal-accounts '
  'predicate, which matches the lead owner''s is_internal against the '
  'caller''s so internal test jobs and real jobs never cross.';


-- =============================================================================
-- Part 6: my_direct_requests() - 0116's body + the same predicate
-- =============================================================================
-- 0116's body byte-for-byte (the latest in this folder: 0116
-- job_scope_fields, Part 3), plus the same one-line internal-matching
-- predicate open_jobs_for_me just grew. This is the direct-request half of
-- rule (b): a pending request from an internal homeowner reaches only an
-- internal pro. Drop + create keeps this function's house convention; the
-- return shape is unchanged from 0116.
drop function if exists public.my_direct_requests();
create function public.my_direct_requests()
returns table (
  id                uuid,
  category          text,
  timing            text,
  issue_description text,
  issue_severity    text,
  payout_amount     numeric,
  fee_cents         bigint,
  budget_range      text,
  city              text,
  has_photos        boolean,
  photo_urls        text[],
  created_at        timestamptz,
  square_footage    integer,
  material_notes    text,
  has_plans_permits boolean
) language sql security definer set search_path = public as $$
  select cl.id, cl.category, cl.timing, cl.issue_description,
         cl.issue_severity, cl.payout_amount,
         public.lead_fee_cents(cl.payout_amount, cl.created_at) as fee_cents,
         cl.budget_range,
         pr.city,
         (cl.issue_id is not null and exists (
           select 1 from photos p
           where p.related_type = 'issue' and p.related_id = cl.issue_id)) as has_photos,
         (select array_agg(p.url order by p.uploaded_at)
            from photos p
           where p.related_type = 'issue'
             and p.related_id = cl.issue_id) as photo_urls,
         cl.created_at,
         cl.square_footage,
         cl.material_notes,
         cl.has_plans_permits
  from contractor_leads cl
  join contractors c on c.user_id = auth.uid()
  left join properties pr on pr.id = cl.property_id
  where cl.direct_to = c.id
    and cl.contractor_id is null
    and cl.status = 'new'
    and cl.direct_declined_at is null
    -- 0165 internal accounts: same predicate as open_jobs_for_me. A pending
    -- direct request from an internal (team test) homeowner is shown only to
    -- an internal pro, and a real one only to a real pro - matching
    -- unlock_direct_request, which refuses a cross-internal unlock in both
    -- directions before any wallet is touched.
    and public.is_internal_user(pr.user_id) = public.is_internal_user(auth.uid())
  order by cl.created_at desc
  limit 200;
$$;

comment on function public.my_direct_requests() is
  'The target pro''s masked view of their pending direct requests (0105, '
  'latest body 0165). 0165 adds the internal-accounts predicate: the '
  'requesting homeowner''s is_internal must match the caller''s.';


-- =============================================================================
-- Part 7: "contractors read" - 0069's policy + the internal-matching predicate
-- =============================================================================
-- 0069's policy (the latest in this folder; 0002 created it and 0057/0059 only
-- mention it in comments) is:
--
--   using ( user_id = auth.uid() or public.contractor_related_to_me(id) )
--
-- and it grows ONE conjunct on the second arm only:
--
--   and coalesce(is_internal, false) = public.is_internal_user(auth.uid())
--
-- THE FIRST ARM IS DELIBERATELY UNTOUCHED. `user_id = auth.uid()` is the pro
-- reading their OWN row, and this feature must never hide an account from
-- itself - an internal pro whose own row went unreadable would be bounced to
-- /pro/onboarding on every page load. Only the "someone else's row" arm is
-- narrowed.
--
-- contractor_related_to_me() itself is NOT re-created. It answers "does this
-- homeowner have a lead or an application with this pro", which is a fact
-- about existing rows and stays true regardless of the flag; putting the
-- predicate in the policy instead keeps the helper single-purpose and keeps
-- this migration to one changed line. Note also that an already-related pair
-- can only exist across the internal boundary if it predates the flag, and in
-- that case hiding the row would break a job already in flight - so the
-- narrowing is applied here, at the directory level, and NOT to the
-- "leads contractor select" policy (0005), which is what a pro's own accepted
-- leads, contacts and chats hang off.
--
-- The policy may read is_internal even though `authenticated` has no SELECT
-- privilege on it (0069's column-scoped grant): RLS expressions are evaluated
-- by the system, not by the querying role.
drop policy if exists "contractors read" on public.contractors;
create policy "contractors read" on public.contractors
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      public.contractor_related_to_me(id)
      and coalesce(is_internal, false) = public.is_internal_user(auth.uid())
    )
  );


-- =============================================================================
-- Part 8: browse_pros() - 0154's body + the internal-matching predicate
-- =============================================================================
-- 0154's body byte-for-byte (the latest in this folder: 0154
-- free_profile_photos, Part 3), plus ONE added WHERE clause:
--
--   and coalesce(c.is_internal, false) = public.is_internal_user(auth.uid())
--
-- This is the homeowner-facing directory behind /contractors/browse. An
-- anonymous caller has a null auth.uid(), so is_internal_user() returns false
-- and the list collapses to real pros only - which is the correct answer for
-- the one anon path that still exists here (0154 re-granted EXECUTE to anon,
-- undoing 0123's revoke; that regression is NOT addressed in this migration,
-- but this predicate means the anon call can no longer leak a test pro).
--
-- CREATE OR REPLACE: the signature and the RETURNS TABLE shape are unchanged,
-- so the existing grants are preserved. The two grant lines below are 0154's
-- own, restated so this file leaves the posture exactly as it found it.
create or replace function public.browse_pros(p_category text default null)
returns table (
  id                    uuid,
  slug                  text,
  name                  text,
  categories            text[],
  rating                numeric,
  review_count          int,
  has_license           boolean,
  has_insurance         boolean,
  license_verified_at   timestamptz,
  background_checked_at timestamptz,
  logo_url              text,
  service_area          text,
  project_count         bigint,
  yelp_url              text,
  google_reviews_url    text,
  latest_review_comment text,
  latest_review_rating  int,
  photo_urls            text[],
  created_at            timestamptz
) language sql security definer stable set search_path = public as $$
  select
    c.id,
    c.slug,
    c.name,
    coalesce(c.categories, '{}') as categories,
    case when c.review_count > 0 then c.rating end as rating,
    c.review_count,
    -- Trust signals: FREE for every pro (0109). Not gated on m.live.
    (c.license_number is not null
      and btrim(c.license_number) <> '') as has_license,
    (c.insurance_carrier is not null
      and btrim(c.insurance_carrier) <> '') as has_insurance,
    c.license_verified_at,
    c.background_checked_at,
    -- FREE for every pro as of 0154 (2026-09-08): a profile photo is table
    -- stakes, not a paid perk. Was: case when m.live then c.logo_url end.
    c.logo_url,
    c.service_area,
    (select count(*) from pro_projects pp where pp.contractor_id = c.id) as project_count,
    -- Outbound review-page links (0110): free trust signal, plain links only.
    c.yelp_url,
    c.google_reviews_url,
    -- Newest review with a non-empty comment; both null when there is none.
    lr.comment as latest_review_comment,
    lr.rating  as latest_review_rating,
    -- Up to 3 project photos: "after" shots first, then newest first. Empty
    -- array (never null) when the pro has no photos.
    coalesce((
      select array_agg(ph3.url)
      from (
        select ph.url
        from public.pro_project_photos ph
        join public.pro_projects pj on pj.id = ph.project_id
        where pj.contractor_id = c.id
        order by ph.is_before asc, ph.created_at desc, ph.sort asc
        limit 3
      ) ph3
    ), '{}'::text[]) as photo_urls,
    c.created_at
  from contractors c
  cross join lateral (
    -- Mirrors hasProPlan(): a pro_ plan, active or trialing, not past a known
    -- period end. As of 0154 it no longer gates the logo; kept for parity with
    -- public_pro_profile, which still gates about / before-after labels on it.
    select exists (
      select 1
      from public.subscriptions s
      where s.user_id = c.user_id
        and s.plan like 'pro\_%' escape '\'
        and s.status in ('active', 'trialing')
        and (s.current_period_end is null or s.current_period_end > now())
    ) as live
  ) m
  left join lateral (
    -- Most recent review that actually has a comment. reviews.rating is
    -- smallint (0009); cast so it matches the declared int return column.
    select r.comment, r.rating::int as rating
    from public.reviews r
    where r.contractor_id = c.id
      and r.comment is not null
      and btrim(r.comment) <> ''
    order by r.created_at desc
    limit 1
  ) lr on true
  where c.user_id is not null
    -- ORANGE COUNTY LAUNCH GATE: hard filter, same as open_jobs_for_me /
    -- can_preview_job_photo. A homeowner must not reach a pro who has not
    -- confirmed they serve the launch market.
    and c.serves_orange_county = true
    -- 0165 internal accounts: an internal (team test) pro is listed only for
    -- an internal homeowner, and a real pro only for a real homeowner. An
    -- anonymous caller's auth.uid() is null, so is_internal_user() is false
    -- and the anon view of this directory is real pros only.
    and coalesce(c.is_internal, false) = public.is_internal_user(auth.uid())
    and (p_category is null or p_category = any (c.categories))
  order by
    (c.license_verified_at is not null) desc,
    case when c.review_count > 0 then c.rating end desc nulls last,
    c.review_count desc,
    c.name asc
  limit 200;
$$;

grant execute on function public.browse_pros(text) to anon;
grant execute on function public.browse_pros(text) to authenticated;


-- =============================================================================
-- Part 9: public_pro_profile() - 0155's body + the internal-matching predicate
-- =============================================================================
-- 0155's body byte-for-byte (the latest in this folder: 0155
-- pro_cover_banner, Part 2), plus ONE conjunct on the trailing WHERE, which
-- already reads `where c.id = p_contractor and c.user_id is not null and
-- coalesce(c.serves_orange_county, false)`:
--
--   and coalesce(c.is_internal, false) = public.is_internal_user(auth.uid())
--
-- This ONE line is what closes the whole public surface for a test pro. The
-- function returns NULL when it matches no row, and every caller already
-- treats that as "no such pro":
--   * src/app/p/[id]/page.tsx           -> notFound()
--   * src/app/p/[id]/opengraph-image.tsx-> generic branded fallback card
--   * src/app/api/pro-widget/[id]       -> 404
-- so no app-side change is needed for any of the three, and an internal pro
-- viewing their OWN public page still sees it (their is_internal matches).
create or replace function public.public_pro_profile(p_contractor uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id',           c.id,
    'slug',         c.slug,
    'name',         c.name,
    -- 0141: the owner's own name, under the business name on the public page.
    -- FREE for every pro, never gated on m.live.
    'owner_name',   c.owner_name,
    'categories',   coalesce(c.categories, '{}'),
    'created_at',   c.created_at,
    -- Rating exactly as the rest of the app shows it: only real review
    -- averages (review_count > 0), never seeded placeholder values.
    'rating',       case when c.review_count > 0 then c.rating end,
    'review_count', c.review_count,
    'member',       m.live,
    -- FREE for every pro as of 0154 (2026-09-08): a profile photo is table
    -- stakes, not a paid perk. Was: case when m.live then c.logo_url end.
    'logo_url',     c.logo_url,
    -- FREE for every pro as of 0155 (2026-09-09): a cover banner is
    -- presentation, not a paid perk. Same policy as logo_url above.
    'banner_url',   c.banner_url,
    -- Still a paid-member perk, still gated on m.live.
    'about',        case when m.live then c.about end,
    -- Trust signals: FREE for every pro (0109). Never gated on m.live.
    'has_license',  c.license_number is not null
                    and btrim(c.license_number) <> '',
    'has_insurance', c.insurance_carrier is not null
                    and btrim(c.insurance_carrier) <> '',
    -- Outbound review-page links (0110): trust signals, FREE for every pro.
    'yelp_url',            c.yelp_url,
    'google_reviews_url',  c.google_reviews_url,
    -- Real CSLB verification (0055). Free feature, not gated on membership.
    -- Only the timestamp, never the status text or CSLB detail.
    'license_verified_at', c.license_verified_at,
    -- Real Checkr background check (0057). Free feature, not gated on
    -- membership. Only the timestamp, never the status text or detail.
    'background_checked_at', c.background_checked_at,
    'reviews', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id',         r.id,
                 'rating',     r.rating,
                 'comment',    r.comment,
                 'created_at', r.created_at
               ) order by r.created_at desc)
      from (
        select id, rating, comment, created_at
        from public.reviews
        where contractor_id = c.id
        order by created_at desc
        limit 100
      ) r
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'title',       p.title,
                 'category',    p.category,
                 'description', p.description,
                 'months',      p.months,
                 'photos', coalesce((
                   select jsonb_agg(
                            jsonb_build_object(
                              'url',       ph.url,
                              -- Before/After labels are a member perk; the
                              -- photos themselves show for every pro.
                              'is_before', ph.is_before and m.live
                            ) order by ph.sort asc, ph.created_at asc)
                   from public.pro_project_photos ph
                   where ph.project_id = p.id
                 ), '[]'::jsonb)
               ) order by p.sort asc, p.created_at asc)
      from (
        select id, title, category, description, months, sort, created_at
        from public.pro_projects
        where contractor_id = c.id
        order by sort asc, created_at asc
        limit 12
      ) p
    ), '[]'::jsonb)
  )
  from public.contractors c
  cross join lateral (
    -- Mirrors hasProPlan(): a pro_ plan, active or trialing, not past a known
    -- period end. As of 0154 it no longer gates the logo, and as of 0155 not
    -- the banner either; it still gates the about blurb and before/after labels.
    select exists (
      select 1
      from public.subscriptions s
      where s.user_id = c.user_id
        and s.plan like 'pro\_%'
        and s.status in ('active', 'trialing')
        and (s.current_period_end is null or s.current_period_end > now())
    ) as live
  ) m
  where c.id = p_contractor
    and c.user_id is not null
    and coalesce(c.serves_orange_county, false)
    -- 0165 internal accounts: an internal (team test) pro has no public page
    -- for anyone but an internal homeowner. Anonymous callers - which is most
    -- of this function's traffic, including the OG card and the embeddable
    -- widget - have a null auth.uid() and so are never internal. The pro
    -- themselves still matches, so their own /p/<id> keeps working.
    and coalesce(c.is_internal, false) = public.is_internal_user(auth.uid());
$$;

grant execute on function public.public_pro_profile(uuid) to anon;
grant execute on function public.public_pro_profile(uuid) to authenticated;


-- =============================================================================
-- Part 10: contractor_reviews() - 0138's body + the internal-matching predicate
-- =============================================================================
-- 0138's body byte-for-byte (the latest in this folder: 0138 user_blocks,
-- Part 7). Its EXISTS subquery is documented there as "same predicate as
-- public_pro_profile's WHERE clause", so it grows the same one conjunct
-- public_pro_profile just did and stays in step with it. Zero rows is what
-- the review list already renders as "no reviews yet".
--
-- DROP + CREATE, as 0138 itself did: Postgres will not CREATE OR REPLACE over
-- a RETURNS TABLE function whose shape it cannot prove identical. The grants
-- below are 0138's own, restated because the drop discards them.
drop function if exists public.contractor_reviews(uuid);
create or replace function public.contractor_reviews(p_contractor uuid)
returns table (
  id         uuid,
  rating     smallint,
  comment    text,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select r.id, r.rating, r.comment, r.created_at
  from public.reviews r
  where r.contractor_id = p_contractor
    -- Same predicate as public_pro_profile's WHERE clause below. A pro with no
    -- account behind the row, or one outside the launch market, is not public,
    -- so their reviews are not public either. Returns zero rows, which is what
    -- the review list already renders as "no reviews yet".
    and exists (
      select 1
      from public.contractors c
      where c.id = p_contractor
        and c.user_id is not null
        and coalesce(c.serves_orange_county, false)
        -- 0165 internal accounts: kept in step with public_pro_profile, whose
        -- WHERE clause this mirrors. An internal (team test) pro's reviews
        -- are readable only by an internal homeowner.
        and coalesce(c.is_internal, false) = public.is_internal_user(auth.uid())
    )
  order by r.created_at desc
  limit 100;
$$;

revoke all on function public.contractor_reviews(uuid) from public;
grant execute on function public.contractor_reviews(uuid) to anon, authenticated, service_role;

comment on function public.contractor_reviews(uuid) is
  'Public review list for a pro (0018, latest body 0165). Mirrors '
  'public_pro_profile''s visibility rules: unclaimed, out-of-market and (0165) '
  'internal test pros return zero rows.';


-- =============================================================================
-- Part 11: apply_to_lead() - 0161's body + the internal-accounts guard
-- =============================================================================
-- 0161's body byte-for-byte (the latest in this folder: 0161
-- lead_owner_exclusion, Part 2), plus ONE guard clause, placed immediately
-- after 0161's own self-apply guard - the earliest point at which BOTH the
-- contractor (v_contractor, resolved at the top) and the lead owner (v_owner)
-- are known - and therefore still before the block check, before any wallet
-- read, and before any row is written. A refused apply moves no money.
--
-- BIDIRECTIONAL, deliberately. An internal pro applying to a real job is the
-- obvious case, but a real pro applying to an internal job is the one that
-- actually costs someone: real wallet money against a lead that was never a
-- real job. open_jobs_for_me no longer lists either pairing, and this is the
-- backstop for a pro who calls the RPC straight over PostgREST with a guessed
-- or leaked lead id - the same reasoning 0153 and 0161 both give for why their
-- gates have to live in SQL and not only in the server action.
--
-- MESSAGE: deliberately vague and identical to 0138's block wording, so it
-- cannot be used to probe which accounts are internal. The machine-readable
-- marker rides in HINT ('internal_account'), which src/app/pro/actions.ts can
-- match without parsing prose.
--
-- CREATE OR REPLACE: signature (uuid, text) -> boolean is unchanged, so the
-- existing EXECUTE grant to `authenticated` is preserved, exactly as 0149,
-- 0153 and 0161 each relied on.
create or replace function public.apply_to_lead(p_lead uuid, p_message text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid; v_wallet uuid; v_cats text[]; v_oc boolean;
  v_launch_cities text[]; v_lead_city text;
  v_lead_contractor uuid; v_status text; v_category text; v_price bigint;
  v_property uuid; v_owner uuid;
  v_cash bigint; v_bonus bigint; v_grant_sum bigint; v_bonus_avail bigint;
  v_from_cash bigint; v_from_bonus bigint;
  v_remaining bigint; v_grant record; v_cash_first boolean;
  v_cash_after bigint; v_bonus_after bigint;
  -- 0149: raw job age/price inputs, this pro's membership, and the pricing
  -- verdict recorded on the application row.
  v_payout numeric; v_created timestamptz;
  v_is_member boolean; v_aging_pct int; v_member_pct int;
  v_discount_kind text; v_price_before_intro bigint;
  -- 0153: this pro's insurance expiry (compliance calendar, 0051), for the
  -- big-job gate below.
  v_insurance_expires date;
begin
  perform set_config('hearth.lead_write', 'on', true);

  -- 0153: insurance_expires rides the contractors select this function
  -- already makes, so the gate costs no extra query.
  select id, categories, serves_orange_county, launch_cities, insurance_expires
    into v_contractor, v_cats, v_oc, v_launch_cities, v_insurance_expires
    from contractors where user_id = auth.uid();
  if v_contractor is null then raise exception 'Not a contractor'; end if;

  -- 0132: an open payment dispute freezes spending. has_open_chargeback() is
  -- true only while this pro's account carries an uncleared abuse_flags row of
  -- kind 'chargeback' (written by the Stripe webhook on
  -- charge.dispute.created). Placed here, immediately after the contractor
  -- resolves and BEFORE the job is read, before any wallet lock, and before a
  -- single cent moves: a pro who has charged back a wallet top-up is spending
  -- money the platform has already lost, and the wallet balance still says it
  -- is there. Cleared by setting abuse_flags.cleared_at (service role only), so
  -- a dispute that is won or withdrawn unfreezes the account without erasing
  -- that it happened.
  if public.has_open_chargeback(v_contractor) then
    raise exception 'There is an unresolved payment dispute on your account. Contact support.';
  end if;

  -- 0087 fix (MED): reproduce open_jobs_for_me()'s hard Orange County launch
  -- gate here too, so a pro who never confirmed serves_orange_county can't
  -- bypass the board by applying directly against a leaked/guessed lead id.
  if not coalesce(v_oc, false) then
    raise exception 'Confirm the cities you serve in your profile before applying to jobs';
  end if;

  -- 0149: read the raw price inputs instead of pre-pricing with
  -- lead_fee_cents (aging only) here - the pricing block right below needs
  -- this pro's membership too, and FOR UPDATE still serializes concurrent
  -- applies to the same job so the applicant cap below can't be raced past 3.
  select contractor_id, status, category, property_id, payout_amount, created_at
    into v_lead_contractor, v_status, v_category, v_property, v_payout, v_created
    from contractor_leads where id = p_lead
    for update;
  if v_category is null then raise exception 'Job not found'; end if;

  -- 0149: price this lead with the best SINGLE discount available - this
  -- pro's own OakTend Pro membership (10%) or the aging markdown, never both.
  -- is_pro_member mirrors isLiveProPlanRow() in src/lib/subscription.ts;
  -- lead_aging_pct is the same tiers lead_fee_cents (0031) already charges,
  -- as a bare percent. discount_kind is recorded on the application row
  -- below so the receipt and the board can both say what actually happened;
  -- ties (both 0) record null, and the flat member percent can never
  -- literally tie a nonzero aging tier at today's numbers, but the >=
  -- comparison keeps aging as the deterministic winner if it ever does.
  v_is_member := public.is_pro_member(auth.uid());
  v_aging_pct := public.lead_aging_pct(v_created);
  v_member_pct := case when v_is_member then 10 else 0 end;
  if v_aging_pct = 0 and v_member_pct = 0 then
    v_discount_kind := null;
  elsif v_aging_pct >= v_member_pct then
    v_discount_kind := 'aging';
  else
    v_discount_kind := 'member';
  end if;
  v_price := public.pro_lead_fee_cents(v_payout, v_created, v_is_member);

  if v_lead_contractor is not null then return false; end if;  -- already assigned
  if v_status <> 'new' then return false; end if;              -- not open
  if v_cats is not null and not (v_category = any (v_cats)) then
    raise exception 'Job is not in your categories';
  end if;
  if exists (
    select 1 from lead_applications
    where lead_id = p_lead and contractor_id = v_contractor
  ) then
    return true;  -- idempotent: already applied
  end if;

  -- 0153: big jobs need current insurance on file. The three categories are
  -- the major tier (mirror LEAD_FEES in src/lib/constants.ts and
  -- major_lead_price_cents, 0113); the date rule mirrors hasCurrentInsurance
  -- in src/lib/insuranceGate.ts (a date today or later passes, nothing on
  -- file or a past date fails). Deliberately AFTER the idempotent
  -- already-applied return above - a pro who already paid for this lead keeps
  -- the honest `true` on a retry even if their insurance lapsed since (same
  -- reasoning as 0124's launch-city gate placement) - and BEFORE any wallet
  -- read or write, so a refused apply moves no money. The raise text is what
  -- applyToJobAction matches on (isInsuranceGateSqlError) to show the
  -- friendly message; keep it stable.
  if v_category in ('roof', 'structural', 'remodeling')
     and (v_insurance_expires is null or v_insurance_expires < current_date) then
    raise exception 'Insurance required for big jobs';
  end if;

  -- 0124: the per-city half of the launch gate, mirroring the identical line
  -- open_jobs_for_me() filters the board on. Deliberately AFTER the
  -- already-applied idempotent return above: a pro who paid for this lead and
  -- later narrowed their launch_cities still gets the honest `true` on a
  -- retry, never a geography error for a job they already hold. Still before
  -- any money moves or any row is written.
  select public.launch_city_for_zip(p.zip) into v_lead_city
    from properties p where p.id = v_property;
  if v_lead_city is null or not (v_lead_city = any (coalesce(v_launch_cities, '{}'))) then
    raise exception 'This job is outside the cities you serve. Update your service area in your profile.';
  end if;

  -- One live lead per relationship (0060's rule): refuse when the pro already
  -- has an active job (not closed/lost) in this category on a property with
  -- the same owner. Closed/lost jobs never block, so rehires and repeat
  -- business stay wide open.
  select pr.user_id into v_owner from properties pr where pr.id = v_property;

  -- 0161 SEC-1: a dual-side account (homeowner AND pro on the same auth user)
  -- must not be able to pay to apply to its own posted job. Placed
  -- immediately after v_owner resolves - the earliest point this function
  -- knows who the property owner is - and before the block check, before
  -- any wallet read, and before any row is written, so a refused self-apply
  -- moves no money. Raised text is matched by applyToJobAction in
  -- src/app/pro/actions.ts for a friendly message; this SQL raise is the
  -- real enforcement (see this file's header for why it must live here and
  -- not only in the server action).
  if v_owner is not null and v_owner = auth.uid() then
    raise exception 'You cannot apply to your own job.';
  end if;

  -- 0165 internal accounts: an internal (team test) pro and a real homeowner
  -- must never transact, in either direction. open_jobs_for_me no longer
  -- lists the pairing; this is the backstop for a direct PostgREST call with
  -- a guessed or leaked lead id. Same placement reasoning as the SEC-1 guard
  -- directly above: before the block check, before any wallet read, before
  -- any write, so a refused apply moves no money. The message is deliberately
  -- the same vague wording 0138 uses for blocks so it cannot be used to probe
  -- which accounts are internal; HINT carries the machine marker.
  if public.is_internal_user(v_owner)
     is distinct from public.is_internal_contractor(v_contractor) then
    raise exception 'This job is not available to you.'
      using hint = 'internal_account';
  end if;

  -- 0138: a block between these two people. Symmetric, and worded without
  -- saying which side blocked whom - the pro must not be able to use this
  -- error to learn that a particular homeowner blocked them. Placed on the
  -- first line that knows who the homeowner is, and still before every wallet
  -- read, every debit, and every insert.
  if v_owner is not null and public.blocked_between(auth.uid(), v_owner) then
    raise exception 'This job is not available to you.';
  end if;

  if v_owner is not null and exists (
    select 1
    from contractor_leads active
    join properties ap on ap.id = active.property_id
    where active.contractor_id = v_contractor
      and active.category = v_category
      and active.status not in ('closed', 'lost')
      and ap.user_id = v_owner
  ) then
    raise exception 'Already working with this homeowner';
  end if;

  -- Applicant cap: 3 live (non-refunded) applications fill a job. Keep in sync
  -- with MAX_APPLICANTS_PER_JOB in src/lib/constants.ts.
  if (select count(*) from lead_applications
      where lead_id = p_lead and refunded_at is null) >= 3 then
    raise exception 'Job is full';
  end if;

  v_wallet := get_or_create_wallet(v_contractor);
  -- 0065 fix: FOR UPDATE so a concurrent charge against this same wallet
  -- (a different lead, or a ghost recharge) can't read a stale balance and
  -- push cash/bonus negative. See migration header for the race.
  select cash_balance_cents, bonus_balance_cents into v_cash, v_bonus
    from wallets where id = v_wallet
    for update;
  v_cash := coalesce(v_cash, 0);
  v_bonus := coalesce(v_bonus, 0);

  -- 0113: first big-ticket lead intro price. Deliberately placed AFTER the
  -- wallet FOR UPDATE above: all of a pro's charges serialize on that lock,
  -- so two racing major applies can never both read "no prior major payment"
  -- (see 0113's header). No-op for non-major categories and for any pro who
  -- has ever paid for a major lead.
  --
  -- 0149: the intro price is fixed and never further discounted by the
  -- member/aging pricing above - least() inside major_lead_price_cents just
  -- takes whichever is lower, so it can only ever push the charge DOWN to
  -- 4999, never below it. When it does undercut the member/aging price,
  -- discount_kind flips to 'intro' so the receipt names the real reason,
  -- not the discount it overrode.
  v_price_before_intro := v_price;
  v_price := public.major_lead_price_cents(v_contractor, v_category, v_price);
  if v_price < v_price_before_intro then
    v_discount_kind := 'intro';
  end if;

  -- Only bonus backed by live, unexpired grants is spendable. Capping at the
  -- grant sum makes the insufficient check honest and guarantees the FIFO drain
  -- below finds enough, so it can never zero out grants and then bail.
  select coalesce(sum(remaining_cents), 0) into v_grant_sum
    from bonus_grants
    where wallet_id = v_wallet and remaining_cents > 0 and expires_at > now();
  v_bonus_avail := least(v_bonus, v_grant_sum);

  if v_cash + v_bonus_avail < v_price then
    return false;  -- insufficient: prompt a deposit
  end if;

  select spend_cash_first into v_cash_first from wallet_config where id = 1;
  if v_cash_first then
    v_from_cash := least(v_cash, v_price);
    v_from_bonus := v_price - v_from_cash;
  else
    v_from_bonus := least(v_bonus_avail, v_price);
    v_from_cash := v_price - v_from_bonus;
  end if;

  if v_from_bonus > 0 then
    v_remaining := v_from_bonus;
    for v_grant in
      select * from bonus_grants
      where wallet_id = v_wallet and remaining_cents > 0 and expires_at > now()
      order by expires_at asc, created_at asc
    loop
      exit when v_remaining <= 0;
      if v_grant.remaining_cents >= v_remaining then
        update bonus_grants set remaining_cents = remaining_cents - v_remaining
         where id = v_grant.id;
        v_remaining := 0;
      else
        v_remaining := v_remaining - v_grant.remaining_cents;
        update bonus_grants set remaining_cents = 0 where id = v_grant.id;
      end if;
    end loop;
    if v_remaining > 0 then return false; end if;  -- unreachable safety net
  end if;

  update wallets
     set cash_balance_cents  = cash_balance_cents  - v_from_cash,
         bonus_balance_cents = bonus_balance_cents - v_from_bonus,
         updated_at = now()
   where id = v_wallet
   returning cash_balance_cents, bonus_balance_cents into v_cash_after, v_bonus_after;

  insert into lead_applications (lead_id, contractor_id, message, status, fee_cents, discount_kind)
    values (p_lead, v_contractor, nullif(btrim(p_message), ''), 'applied', v_price, v_discount_kind);

  insert into wallet_transactions
    (wallet_id, type, cash_delta_cents, bonus_delta_cents,
     cash_balance_after_cents, bonus_balance_after_cents, lead_id, note)
    values (v_wallet, 'apply_fee', -v_from_cash, -v_from_bonus,
            v_cash_after, v_bonus_after, p_lead, 'Applied to job');

  return true;
end; $$;

comment on function public.apply_to_lead(uuid, text) is
  'Charges the lead fee and records an application (0012, latest body 0165). '
  '0153 added the big-job insurance gate, 0161 the SEC-1 self-apply guard; '
  '0165 adds the internal-accounts guard, which refuses when the lead '
  'owner''s is_internal differs from the applying contractor''s, placed '
  'immediately after the SEC-1 guard and before any wallet read or write.';


-- =============================================================================
-- Part 12: unlock_direct_request() - 0153's body + the same guard
-- =============================================================================
-- 0153's body byte-for-byte (the latest in this folder: 0153
-- major_job_insurance_gate, Part 2), plus ONE declared variable (v_owner) and
-- ONE guard clause, placed immediately after 0153/0140's block check - the
-- point this function already resolves the homeowner behind the lead - and
-- still before get_or_create_wallet, so a refused unlock moves no money.
--
-- This path is already narrow (direct_to must equal the calling pro, and
-- requestProAction in src/app/(app)/contractors/actions.ts refuses to create a
-- cross-internal request in the first place), so the guard is defense in depth
-- against a row that predates the flag or a direct PostgREST call. Same vague
-- message and same HINT marker as apply_to_lead.
--
-- CREATE OR REPLACE: signature (uuid) -> boolean unchanged, so the existing
-- EXECUTE grant is preserved.
create or replace function public.unlock_direct_request(p_lead uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid; v_wallet uuid;
  v_direct_to uuid; v_lead_contractor uuid; v_status text; v_category text;
  v_declined timestamptz; v_unlocked timestamptz; v_price bigint;
  v_cash bigint; v_bonus bigint; v_grant_sum bigint; v_bonus_avail bigint;
  v_from_cash bigint; v_from_bonus bigint;
  v_remaining bigint; v_grant record; v_cash_first boolean;
  v_cash_after bigint; v_bonus_after bigint;
  -- 0153: this pro's insurance expiry (compliance calendar, 0051), for the
  -- big-job gate below.
  v_insurance_expires date;
  -- 0165: the homeowner behind this request, for the internal-accounts guard.
  v_owner uuid;
begin
  -- Privileged flag: the contractor_leads_locked trigger (0077, latest body
  -- 0088) strips any client write to contractor_id/paid/paid_at/status unless
  -- this session flag is set, exactly as apply_to_lead/choose_applicant do
  -- (0087). Without it, the final assignment UPDATE below would be silently
  -- reverted after the wallet was already debited. Must be the FIRST statement.
  perform set_config('hearth.lead_write', 'on', true);

  -- 0153: insurance_expires rides the contractors select this function
  -- already makes, so the gate costs no extra query.
  select id, insurance_expires into v_contractor, v_insurance_expires
    from contractors where user_id = auth.uid();
  if v_contractor is null then raise exception 'Not a contractor'; end if;

  -- 0132: an open payment dispute freezes spending. has_open_chargeback() is
  -- true only while this pro's account carries an uncleared abuse_flags row of
  -- kind 'chargeback' (written by the Stripe webhook on
  -- charge.dispute.created). Placed here, immediately after the contractor
  -- resolves and BEFORE the job is read, before any wallet lock, and before a
  -- single cent moves: a pro who has charged back a wallet top-up is spending
  -- money the platform has already lost, and the wallet balance still says it
  -- is there. Cleared by setting abuse_flags.cleared_at (service role only), so
  -- a dispute that is won or withdrawn unfreezes the account without erasing
  -- that it happened.
  if public.has_open_chargeback(v_contractor) then
    raise exception 'There is an unresolved payment dispute on your account. Contact support.';
  end if;

  -- Lock the lead and price the fee from its age, same as apply_to_lead.
  -- 0113: category is read too, so the intro price below can tell whether
  -- this is a major-tier request.
  select direct_to, contractor_id, status, category,
         direct_declined_at, direct_unlocked_at,
         public.lead_fee_cents(payout_amount, created_at)
    into v_direct_to, v_lead_contractor, v_status, v_category,
         v_declined, v_unlocked, v_price
    from contractor_leads where id = p_lead
    for update;
  if v_direct_to is null then raise exception 'Not a direct request'; end if;
  if v_direct_to <> v_contractor then raise exception 'Not your request'; end if;

  -- Already unlocked: by me -> idempotent success; otherwise impossible.
  if v_lead_contractor is not null then
    if v_lead_contractor = v_contractor then return true; end if;
    raise exception 'Request already assigned';
  end if;
  if v_declined is not null then raise exception 'Request was declined'; end if;
  if v_status <> 'new' then raise exception 'Request no longer available'; end if;

  -- 0153: big jobs need current insurance on file, same gate and same raise
  -- text as apply_to_lead's (see Part 1 for the full reasoning). Placed after
  -- the idempotent already-unlocked return above - a pro who already paid for
  -- this request keeps the honest `true` on a retry - and before the block
  -- check, the wallet, and every write, so a refused unlock moves no money.
  if v_category in ('roof', 'structural', 'remodeling')
     and (v_insurance_expires is null or v_insurance_expires < current_date) then
    raise exception 'Insurance required for big jobs';
  end if;

  -- 0140: a block between these two people. Same predicate as apply_to_lead's
  -- gate (0138), same wording, same reason: symmetric, and it must not tell
  -- the pro which side blocked whom. This is the third and last place a pro
  -- spends wallet money - the job board (open_jobs_for_me) and apply_to_lead
  -- were closed in 0138; this was the one left open. Placed after every
  -- existing "is this request even available" check and before
  -- get_or_create_wallet, so it costs nothing extra and still refuses before
  -- any wallet is touched.
  if exists (
    select 1
    from contractor_leads l
    join properties pr on pr.id = l.property_id
    where l.id = p_lead
      and public.blocked_between(auth.uid(), pr.user_id)
  ) then
    raise exception 'This job is not available to you.';
  end if;

  -- 0165 internal accounts: an internal (team test) pro and a real homeowner
  -- must never transact, in either direction - same rule and same wording as
  -- apply_to_lead's guard. my_direct_requests no longer lists the pairing and
  -- requestProAction refuses to create it, so this is the backstop for a row
  -- that predates the flag or a direct PostgREST call. Placed alongside the
  -- block check above, still before get_or_create_wallet, so a refused unlock
  -- moves no money.
  select pr.user_id into v_owner
    from contractor_leads l
    join properties pr on pr.id = l.property_id
   where l.id = p_lead;
  if public.is_internal_user(v_owner)
     is distinct from public.is_internal_contractor(v_contractor) then
    raise exception 'This job is not available to you.'
      using hint = 'internal_account';
  end if;

  v_wallet := get_or_create_wallet(v_contractor);
  -- 0065/0087 hardening: FOR UPDATE so a concurrent charge against this same
  -- wallet (a different lead, an apply, a ghost recharge) can't read a stale
  -- balance and push cash/bonus negative.
  select cash_balance_cents, bonus_balance_cents into v_cash, v_bonus
    from wallets where id = v_wallet
    for update;
  v_cash := coalesce(v_cash, 0);
  v_bonus := coalesce(v_bonus, 0);

  -- 0113: first big-ticket lead intro price, after the wallet lock for the
  -- same serialization reason as apply_to_lead (see 0113's header).
  v_price := public.major_lead_price_cents(v_contractor, v_category, v_price);

  -- Only bonus backed by live, unexpired grants is spendable. Capping at the
  -- grant sum makes the insufficient check honest and guarantees the FIFO drain
  -- below finds enough, so it can never zero out grants and then bail after the
  -- lead was already treated as unlockable (0087).
  select coalesce(sum(remaining_cents), 0) into v_grant_sum
    from bonus_grants
    where wallet_id = v_wallet and remaining_cents > 0 and expires_at > now();
  v_bonus_avail := least(v_bonus, v_grant_sum);

  if v_cash + v_bonus_avail < v_price then
    return false;  -- insufficient: prompt a deposit
  end if;

  select spend_cash_first into v_cash_first from wallet_config where id = 1;
  if v_cash_first then
    v_from_cash := least(v_cash, v_price);
    v_from_bonus := v_price - v_from_cash;
  else
    v_from_bonus := least(v_bonus_avail, v_price);
    v_from_cash := v_price - v_from_bonus;
  end if;

  if v_from_bonus > 0 then
    v_remaining := v_from_bonus;
    for v_grant in
      select * from bonus_grants
      where wallet_id = v_wallet and remaining_cents > 0 and expires_at > now()
      order by expires_at asc, created_at asc
    loop
      exit when v_remaining <= 0;
      if v_grant.remaining_cents >= v_remaining then
        update bonus_grants set remaining_cents = remaining_cents - v_remaining
         where id = v_grant.id;
        v_remaining := 0;
      else
        v_remaining := v_remaining - v_grant.remaining_cents;
        update bonus_grants set remaining_cents = 0 where id = v_grant.id;
      end if;
    end loop;
    if v_remaining > 0 then return false; end if;  -- safety
  end if;

  update wallets
     set cash_balance_cents  = cash_balance_cents  - v_from_cash,
         bonus_balance_cents = bonus_balance_cents - v_from_bonus,
         updated_at = now()
   where id = v_wallet
   returning cash_balance_cents, bonus_balance_cents into v_cash_after, v_bonus_after;

  -- History row for the paid unlock (also the row ghost_refund_direct marks).
  insert into lead_applications (lead_id, contractor_id, message, status, fee_cents)
    values (p_lead, v_contractor, null, 'chosen', v_price);

  insert into wallet_transactions
    (wallet_id, type, cash_delta_cents, bonus_delta_cents,
     cash_balance_after_cents, bonus_balance_after_cents, lead_id, note)
    values (v_wallet, 'direct_unlock', -v_from_cash, -v_from_bonus,
            v_cash_after, v_bonus_after, p_lead, 'Direct request unlocked');

  -- Assign + open chat: contractor_id set is what unlocks contact and messages.
  update contractor_leads
     set contractor_id = v_contractor, status = 'accepted',
         paid = true, paid_at = now(), direct_unlocked_at = now()
   where id = p_lead;

  return true;
end; $$;

comment on function public.unlock_direct_request(uuid) is
  'Pay-to-accept for a direct request (0105, latest body 0165). 0153 added '
  'the big-job insurance gate; 0165 adds the internal-accounts guard, which '
  'refuses when the requesting homeowner''s is_internal differs from the '
  'unlocking contractor''s, before get_or_create_wallet.';


-- =============================================================================
-- Part 13: choose_applicant() - 0107's body + the same guard
-- =============================================================================
-- 0107's body byte-for-byte (the latest in this folder: 0107
-- apply_credit_back), plus ONE guard clause and NOT ONE new query.
--
-- WHY NO NEW QUERY: the line immediately above the guard already refuses
-- unless owns_property(cl.property_id) is true for the caller, so by that
-- point the lead owner IS auth.uid(). The guard therefore compares
-- is_internal_user(auth.uid()) against is_internal_contractor(v_contractor) -
-- the applicant being picked, resolved in the first select of the function.
--
-- Placed BEFORE the FOR UPDATE lock on the lead and before every write, so a
-- refused pick assigns nothing, declines nobody, and credits nothing back.
--
-- This pairing is already unreachable through the product (a real pro cannot
-- apply to an internal job and vice versa, Part 11), so this guard only ever
-- fires on an application row that predates the flag. It is here so that the
-- three money functions state the same rule rather than two of them stating it
-- and the third inheriting it.
--
-- CREATE OR REPLACE: signature (uuid) -> void unchanged, so existing EXECUTE
-- grants are preserved, exactly as 0107 itself relied on.
create or replace function public.choose_applicant(p_application uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_lead uuid; v_contractor uuid; v_owns boolean;
  v_lead_contractor uuid; v_lead_status text;
  v_fee bigint; v_refunded timestamptz;
  v_wallet uuid; v_cash bigint; v_bonus bigint; v_bonus_avail bigint;
  v_grant_sum bigint; v_cash_first boolean;
  v_from_cash bigint; v_from_bonus bigint;
  v_remaining bigint; v_grant record;
  v_cash_after bigint; v_bonus_after bigint;
  -- NEW (credit-back): its own variables so nothing above is clobbered.
  v_expiry_days int;
  v_loser record;
  v_lwallet uuid;
  v_lcash_after bigint; v_lbonus_after bigint;
begin
  perform set_config('hearth.lead_write', 'on', true);

  select lead_id, contractor_id into v_lead, v_contractor
    from lead_applications where id = p_application;
  if v_lead is null then raise exception 'Application not found'; end if;

  select public.owns_property(cl.property_id) into v_owns
    from contractor_leads cl where cl.id = v_lead;
  if not coalesce(v_owns, false) then raise exception 'Not your job'; end if;

  -- 0165 internal accounts: the caller is the lead's owner (the line above
  -- refuses otherwise), so their own is_internal is the homeowner's. An
  -- internal (team test) homeowner must not be able to hire a real pro, and a
  -- real homeowner must not be able to hire a test pro. Placed before the FOR
  -- UPDATE lock and before every write, so a refused pick assigns nothing,
  -- declines nobody and credits nothing back. Same HINT marker as
  -- apply_to_lead; the message is plain and says nothing about why.
  if public.is_internal_user(auth.uid())
     is distinct from public.is_internal_contractor(v_contractor) then
    raise exception 'That pro is not available for this job.'
      using hint = 'internal_account';
  end if;

  -- Lock the lead so two picks serialize, and read its live assignment state.
  select contractor_id, status into v_lead_contractor, v_lead_status
    from contractor_leads where id = v_lead for update;

  -- Already assigned? A repeat pick of the same pro is an idempotent no-op;
  -- anything else means the job is taken and must not be silently reassigned.
  if v_lead_contractor is not null or coalesce(v_lead_status, 'new') <> 'new' then
    if v_lead_contractor = v_contractor then
      return;
    end if;
    raise exception 'This job has already been assigned';
  end if;

  update contractor_leads
     set contractor_id = v_contractor, status = 'accepted',
         paid = true, paid_at = now()
   where id = v_lead and contractor_id is null and status = 'new';

  -- RETURNING (not the earlier snapshot) decides the re-charge: if the ghost
  -- cron refunded this row a moment ago, the post-lock values show it and the
  -- fee gets charged again below instead of being missed.
  update lead_applications set status = 'chosen'
   where id = p_application
   returning fee_cents, refunded_at into v_fee, v_refunded;
  update lead_applications set status = 'declined'
   where lead_id = v_lead and id <> p_application and status = 'applied';

  -- Revival re-charge (ghost protection).
  if v_refunded is not null and coalesce(v_fee, 0) > 0 then
    v_wallet := get_or_create_wallet(v_contractor);
    -- 0065 fix: FOR UPDATE so this recharge can't race a concurrent apply_to_lead
    -- (or another recharge) against the same wallet and read a stale balance.
    select cash_balance_cents, bonus_balance_cents into v_cash, v_bonus
      from wallets where id = v_wallet
      for update;
    v_cash := coalesce(v_cash, 0);
    v_bonus := coalesce(v_bonus, 0);

    -- Only bonus backed by live grants is spendable; capping at the grant sum
    -- means the FIFO drain below can never come up short mid-charge.
    select coalesce(sum(remaining_cents), 0) into v_grant_sum
      from bonus_grants
      where wallet_id = v_wallet and remaining_cents > 0 and expires_at > now();
    v_bonus_avail := least(v_bonus, v_grant_sum);

    if v_cash + v_bonus_avail >= v_fee then
      select spend_cash_first into v_cash_first from wallet_config where id = 1;
      if v_cash_first then
        v_from_cash := least(v_cash, v_fee);
        v_from_bonus := v_fee - v_from_cash;
      else
        v_from_bonus := least(v_bonus_avail, v_fee);
        v_from_cash := v_fee - v_from_bonus;
      end if;

      if v_from_bonus > 0 then
        v_remaining := v_from_bonus;
        for v_grant in
          select * from bonus_grants
          where wallet_id = v_wallet and remaining_cents > 0 and expires_at > now()
          order by expires_at asc, created_at asc
        loop
          exit when v_remaining <= 0;
          if v_grant.remaining_cents >= v_remaining then
            update bonus_grants set remaining_cents = remaining_cents - v_remaining
             where id = v_grant.id;
            v_remaining := 0;
          else
            v_remaining := v_remaining - v_grant.remaining_cents;
            update bonus_grants set remaining_cents = 0 where id = v_grant.id;
          end if;
        end loop;
      end if;

      update wallets
         set cash_balance_cents  = cash_balance_cents  - v_from_cash,
             bonus_balance_cents = bonus_balance_cents - v_from_bonus,
             updated_at = now()
       where id = v_wallet
       returning cash_balance_cents, bonus_balance_cents into v_cash_after, v_bonus_after;

      insert into wallet_transactions
        (wallet_id, type, cash_delta_cents, bonus_delta_cents,
         cash_balance_after_cents, bonus_balance_after_cents, lead_id, note)
        values (v_wallet, 'ghost_recharge', -v_from_cash, -v_from_bonus,
                v_cash_after, v_bonus_after, v_lead,
                'Fee re-charged: homeowner picked you after a ghost refund');

      -- The refund is paid back, so the application is a normal paid one again.
      update lead_applications set refunded_at = null where id = p_application;
    else
      insert into wallet_transactions
        (wallet_id, type, cash_delta_cents, bonus_delta_cents,
         cash_balance_after_cents, bonus_balance_after_cents, lead_id, note)
        values (v_wallet, 'ghost_recharge_waived', 0, 0,
                v_cash, v_bonus, v_lead,
                'Ghost re-charge waived: wallet could not cover the fee');
    end if;
  end if;

  -- ---- NEW: credit back the non-chosen applicants -----------------------------
  -- Every declined applicant on this lead who still has a live, never-refunded,
  -- non-zero fee gets 100% of it back as expiring bonus credit. The chosen row
  -- (status 'chosen') is not in this set; an already ghost-refunded loser
  -- (refunded_at not null) is skipped, and so is a loser who already received
  -- 0041's first-application guarantee for this lead (a 'first_apply_guarantee'
  -- ledger row, which does NOT set refunded_at) - see the NOT EXISTS below and
  -- the header's double-refund reasoning - so nobody is refunded twice. Stamping
  -- refunded_at = now() on each credited row both records the credit and closes
  -- it off from ghost_refund_application (needs status='applied' AND refunded_at
  -- null) and 0041's first-application guarantee (bails on refunded_at not null)
  -- - see the header for the full double-refund reasoning.
  select coalesce(bonus_expiry_days, 60) into v_expiry_days
    from wallet_config where id = 1;
  v_expiry_days := coalesce(v_expiry_days, 60);

  for v_loser in
    select id, contractor_id, fee_cents
      from lead_applications
     where lead_id = v_lead
       and id <> p_application
       and status = 'declined'
       and refunded_at is null
       and coalesce(fee_cents, 0) > 0
       -- Skip a loser whose fee was ALREADY returned by 0041's first-application
       -- guarantee for THIS lead. That path pays the fee back as a
       -- 'first_apply_guarantee' wallet_transactions row and deliberately does
       -- NOT stamp lead_applications.refunded_at (see 0041's header), so the
       -- refunded_at IS NULL filter above cannot see it on its own. Without this
       -- exclusion a losing first application that already got the guarantee
       -- would be credited a SECOND time here. wallet_transactions.lead_id is
       -- the lead the guarantee was paid for; the wallet joins back to the
       -- contractor via wallets.contractor_id.
       and not exists (
         select 1
           from wallet_transactions wt
           join wallets w on w.id = wt.wallet_id
          where w.contractor_id = lead_applications.contractor_id
            and wt.type = 'first_apply_guarantee'
            and wt.lead_id = v_lead
       )
  loop
    v_lwallet := get_or_create_wallet(v_loser.contractor_id);

    insert into bonus_grants (wallet_id, amount_cents, remaining_cents, expires_at)
      values (v_lwallet, v_loser.fee_cents, v_loser.fee_cents,
              now() + (v_expiry_days || ' days')::interval);

    update wallets
       set bonus_balance_cents = bonus_balance_cents + v_loser.fee_cents,
           updated_at = now()
     where id = v_lwallet
     returning cash_balance_cents, bonus_balance_cents
       into v_lcash_after, v_lbonus_after;

    insert into wallet_transactions
      (wallet_id, type, cash_delta_cents, bonus_delta_cents,
       cash_balance_after_cents, bonus_balance_after_cents, lead_id, note)
      values (v_lwallet, 'apply_credit_back', 0, v_loser.fee_cents,
              v_lcash_after, v_lbonus_after, v_lead,
              'Not chosen: apply fee returned as credit');

    update lead_applications set refunded_at = now() where id = v_loser.id;
  end loop;
end; $$;

comment on function public.choose_applicant(uuid) is
  'Homeowner picks an applicant (0012, latest body 0165). 0107 added the '
  'credit-back loop for the losers; 0165 adds the internal-accounts guard, '
  'which refuses when the owner''s is_internal differs from the chosen '
  'contractor''s, before the lead is locked and before any write.';


-- =============================================================================
-- ADMIN: marking an account internal, and unmarking it
-- =============================================================================
-- Also written up in docs/INTERNAL-ACCOUNTS.md. SERVICE ROLE ONLY - run it in
-- the Supabase SQL editor, which connects as a platform role and is therefore
-- waved through enforce_users_column_lock().
--
-- MARK an account (and any pro row it owns) internal:
--
--   update public.users set is_internal = true where email = 'someone@oaktend.test';
--   update public.contractors c set is_internal = true
--     from public.users u where u.id = c.user_id and u.is_internal;
--
-- The second statement is belt-and-braces: users_internal_propagates (Part 4)
-- already carries the flip through to existing contractors rows, and
-- contractors_internal_follows_user stamps any row created later. Run it
-- anyway - it is a no-op when the triggers did their job, and it is the repair
-- if this file was applied to a database whose rows predate it.
--
-- UNMARK (turn a test account back into a real one):
--
--   update public.users set is_internal = false where email = 'someone@oaktend.test';
--   update public.contractors c set is_internal = false
--     from public.users u where u.id = c.user_id and not u.is_internal;
--
-- AUDIT what is currently internal:
--
--   select u.id, u.email, u.is_internal, c.id as contractor_id, c.is_internal
--     from public.users u
--     left join public.contractors c on c.user_id = u.id
--    where u.is_internal or c.is_internal;
--
-- NOTE: contractors.is_internal FOLLOWS THE OWNING USER. Do not set it on its
-- own and expect it to stick - the next time that user's is_internal changes,
-- users_internal_propagates overwrites it.


-- =============================================================================
-- VERIFY (run after applying; each should come back as described)
-- =============================================================================

-- 1. Both columns exist, default false, not null.
--   select table_name, column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and column_name = 'is_internal';
--   -> two rows (users, contractors), boolean, NO, false

-- 2. Neither column is readable or writable by authenticated / anon.
--   select grantee, privilege_type, column_name
--     from information_schema.column_privileges
--    where table_schema = 'public'
--      and table_name in ('users', 'contractors')
--      and column_name = 'is_internal'
--      and grantee in ('authenticated', 'anon');
--   -> zero rows for contractors. (public.users has no column-level grants at
--      all - it is guarded by the trigger instead; check 3 covers it.)

-- 3. The column lock carries is_internal.
--   select prosrc like '%''is_internal''%' from pg_proc
--    where proname = 'enforce_users_column_lock'
--      and pronamespace = 'public'::regnamespace;
--   -> t

-- 4. Every re-created read path carries the predicate.
--   select proname, prosrc like '%is_internal_user(auth.uid())%'
--     from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('open_jobs_for_me', 'my_direct_requests', 'browse_pros',
--                      'public_pro_profile', 'contractor_reviews');
--   -> t for all five

-- 5. Every money function carries the guard.
--   select proname, prosrc like '%internal_account%' from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('apply_to_lead', 'unlock_direct_request',
--                      'choose_applicant');
--   -> t for all three

-- 6. The contractors read policy carries it.
--   select polname, pg_get_expr(polqual, polrelid) like '%is_internal%'
--     from pg_policy
--    where polrelid = 'public.contractors'::regclass and polname = 'contractors read';
--   -> t

-- 7. Dry run, on a copy. Mark one homeowner + one pro internal with the admin
--    one-liner above, then:
--    a. as a REAL pro: select * from public.open_jobs_for_me();
--       -> the internal homeowner's open job is absent; real jobs unchanged.
--    b. as the INTERNAL pro: the same call lists the internal job and NO real
--       job.
--    c. as a REAL homeowner: select * from public.browse_pros(null);
--       -> the internal pro is absent.
--       select public.public_pro_profile('<internal contractor id>');  -> null
--       select * from public.contractor_reviews('<internal contractor id>');
--       -> zero rows
--    d. anonymously (anon key): public_pro_profile on the internal pro -> null,
--       so /p/<id>, its OG card and /api/pro-widget/<id> all 404.
--    e. as the INTERNAL pro: select public.apply_to_lead('<a REAL lead id>', null);
--       -> raises 'This job is not available to you.' and writes nothing to
--          wallets, lead_applications or wallet_transactions.
--    f. as a REAL pro: the same call against the INTERNAL homeowner's lead ->
--       the same raise, again with no money moved.
--    g. as the INTERNAL pro against the INTERNAL homeowner's lead -> applies
--       normally. Real pro + real lead -> applies normally.
--    h. as the internal pro: /pro still loads, their own contractors row still
--       reads, their own /p/<id> still renders. Nothing is hidden from an
--       account about itself.


-- #############################################################################
-- ##  BEGIN 0166-campaign-attribution
-- #############################################################################

-- =============================================================================
-- PASTE-ME-0166-campaign-attribution-2026-09-12.sql   (built 2026-09-12)
-- Migration 0166 only: permanent campaign/partner attribution on public.users,
-- plus the two service-role-only reporting views behind it.
--
-- Live is expected to be through 0162 (PASTE-ME-ALL-PENDING-2026-09-08.sql).
-- 0164 (Stripe Connect) and 0165 (internal accounts) are separate files being
-- prepared alongside this one - see THE ONE ORDERING RULE below, which is the
-- only thing about this file that is order-sensitive.
--
-- Paste the WHOLE file into the Supabase SQL editor and run it once. It is one
-- transaction: if any section raises, nothing is applied - read the message,
-- fix the cause, re-run the whole file. Every statement is idempotent, so
-- running it twice is a no-op, not an error.
--
-- WHAT IT DOES:
--   1. adds public.users.campaign_code + campaign_recorded_at, a CHECK on the
--      code shape, and one partial index;
--   2. re-creates the public.users column-lock trigger function so an account
--      cannot rewrite its own attribution;
--   3. creates public.campaign_signups_by_month and
--      public.campaign_upgrades_by_month, revoked from anon/authenticated and
--      granted to service_role only.
-- It grants NOTHING new to authenticated/anon. See the long header in
-- supabase/migrations/0166_users_campaign_attribution.sql, which this file is
-- a copy of with the guards below added on top.
--
-- THE ONE ORDERING RULE. Section 2 uses CREATE OR REPLACE FUNCTION on
-- public.enforce_users_column_lock(), which replaces the body WHOLESALE. Any
-- OTHER migration that also re-creates that function (0165/internal accounts
-- is expected to, for `is_internal`) must be pasted BEFORE this file, or it
-- will un-lock whatever this file locked. PRECHECK 3 below enforces this
-- automatically: it reads the function currently installed on the database and
-- REFUSES the whole paste if it locks a public.users column that this file's
-- list would drop. You cannot get the order wrong silently.
--
-- UNTIL THIS IS PASTED: the app degrades on purpose rather than crashing. The
-- attribution write in src/app/(auth)/recordTermsAcceptance.ts goes through
-- isMissingSchemaError (src/lib/dbErrors.ts) - a missing column logs one
-- warning and continues. The campaign_signup analytics event still lands and
-- sign-up is completely unaffected, so there is no deploy-order requirement
-- between the app and this file. What you lose until it is pasted is only the
-- permanent per-account record, which app_events cannot replace long-term.
--
-- NOTE: this file does not backfill. Accounts created through /go/<code>
-- BEFORE it is pasted keep campaign_code null; their campaign_signup rows in
-- app_events are the only record of them.
-- =============================================================================

-- ---- ORDER GUARD 1: do not paste this out of order ------------------------
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

-- ---- ORDER GUARD 2: the two tables this file reads --------------------------
-- public.users is what gets the columns; public.subscriptions is what the
-- upgrades view joins, and it must already carry 0039's `side` column or that
-- view would not compile.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'users'
  ) then
    raise exception 'PRECHECK: public.users is missing. Apply migration 0001 before this file. NOTHING WAS CHANGED.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name  = 'subscriptions'
      and column_name = 'side'
  ) then
    raise exception 'PRECHECK: public.subscriptions.side (migration 0039) is missing, so public.campaign_upgrades_by_month cannot be built. Apply 0025 and 0039 before this file. NOTHING WAS CHANGED.';
  end if;
end
$$;

-- ---- PRECHECK 3: THE IMPORTANT ONE - do not un-lock a locked column --------
-- Section 2 below replaces public.enforce_users_column_lock() wholesale. If a
-- migration pasted earlier added a public.users column to that function's
-- locked list and this file's list does not contain it, running this file
-- would silently hand that column back to every signed-in account's own
-- PostgREST session.
--
-- Rather than trusting a human to check, read the function that is actually
-- installed right now, find every public.users column name quoted inside it,
-- and refuse if any of them is missing from the list this file is about to
-- install. A database with no such function yet (0139 not applied) has nothing
-- to lose and passes.
do $$
declare
  v_src     text;
  v_missing text;
  -- Must stay byte-identical to v_locked in section 2 below.
  v_new constant text[] := array[
    'id', 'email', 'created_at',
    'free_doc_reads_used', 'free_inspection_reads_used',
    'free_quote_used_at', 'free_plan_used_at',
    'sms_consent', 'sms_consent_at',
    'referral_code', 'referred_by',
    'is_internal',
    'campaign_code', 'campaign_recorded_at'
  ];
begin
  select p.prosrc
    into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'enforce_users_column_lock';

  if v_src is null then
    raise notice 'PRECHECK 3: enforce_users_column_lock() is not installed yet (migration 0139 not applied). Nothing to preserve; continuing.';
    return;
  end if;

  select string_agg(c.column_name, ', ' order by c.column_name)
    into v_missing
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name   = 'users'
     and v_src like '%' || quote_literal(c.column_name) || '%'
     and not (c.column_name = any (v_new));

  if v_missing is not null then
    raise exception
      'PRECHECK: the column-lock function currently on this database locks public.users column(s) (%) that this file''s list does not include, so running it would UN-LOCK them and let any signed-in account rewrite them through PostgREST. A newer migration re-created enforce_users_column_lock() after 0166 was written. Add those column names to v_locked in supabase/migrations/0166_users_campaign_attribution.sql AND to this file, then re-run. NOTHING WAS CHANGED.',
      v_missing;
  end if;
end
$$;

-- ############################ 0166 starts here ###############################

-- =============================================================================
-- Part 1: the two columns
-- =============================================================================
-- NAME NOTE: campaign_code, NOT referral_code. public.users already has
-- referral_code (0102, the account's own UNIQUE invite slug) and referred_by
-- (0102, the user who invited this one). A partner/marketing campaign names a
-- SOURCE, not a person, so it gets its own unambiguous name and touches
-- neither of those columns.
alter table public.users
  add column if not exists campaign_code text;

alter table public.users
  add column if not exists campaign_recorded_at timestamptz;

-- ADD CONSTRAINT has no IF NOT EXISTS in PostgreSQL, so it is guarded by hand
-- rather than left to fail the whole paste on a re-run. The shape mirrors
-- CAMPAIGN_CODE_RE in src/lib/campaigns.ts. It is a backstop, not the real
-- gate: the app only ever writes a code that passed lookupCampaign(), i.e. one
-- present in the frozen allowlist.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.users'::regclass
       and conname  = 'users_campaign_code_shape'
  ) then
    alter table public.users
      add constraint users_campaign_code_shape
      check (campaign_code is null or campaign_code ~ '^[a-z0-9-]{2,32}$');
  end if;
end
$$;

-- PARTIAL: the column is null for every account that did not arrive through a
-- /go/ link, which is the overwhelming majority of them.
create index if not exists users_campaign_code_idx
  on public.users (campaign_code)
  where campaign_code is not null;

comment on column public.users.campaign_code is
  'Permanent marketing/partner attribution: the /go/<code> campaign code this '
  'account arrived through, stamped once at sign-up by '
  'src/app/(auth)/recordTermsAcceptance.ts and never overwritten (that write '
  'is filtered on campaign_code is null). Values come from the frozen '
  'allowlist in src/lib/campaigns.ts. NOT users.referral_code (0102, this '
  'account''s own invite slug) and NOT users.referred_by (0102, the user who '
  'invited this one). Service role only: see enforce_users_column_lock().';

comment on column public.users.campaign_recorded_at is
  'When campaign_code was stamped, i.e. the moment of sign-up. Set in the same '
  'UPDATE as campaign_code and, like it, never rewritten. This is the month '
  'public.campaign_signups_by_month groups on. Service role only.';


-- =============================================================================
-- Part 2: lock both columns against the account's own session
-- =============================================================================
-- Re-creates public.enforce_users_column_lock() (migration 0139) from its
-- latest body with the new columns appended to v_locked. Everything else is
-- 0139's - the role check, the jsonb diff, the error shape.
--
-- WHY LOCK THEM. "users self update" (0002) is a ROW rule with no column list
-- and Supabase's default table-level grants stand on public.users, so without
-- this trigger a signed-in account could PATCH its own row through PostgREST
-- with nothing but the anon key and its own session token, and set
-- campaign_code to whatever it liked - assigning itself to a partner's
-- commission, or erasing an attribution a partner is owed money for. Both
-- directions are money.
--
-- 'is_internal' is listed defensively for 0165 (internal accounts), which did
-- not exist yet when this was written. The comparison runs through
-- to_jsonb(NEW)/to_jsonb(OLD), so a column that does not exist on this
-- database reads NULL on both sides, is never "changed", and never raises -
-- listing it early is a harmless no-op that becomes a real lock the moment the
-- column appears. See PRECHECK 3 above for the guard on the opposite mistake.
create or replace function public.enforce_users_column_lock()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Keep this in step with the table. A new counter, credit, plan flag,
  -- consent field, attribution or identity column on public.users belongs
  -- here the day it is added; anything not listed stays writable by the row's
  -- owner, which is the behaviour that existed before migration 0139.
  v_locked constant text[] := array[
    'id',
    'email',
    'created_at',
    'free_doc_reads_used',
    'free_inspection_reads_used',
    'free_quote_used_at',
    'free_plan_used_at',
    'sms_consent',
    'sms_consent_at',
    'referral_code',
    'referred_by',
    -- 0165 (internal accounts). Listed defensively; a no-op until the column
    -- exists.
    'is_internal',
    -- 0166 (this file). Partner/campaign attribution.
    'campaign_code',
    'campaign_recorded_at'
  ];
  v_role    text;
  v_changed text[];
begin
  begin
    v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb
                ->> 'role';
  exception when others then
    v_role := null;
  end;

  if v_role = 'service_role'
     or current_user in ('service_role', 'postgres', 'supabase_admin',
                         'supabase_auth_admin')
  then
    return new;
  end if;

  -- Compared through jsonb rather than named IF branches so the list above is
  -- the single source of truth, and so a column that does not exist on this
  -- database yet reads NULL on both sides instead of failing to compile.
  -- `is distinct from` means a write that re-sends a locked column UNCHANGED
  -- is fine: only an actual change is refused.
  select array_agg(t.col order by t.col)
    into v_changed
    from unnest(v_locked) as t(col)
   where to_jsonb(new) -> t.col is distinct from to_jsonb(old) -> t.col;

  if v_changed is not null then
    raise exception
      'These fields are managed by OakTend and cannot be changed from an account session: %',
      array_to_string(v_changed, ', ')
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists users_column_lock on public.users;
create trigger users_column_lock
  before update on public.users
  for each row execute function public.enforce_users_column_lock();

comment on function public.enforce_users_column_lock() is
  'BEFORE UPDATE guard on public.users. Raises 42501 when a locked column '
  '(paywall counters, consent record, user-to-user referral attribution, '
  'campaign/partner attribution, internal-account flag, id, email, '
  'created_at) actually changes and the caller is not the service role or a '
  'platform role. "users self update" (0002) is row-scoped with no column '
  'list, so without this a homeowner could reset their own free-AI-taste '
  'credits, or re-assign their own account to a partner''s commission, with '
  'one PATCH. Body last re-created by migration 0166.';


-- =============================================================================
-- Part 3: the two reporting views (SERVICE ROLE ONLY)
-- =============================================================================
-- These are the whole read side of the partner deal - docs/REFERRALS.md has
-- the two one-liners that get pasted into the SQL editor.
--
-- NOT security_invoker. Left at the default (the view runs with its OWNER's
-- privileges), which is what lets it read across public.users despite the
-- "users self select" RLS policy. That is safe ONLY because of the REVOKEs
-- below: no role that could be a browser session may select from either view.
--
-- THE REVOKES ARE THE ACTUAL ACCESS CONTROL, not decoration. Supabase's
-- default privileges in the public schema grant SELECT on new objects to anon
-- and authenticated automatically, so a view created here would be
-- world-readable through PostgREST unless the grant is taken back.

-- ---- Sign-ups per code per month -------------------------------------------
-- One row per (code, month), counting ACCOUNTS. Month comes from
-- campaign_recorded_at, stamped in the same UPDATE as the code, so it is the
-- sign-up month by construction; coalesced to created_at only to stay sane if
-- a row is ever backfilled by hand with a code but no timestamp.
create or replace view public.campaign_signups_by_month
with (security_invoker = false) as
  select
    u.campaign_code                                                  as campaign_code,
    date_trunc('month', coalesce(u.campaign_recorded_at, u.created_at))::date as month,
    count(*)::bigint                                                 as signups
  from public.users u
  where u.campaign_code is not null
  group by 1, 2;

revoke all on public.campaign_signups_by_month from anon, authenticated;
grant select on public.campaign_signups_by_month to service_role;

comment on view public.campaign_signups_by_month is
  'Partner/campaign reporting (0166). Accounts created per campaign code per '
  'month, from public.users.campaign_code. SERVICE ROLE ONLY - anon and '
  'authenticated are revoked explicitly, because Supabase''s default '
  'privileges would otherwise grant SELECT on it in the public schema. See '
  'docs/REFERRALS.md.';

-- ---- Upgrades per code per month -------------------------------------------
-- "Upgrade" = the attributed account holds a HOMEOWNER-side subscription row
-- that reached status 'active'. public.subscriptions (0025, re-keyed to one
-- row per (user_id, side) by 0039) is the table the Stripe webhook
-- (src/app/api/stripe/webhook/route.ts) writes; side = 'pro' is the
-- contractor plan and is deliberately excluded - a partner referral deal is
-- about homeowners.
--
-- 'active' ONLY, not 'trialing'. src/lib/subscription.ts draws exactly this
-- line: 'trialing' means live but nothing has been charged yet. A commission
-- is paid out of money that actually moved.
--
-- THE MONTH IS AN APPROXIMATION, AND THIS IS THE CAVEAT TO READ. public.
-- subscriptions has created_at (row first written, i.e. checkout) and
-- updated_at (last webhook write, which moves on every renewal, plan change
-- and cancellation). Neither is "the moment this subscription first became
-- paid" - the table has no such column. created_at is used because it is
-- STABLE (updated_at would silently re-bucket an account into a later month
-- on its next renewal, so last month's number would change every time you ran
-- it) and because for the ordinary path - checkout, immediate charge - it is
-- right. It is early by the length of the trial for an account that started
-- on a trial and converted later. If exact became-paid-at months are ever
-- needed, that is a new column on public.subscriptions written by the
-- webhook, not a change to this view.
create or replace view public.campaign_upgrades_by_month
with (security_invoker = false) as
  select
    u.campaign_code                                as campaign_code,
    date_trunc('month', s.created_at)::date        as month,
    count(distinct s.user_id)::bigint              as upgrades
  from public.users u
  join public.subscriptions s
    on s.user_id = u.id
  where u.campaign_code is not null
    and s.side   = 'homeowner'
    and s.status = 'active'
  group by 1, 2;

revoke all on public.campaign_upgrades_by_month from anon, authenticated;
grant select on public.campaign_upgrades_by_month to service_role;

comment on view public.campaign_upgrades_by_month is
  'Partner/campaign reporting (0166). Attributed accounts that reached a PAID '
  'homeowner-side subscription (public.subscriptions.status = ''active'', '
  'side = ''homeowner''), bucketed by subscriptions.created_at - the table '
  'has no became-paid-at timestamp, so the month is the CHECKOUT month and is '
  'early by the trial length for an account that converted from a trial. '
  'SERVICE ROLE ONLY. See docs/REFERRALS.md.';


-- ---- VERIFY (run these AFTER the paste succeeds) ----------------------------
-- -- 1. The columns exist (expect two rows):
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'users'
--   and column_name in ('campaign_code', 'campaign_recorded_at');
--
-- -- 2. The index and the CHECK exist (expect one row each):
-- select indexname from pg_indexes
-- where schemaname = 'public' and indexname = 'users_campaign_code_idx';
-- select conname from pg_constraint
-- where conrelid = 'public.users'::regclass
--   and conname = 'users_campaign_code_shape';
--
-- -- 3. The trigger is still there (expect one row: users_column_lock | O):
-- select tgname, tgenabled from pg_trigger
-- where tgrelid = 'public.users'::regclass and not tgisinternal;
--
-- -- 4. The lock really covers the new column. Expect NOTICE "PASS". This
-- --    borrows the authenticated role and rolls its own write back, so it
-- --    changes nothing. Paste it on its own.
-- do $v$
-- declare
--   v_user   uuid;
--   v_result text := 'wrote it';
-- begin
--   select id into v_user from public.users limit 1;
--   if v_user is null then
--     raise notice 'SKIP: no rows in public.users';
--     return;
--   end if;
--   begin
--     perform set_config('request.jwt.claims',
--       json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
--     execute 'set local role authenticated';
--     update public.users set campaign_code = 'curtis' where id = v_user;
--     if not found then v_result := 'rls filtered the row'; end if;
--     raise exception using errcode = 'OAKT1', message = v_result;
--   exception
--     when sqlstate '42501' then v_result := 'refused';
--     when sqlstate 'OAKT1' then null;
--   end;
--   execute 'reset role';
--   perform set_config('request.jwt.claims', '', true);
--   if v_result = 'refused' then
--     raise notice 'PASS: authenticated cannot set users.campaign_code';
--   elsif v_result = 'rls filtered the row' then
--     raise notice 'INCONCLUSIVE: auth.uid() did not resolve, so the UPDATE matched no row and the trigger never ran.';
--   else
--     raise exception 'FAIL: an authenticated session set users.campaign_code';
--   end if;
-- end
-- $v$;
--
-- -- 5. THE IMPORTANT ONE - neither view is readable by a browser role
-- --    (expect ZERO rows):
-- select table_name, grantee, privilege_type
-- from information_schema.table_privileges
-- where table_schema = 'public'
--   and table_name in ('campaign_signups_by_month', 'campaign_upgrades_by_month')
--   and grantee in ('anon', 'authenticated');
--
-- -- 6. The views answer. Zero rows until someone signs up through a /go/
-- --    link, which is correct, not a failure:
-- select * from public.campaign_signups_by_month where campaign_code = 'curtis' order by month;
-- select * from public.campaign_upgrades_by_month where campaign_code = 'curtis' order by month;


-- #############################################################################
-- ##  BEGIN 0167-rentcast-cache
-- #############################################################################

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


-- #############################################################################
-- ##  BEGIN 0168-pro-waitlist
-- #############################################################################

-- =============================================================================
-- PASTE-ME-0168-pro-waitlist-2026-09-12.sql   (built 2026-09-12)
-- Everything not yet on live from HOMEOWNER PREVIEW MODE: migration 0168 only.
-- Live is expected to be through 0162 (PASTE-ME-ALL-PENDING-2026-09-08.sql).
--
-- Paste the WHOLE file into the Supabase SQL editor and run it once. Every
-- statement is idempotent, so running it twice is a no-op, not an error. If a
-- section raises, read the message, fix the cause, and re-run the whole file.
--
-- INDEPENDENT OF THE OTHER PENDING PASTES. 0164 (Stripe Connect), 0165
-- (internal accounts), 0166 (campaign attribution) and 0167 (RentCast cache)
-- are separate files from separate changes; this one neither reads nor writes
-- anything they add, so it can be pasted before or after any of them. The one
-- soft dependency is a FEATURE one, not a SQL one: until 0165 is applied,
-- users.is_internal does not exist, isInternalUser() answers false for
-- everybody, and preview mode blocks the OakTend team from the contractor side
-- along with everyone else. Paste 0165 first if the team needs to test pro.
--
-- WHAT IT DOES, and why both halves are no-ops until the app is switched on:
--   PART 1  adds public.pro_waitlist - the emails collected by the "Pros are
--           coming soon" page. Nothing writes to it until the app runs with
--           NEXT_PUBLIC_PREVIEW_MODE=homeowner. Service-role only: RLS on,
--           zero policies, anon/authenticated revoked. It holds contractors'
--           email addresses, so that is not optional.
--   PART 2  adds ONE clause to public.enforce_properties_home_cap() (0108):
--           a service-role insert returns early instead of being counted.
--           Preview mode gives every homeowner the Plus 5-home allowance, but
--           that trigger reads the subscriptions table and a preview homeowner
--           has no row there, so their second home would be refused. Nothing
--           a browser can do changes: `authenticated` and `anon` inserts hit
--           the identical 1/5 count they always have, and outside preview the
--           app never uses the admin client for this insert at all.
--
-- THE SWITCH ITSELF IS NOT IN THIS FILE. It is a Vercel environment variable:
--   NEXT_PUBLIC_PREVIEW_MODE=homeowner   -> preview on
--   (unset, or anything else)            -> normal behaviour
-- NEXT_PUBLIC_ vars are inlined at BUILD time, so changing it means changing
-- the variable in Vercel and REDEPLOYING - the same commit is fine, no code
-- change. See docs/GO-LIVE-WIRING.md, "Preview mode".
--
-- TO READ THE WAITLIST once contractors start signing up:
--   select email, trade, city, source, created_at
--     from public.pro_waitlist order by created_at desc;
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

-- ---- PRECHECK: the function Part 2 replaces must already exist -------------
-- CREATE OR REPLACE FUNCTION would happily CREATE it if it were absent, and
-- the trigger that calls it (0108's properties_home_cap) would not exist - so
-- the home cap would silently stop being enforced at the database at all.
-- Refuse instead.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'properties'
  ) then
    raise exception 'PRECHECK: public.properties is missing. Apply migration 0001 before this file. Nothing was changed.';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'enforce_properties_home_cap'
  ) then
    raise exception 'PRECHECK: public.enforce_properties_home_cap() is missing. Apply migration 0108 before this file - Part 2 below REPLACES that function and would otherwise install it without the trigger that calls it. Nothing was changed.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.properties'::regclass
      and tgname = 'properties_home_cap'
  ) then
    raise exception 'PRECHECK: trigger properties_home_cap on public.properties is missing (migration 0108). Replacing the function without it would leave the home cap unenforced at the database. Apply 0108 first. Nothing was changed.';
  end if;
end
$$;


-- =============================================================================
-- Part 1: public.pro_waitlist
-- =============================================================================
-- One row per contractor who asked to be told when the pro side opens.
--
-- email is stored AS TYPED (not lower-cased) so the team can write back to
-- somebody the way they wrote their own address; the uniqueness below is
-- case-insensitive, which is the part that matters.
--
-- trade is one of src/lib/constants.ts JOB_CATEGORIES values, or null when the
-- optional select was left alone - deliberately NOT a foreign key or a check
-- constraint: that list lives in TypeScript, it changes with the product, and
-- a stale constraint here would start rejecting signups in a trade we just
-- added. The action drops any value outside the list before it gets here.
--
-- source records which closed door they came through ('pros',
-- 'contractor-signup', 'pro-onboarding', 'pro-shell'). Triage only.
create table if not exists public.pro_waitlist (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null,
  trade      text,
  city       text,
  source     text,
  created_at timestamptz not null default now()
);

-- ONE ROW PER EMAIL, case-insensitively. This is also the whole
-- deduplication mechanism for the action: it does a plain insert and swallows
-- the 23505 this index raises, which is what lets it show the identical
-- "You're on the list." for a new signup and a repeat one. Without this index
-- a repeat signup would insert a second row and the table would slowly become
-- a duplicate-heavy mailing list.
--
-- Deliberately an EXPRESSION index rather than a `unique (email)` constraint,
-- because "Sam@Example.com" and "sam@example.com" are one contractor. Note
-- that this means PostgREST cannot use it as an ON CONFLICT target (it takes
-- a column list, not an expression) - the app catches the error instead, and
-- src/app/pros/actions.ts says so at the insert.
create unique index if not exists pro_waitlist_email_uidx
  on public.pro_waitlist (lower(email));

alter table public.pro_waitlist enable row level security;

-- NO POLICIES, deliberately. RLS on with zero policies denies every
-- user-facing role outright. The insert comes from the admin (service-role)
-- client, which bypasses RLS; nothing else may touch this table.
--
-- THIS IS THE SECURITY PROPERTY OF THE WHOLE FEATURE: the form behind it is
-- public and unauthenticated, so if `anon` could select from this table the
-- page would be handing out a list of contractors' email addresses to anyone
-- who asked PostgREST for it. The revoke is the belt to that brace, in case a
-- future ALTER DEFAULT PRIVILEGES hands out table grants.
revoke all on public.pro_waitlist from anon, authenticated;

comment on table public.pro_waitlist is
  'Homeowner-preview pro waitlist: emails captured by src/components/pro/ProsComingSoon.tsx while the contractor side is closed (NEXT_PUBLIC_PREVIEW_MODE=homeowner). Service-role only - RLS is on with no policies and anon/authenticated are revoked, because this is a list of contractors'' email addresses. Written by joinProWaitlistAction (src/app/pros/actions.ts), which dedupes on the lower(email) unique index by swallowing 23505 so the form can never reveal whether an address was already on the list. Read it with: select email, trade, city, source, created_at from public.pro_waitlist order by created_at desc;';


-- =============================================================================
-- Part 2: let a SERVICE-ROLE insert past the home cap
-- =============================================================================
-- THE ONLY CHANGE from migration 0108 is the six-line v_role block and the
-- `if v_role = 'service_role' ... return new` that follows it. Everything
-- below that point - the advisory lock, the Plus predicate, the 1/5 caps, the
-- count, both exception messages - is migration 0108's body byte for byte.
-- Diff it against supabase/migrations/0108_home_cap.sql before pasting.
--
-- WHY THIS IS SAFE. service_role is the platform's all-powerful role: it
-- already bypasses RLS on every table in the database, and anyone holding that
-- key can drop this trigger outright. A trigger clause that trusts it is not
-- giving away anything it did not already have. What it DOES do is make the
-- trust explicit and auditable in one place, instead of preview mode trying to
-- fake a subscriptions row.
--
-- WHY IT IS RECOGNISED THIS WAY. Two independent signals, either one enough,
-- copied from the same block in 0139 (enforce_users_column_lock), 0165 and
-- 0166 - this repo's established way of saying "the server did this":
--   * the JWT claim. PostgREST puts the verified claims in the
--     `request.jwt.claims` GUC, so `->> 'role'` is what Supabase's own
--     auth.role() reads. Taken through nullif and a sub-block so a missing GUC
--     (a direct psql session) or a malformed one can never throw here.
--   * current_user. PostgREST connects as `authenticator` and SETs the role
--     named by the token, so an admin-client request really is running as
--     `service_role`. postgres / supabase_admin are the platform's own roles:
--     the SQL editor and the owner fixing a row by hand.
-- `authenticated` and `anon` - which is every request a browser can make, and
-- every request a normal (non-preview) deploy makes - are untouched and still
-- counted exactly as before.
--
-- WHAT STILL HOLDS THE LINE IN PREVIEW. The app-side check in
-- claimPropertyAction (src/app/onboarding/actions.ts) is unchanged and still
-- computes the same cap; the admin-client insert is scoped to the VERIFIED
-- user id, never to an id off the request body. So the cap is still 5 homes in
-- preview - it is simply enforced by the action rather than by this trigger,
-- which is the same relationship the app and the trigger have always had (0108
-- calls itself "the backstop" and the action "the primary guard").
--
-- NOT GATED ON PREVIEW MODE, and it cannot be: NEXT_PUBLIC_PREVIEW_MODE is an
-- application environment variable and this function runs inside Postgres,
-- which has no way to read it. The gate is on the CALLER instead - only the
-- app decides to use the admin client, and only in preview.
create or replace function public.enforce_properties_home_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owned bigint;
  v_plus  boolean;
  v_cap   int;
  v_role  text;
begin
  -- ---- ADDED IN 0168 (preview mode). Everything else is 0108 verbatim. ----
  begin
    v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb
                ->> 'role';
  exception when others then
    v_role := null;
  end;

  if v_role = 'service_role'
     or current_user in ('service_role', 'postgres', 'supabase_admin')
  then
    return new;
  end if;
  -- ---- end of the 0168 addition ------------------------------------------

  -- Serialize concurrent inserts for THIS user (see RACE-SAFETY in 0108).
  -- Keyed on the owner's user_id via the two-int form of
  -- pg_advisory_xact_lock, so only same-user inserts wait on each other.
  perform pg_advisory_xact_lock(hashtext('hearth_home_cap'), hashtext(new.user_id::text));

  -- LIVE homeowner Hearth Plus, derived exactly as src/lib/subscription.ts
  -- hasPlus() does and identically to 0081's plus_poster: a homeowner-side row
  -- (side = 'homeowner', or a plan that is not a pro_ plan), active or
  -- trialing, and not past a known period end.
  v_plus := exists (
    select 1
    from public.subscriptions s
    where s.user_id = new.user_id
      and (s.side = 'homeowner'
           or s.plan is null
           or s.plan not like 'pro\_%' escape '\')
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );

  -- Free accounts: 1 home. Plus: up to 5 (landlord / multi-property owner).
  v_cap := case when v_plus then 5 else 1 end;

  -- Count only OWNED rows - homes shared with this user (0048) belong to a
  -- different user_id and are excluded automatically.
  select count(*) into v_owned
  from public.properties p
  where p.user_id = new.user_id;

  if v_owned >= v_cap then
    if v_plus then
      raise exception 'Home limit reached: Hearth Plus covers up to 5 homes.'
        using errcode = 'check_violation';
    else
      raise exception 'Home limit reached: free accounts can track 1 home. Upgrade to Hearth Plus for up to 5.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- The trigger itself is NOT redefined: 0108's `properties_home_cap` already
-- points at this function by name, and CREATE OR REPLACE FUNCTION keeps that
-- binding (the PRECHECK above refuses to run if it has gone missing).


-- ---- VERIFY -----------------------------------------------------------------
-- select count(*) from pg_policies
--   where schemaname = 'public' and tablename = 'pro_waitlist';
-- -- expect 0 (service-role only).
--
-- select relrowsecurity from pg_class
--   where oid = 'public.pro_waitlist'::regclass;
-- -- expect true.
--
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'pro_waitlist'
--     and grantee in ('anon', 'authenticated');
-- -- expect zero rows.
--
-- select pg_get_functiondef('public.enforce_properties_home_cap()'::regprocedure)
--   like '%service_role%' as has_preview_clause;
-- -- expect true.
--
-- select tgname from pg_trigger
--   where tgrelid = 'public.properties'::regclass and tgname = 'properties_home_cap';
-- -- expect one row (0108's trigger, still bound to the replaced function).
--
-- select email, trade, city, source, created_at
--   from public.pro_waitlist order by created_at desc;
-- -- the waitlist. Zero rows until preview mode is switched on in Vercel.
