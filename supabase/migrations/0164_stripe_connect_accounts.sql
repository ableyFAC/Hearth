-- =============================================================================
-- OakTend - Stripe Connect (Express) account state on contractors (0164)
-- RUN THIS AGAINST THE LIVE DATABASE (Supabase SQL editor).
--
-- WHY THIS EXISTS. The payment model changed on 2026-09-12 (handoff.md
-- "LATEST"): lead credits are being replaced by a 5% cut of the invoice, taken
-- as an application_fee on a DIRECT CHARGE made on the contractor's own Stripe
-- Connect (Express) account. That model has one hard prerequisite - every
-- contractor must have a connected account before they can send any invoice -
-- and this migration is the place that prerequisite is recorded.
--
-- WHAT IT ADDS. Seven columns on public.contractors, all nullable-or-defaulted
-- so an existing row needs no backfill:
--   stripe_account_id                 the acct_... id, one per contractor
--   stripe_charges_enabled            \
--   stripe_payouts_enabled             |  mirrored from the connected account
--   stripe_details_submitted           |  by the Connect webhook
--   stripe_requirements_currently_due  |  (src/app/api/stripe/connect-webhook)
--   stripe_disabled_reason            /   and by the on-return sync
--   stripe_account_synced_at          when that mirror was last written
--
-- Nothing in step 1 GATES on these columns. They are read to decide which card
-- to show on /pro/payouts, on pro Home and on /pro/business; step 2 (the
-- invoice flow) is what will refuse to send an invoice without them, through
-- canSendInvoices() in src/lib/connectStatus.ts.
--
-- ---------------------------------------------------------------------------
-- GRANTS: DELIBERATELY NONE. This is the part to read before changing anything.
--
-- These columns are the app's record of a MONEY destination and of Stripe's own
-- verification verdict on a business. Nothing a pro's browser sends may ever
-- write them, and nothing a browser asks for may read them back.
--
-- That is already true by construction on this database, and this migration is
-- careful not to break it:
--   * 0069 revoked table-level SELECT on public.contractors from both
--     `authenticated` and `anon`, then granted SELECT back on an explicit
--     column list (id, user_id, name, categories, service_area, rating,
--     review_count, license_number, contact_phone, contact_email, slug,
--     logo_url, about, created_at). A column-level GRANT does not widen when a
--     new column appears, so every column below is UNREADABLE by
--     `authenticated`/`anon` from the moment it is created.
--   * 0085 revoked table-level UPDATE and INSERT from `authenticated, anon`
--     and re-granted both scoped to an explicit column allowlist, for exactly
--     the same reason. So every column below is likewise UNWRITABLE by
--     `authenticated`/`anon` from the moment it is created.
--
-- Therefore this file issues NO grant of any kind, and needs no revoke either:
-- there is no table-level privilege left on public.contractors for a
-- column-level revoke to narrow (0085's comment explains at length why a
-- column REVOKE on top of a surviving table GRANT is a silent no-op - if that
-- table-level grant is ever restored, these columns become writable by every
-- signed-in pro and the fix is to revoke the table-level privilege again, not
-- to add column revokes here). The PRECHECK below asserts that state rather
-- than assuming it.
--
-- Every write to these columns therefore goes through createAdminClient()
-- (service_role), which bypasses table and column grants entirely:
--   src/lib/stripeConnect.ts   ensureConnectAccount / syncConnectAccount /
--                              refreshConnectAccount / disconnectAccount
--   src/app/api/stripe/connect-webhook/route.ts (account.updated,
--                              account.application.deauthorized)
-- and every read goes through readConnectRow() in the same module, also on the
-- admin client, keyed on the CURRENT USER'S OWN contractor id - never an id
-- supplied by the browser.
-- ---------------------------------------------------------------------------
--
-- Safe to re-run: every statement is `if not exists` or `create or replace`.
-- =============================================================================

-- ---- PRECHECK: refuse to run against a database that isn't caught up -------
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
-- 0069 (SELECT) and 0085 (UPDATE/INSERT) are what make a brand-new column on
-- this table private by default. If a later change handed the table-level
-- privilege back to `authenticated`, adding these columns would silently expose
-- a money destination to every signed-in pro's own browser client. Refuse
-- rather than do that quietly.
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
-- NULL - and so this index can be built on a live table that is almost all
-- NULLs. It is also the backstop for the create race in
-- ensureConnectAccount(): two concurrent wizard completions for one contractor
-- both call stripe.accounts.create with the SAME idempotency key, so Stripe
-- returns the same account to both, and the conditional
-- `... where stripe_account_id is null` update means only one of them writes.
create unique index if not exists contractors_stripe_account_id_uidx
  on public.contractors (stripe_account_id)
  where stripe_account_id is not null;

-- ---- Column comments ------------------------------------------------------
-- Each one says the same thing in the database that the header says here: this
-- value is written by service_role and by nothing else.
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

-- ---- VERIFY -----------------------------------------------------------------
-- -- 1. The columns exist:
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'contractors'
--   and column_name like 'stripe\_%'
-- order by column_name;
-- -- expect seven rows.
--
-- -- 2. The unique index exists:
-- select indexname from pg_indexes
-- where schemaname = 'public' and tablename = 'contractors'
--   and indexname = 'contractors_stripe_account_id_uidx';
-- -- expect one row.
--
-- -- 3. THE IMPORTANT ONE. No grant of any kind reached these columns:
-- select grantee, privilege_type, column_name
-- from information_schema.column_privileges
-- where table_schema = 'public' and table_name = 'contractors'
--   and grantee in ('authenticated', 'anon')
--   and column_name like 'stripe\_%';
-- -- expect ZERO rows. Any row here is a bug: fix it with
-- --   revoke all (that column) on public.contractors from authenticated, anon;
-- -- and find out what granted it.
