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
  -- Part 2 extends the LATEST body (0110 extra-home slots + the 0154 OakTend
  -- rename). If live is on an older body, replacing it would be a regression
  -- dressed as a feature, so refuse and name what to apply.
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'enforce_properties_home_cap'
      and p.prosrc like '%extra_home_slots%'
      and p.prosrc like '%OakTend Plus%'
  ) then
    raise exception 'PRECHECK: public.enforce_properties_home_cap() is not on its latest body (0110 extra_home_slots + 0154_oaktend_rename_messages wording). Paste supabase/migrations/0154_oaktend_rename_messages.sql (it carries the 0110 body) before this file. Nothing was changed.';
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
-- THE ONLY CHANGE from the LIVE body is the six-line v_role block and the
-- `if v_role = 'service_role' ... return new` that follows it. Everything
-- below that point - the advisory lock, the Plus predicate, the paid
-- extra-home slots (0110), the 1 / 5 + slots cap, the count, both exception
-- messages with the OakTend wording (0154_oaktend_rename_messages) - is the
-- latest body byte for byte. The trigger was created in 0108, re-created
-- with extra_home_slots in 0110, and re-created with the brand rename in
-- 0154_oaktend_rename_messages; THAT is the body this file extends. (A first
-- draft of this file extended 0108's body instead, which would have silently
-- dropped the paid extra-home slots and put "Hearth" back in an error a
-- homeowner sees. Caught at review 2026-09-12 before it was pasted.) Diff it
-- against supabase/migrations/0154_oaktend_rename_messages.sql before pasting.
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
  v_extra int;
  v_cap   int;
  v_role  text;
begin
  -- ---- ADDED IN 0168 (preview mode). Everything else is the live body
  -- (0110 + 0154_oaktend_rename_messages) verbatim. ---------------------------
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

  -- Serialize concurrent inserts for THIS user (see 0107's RACE-SAFETY note).
  -- Keyed on the owner's user_id, so only same-user inserts wait on each other.
  perform pg_advisory_xact_lock(hashtext('hearth_home_cap'), hashtext(new.user_id::text));

  -- LIVE homeowner OakTend Plus, derived exactly as src/lib/subscription.ts
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

  -- Paid extra-home slots, summed over the SAME live homeowner-side row(s). A
  -- non-Plus account has no live homeowner row here, so this is 0 and its cap
  -- stays 1. There is at most one homeowner row per user, but sum() keeps this
  -- correct regardless.
  select coalesce(sum(s.extra_home_slots), 0) into v_extra
  from public.subscriptions s
  where s.user_id = new.user_id
    and (s.side = 'homeowner'
         or s.plan is null
         or s.plan not like 'pro\_%' escape '\')
    and s.status in ('active', 'trialing')
    and (s.current_period_end is null or s.current_period_end > now());

  -- Free accounts: 1 home. Plus: 5 (landlord / multi-property owner) plus any
  -- paid extra-home slots.
  v_cap := (case when v_plus then 5 else 1 end) + coalesce(v_extra, 0);

  -- Count only OWNED rows - homes shared with this user (0048) belong to a
  -- different user_id and are excluded automatically.
  select count(*) into v_owned
  from public.properties p
  where p.user_id = new.user_id;

  if v_owned >= v_cap then
    if v_plus then
      raise exception 'Home limit reached: your OakTend Plus plan covers % homes. Add more from the Plus page.', v_cap
        using errcode = 'check_violation';
    else
      raise exception 'Home limit reached: free accounts can track 1 home. Upgrade to OakTend Plus for up to 5.'
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
