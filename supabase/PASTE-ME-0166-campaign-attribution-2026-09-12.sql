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
