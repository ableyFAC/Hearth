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
