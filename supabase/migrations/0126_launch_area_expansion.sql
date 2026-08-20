-- =============================================================================
-- Hearth - expand the launch area from 2 cities to 9 (0126)
-- RUN THIS AGAINST THE LIVE DATABASE (Supabase SQL editor); editing repo SQL
-- alone does NOT change the already-deployed database.
--
-- WHY: 0126 is an owner decision, not a bug fix. 0124 shipped this morning and
-- enforced exactly two launch cities, Huntington Beach and Fountain Valley, on
-- both sides of the marketplace: a homeowner outside them cannot claim a home,
-- and a pro cannot see or apply to a job outside the cities they checked. That
-- gate works. The launch area itself is now wider: the seven cities that
-- border those two - Seal Beach, Westminster, Midway City, Garden Grove,
-- Santa Ana, Costa Mesa and Newport Beach - are close enough that the same
-- pros already drive through them, so serving them costs Hearth nothing in
-- supply and roughly quadruples the homes it can honestly say yes to.
--
-- All nine cities are in Orange County, so serves_orange_county keeps its
-- meaning exactly: checking ANY launch city is still a truthful yes to the
-- 0074 attestation, and every gate built on that boolean keeps working
-- untouched. This migration only widens the narrower, per-city half.
--
-- WHAT CHANGES:
--   1. The CHECK constraint on contractors.launch_cities is dropped and
--      re-added allowing a subset of the NINE city names instead of two.
--      Widening only - no value that was legal under 0124 becomes illegal.
--   2. launch_city_for_zip(text) is re-issued with the full ZIP map for all
--      nine cities (29 ZIPs, all residential-delivery, all inside the
--      ORANGE_COUNTY_ZIPS set in src/lib/serviceArea.ts).
--   3. A SURFSIDE CORRECTION, folded into item 2: 0124 mapped 90743 to
--      Huntington Beach. That was wrong. Surfside is a colony of SEAL BEACH,
--      not an annexed part of Huntington Beach - 90742 (Sunset Beach) is the
--      one HB annexed. 90743 now maps to Seal Beach here and in
--      src/lib/serviceArea.ts. Harmless to correct now: under 0124 both cities
--      were the same two-city launch area for every backfilled pro, and the
--      backfill below grants all nine cities anyway, so no pro loses access to
--      a Surfside job because of this.
--   4. Backfill: every pro who attested serves_orange_county gets ALL NINE
--      cities, exactly as 0124's backfill gave them both of two. They attested
--      to Orange County broadly, and all nine cities are in Orange County, so
--      granting the whole launch area preserves the spirit of that attestation
--      precisely - and, as in 0124, this migration must not silently narrow
--      anyone.
--   5. apply_to_lead is re-issued as a COPY-ONLY change, exactly like 0118
--      was: 0124's body byte for byte with two refusal MESSAGES generalized so
--      they stop naming two of nine cities. No logic, no gate, no money path
--      moves. See the section header above the function for the exact diff.
--
-- open_jobs_for_me() NEEDS NO CHANGE and is deliberately not re-issued here.
-- Its launch gate is one line - `public.launch_city_for_zip(pr.zip) = any
-- (c.launch_cities)` - which reads the helper and the column, both of which
-- this migration updates underneath it. Re-issuing a function whose text does
-- not change would only add risk. Same for browse_pros, unlock_direct_request,
-- the wallet functions, and the 0125 license index: untouched.
--
-- WHAT ELSE DOES NOT CHANGE, deliberately: serves_orange_county and every gate
-- on it, the launch_cities column itself (0124 created it) and its column-level
-- grants (0124 granted them; the constraint swap below does not disturb
-- privileges), the aging price, the 0115 intro price, the wallet lock, the
-- cash-first split, the FIFO bonus drain, the ledger row, the applicant cap,
-- the relationship guard.
--
-- ORDER MATTERS: the CHECK constraint is widened BEFORE the backfill writes
-- the nine-city array, because the old two-city constraint would reject every
-- one of those updates.
--
-- Idempotent: drop-then-add for the constraint, CREATE OR REPLACE for both
-- functions, and a backfill guarded on `not (launch_cities @> <all nine>)` so
-- a second run updates zero rows. Safe to re-run.
-- =============================================================================

-- ---- 1. The launch-city allowlist ---------------------------------------------
-- Drop-then-add, the same shape 0124 used and for the same reason: a re-run
-- cannot fail on an already-present constraint, and the next edit to the city
-- list lands just as cleanly. The nine names are the canonical list, in launch
-- order, mirrored by LAUNCH_CITY_NAMES in src/lib/serviceArea.ts (which the
-- signup/profile checkboxes re-export as LAUNCH_CITIES).
alter table public.contractors
  drop constraint if exists contractors_launch_cities_subset;
alter table public.contractors
  add constraint contractors_launch_cities_subset
  check (launch_cities <@ array[
    'Huntington Beach', 'Fountain Valley', 'Seal Beach', 'Westminster',
    'Midway City', 'Garden Grove', 'Santa Ana', 'Costa Mesa', 'Newport Beach'
  ]::text[]);

comment on column public.contractors.launch_cities is
  'Which of the nine launch cities this pro actually covers, from the signup / '
  'profile checkboxes (LAUNCH_CITY_NAMES in src/lib/serviceArea.ts, canonical '
  'order). open_jobs_for_me() and apply_to_lead() both filter on it: a job '
  'whose property ZIP maps (launch_city_for_zip) to a city NOT in this array '
  'is hidden from the board and refused at apply time. Empty means no city, '
  'so no jobs - narrower than serves_orange_county, which still has to be '
  'true as well.';

-- ---- 2. ZIP -> launch city, all nine cities ------------------------------------
-- The one canonical mapping, replacing 0124's two-city version. OR REPLACE, so
-- the signature, the immutability, and the grant posture 0124 settled on
-- (REVOKE from public/anon, EXECUTE to authenticated + service_role) all carry
-- over untouched - which is why those grants are not restated here.
--
-- 90740/90742/90743 route through 90xxx ZIPs: the OC/LA border overlap
-- ORANGE_COUNTY_ZIPS documents, not a mistake. 90742 (Sunset Beach) was
-- annexed by Huntington Beach; 90743 (Surfside) is a Seal Beach colony, which
-- is the correction described in the header. Anything not listed is not a
-- launch city and returns null, which every caller treats as "hide it".
-- Normalization matches launchCityForZip in src/lib/serviceArea.ts exactly:
-- trim, then take the first 5 characters, so a ZIP+4 and a padded ZIP both
-- resolve.
create or replace function public.launch_city_for_zip(p_zip text)
returns text language sql immutable set search_path = public as $$
  select case left(btrim(coalesce(p_zip, '')), 5)
           -- Huntington Beach, including Sunset Beach (90742)
           when '92646' then 'Huntington Beach'
           when '92647' then 'Huntington Beach'
           when '92648' then 'Huntington Beach'
           when '92649' then 'Huntington Beach'
           when '90742' then 'Huntington Beach'
           -- Fountain Valley
           when '92708' then 'Fountain Valley'
           -- Seal Beach, including Surfside (90743)
           when '90740' then 'Seal Beach'
           when '90743' then 'Seal Beach'
           -- Westminster
           when '92683' then 'Westminster'
           -- Midway City (unincorporated, its own single ZIP)
           when '92655' then 'Midway City'
           -- Garden Grove
           when '92840' then 'Garden Grove'
           when '92841' then 'Garden Grove'
           when '92843' then 'Garden Grove'
           when '92844' then 'Garden Grove'
           when '92845' then 'Garden Grove'
           -- Santa Ana
           when '92701' then 'Santa Ana'
           when '92703' then 'Santa Ana'
           when '92704' then 'Santa Ana'
           when '92705' then 'Santa Ana'
           when '92706' then 'Santa Ana'
           when '92707' then 'Santa Ana'
           -- Costa Mesa
           when '92626' then 'Costa Mesa'
           when '92627' then 'Costa Mesa'
           -- Newport Beach, including Corona del Mar (92625) and Balboa
           -- Island (92662)
           when '92625' then 'Newport Beach'
           when '92657' then 'Newport Beach'
           when '92660' then 'Newport Beach'
           when '92661' then 'Newport Beach'
           when '92662' then 'Newport Beach'
           when '92663' then 'Newport Beach'
           else null
         end;
$$;

comment on function public.launch_city_for_zip(text) is
  'Maps a property ZIP to one of Hearth''s nine launch cities, or null when it '
  'is none of them. Kept in sync by hand with launchCityForZip() in '
  'src/lib/serviceArea.ts. Read by open_jobs_for_me() and apply_to_lead().';

-- ---- 3. Backfill ---------------------------------------------------------------
-- Every pro who attested serves_orange_county (0074/0098) gets the full launch
-- area, exactly as 0124's backfill gave them both of the two cities that
-- existed then. The attestation they signed is "I serve Orange County", and
-- all nine launch cities are in Orange County, so the whole launch area is
-- what that attestation already says.
--
-- READ THIS BEFORE RUNNING: unlike 0124's backfill, this one is NOT restricted
-- to rows still at the default. A pro who narrowed their pick since 0124 has
-- that pick WIDENED back to all nine. That is the owner's decision (expand
-- everyone into the new area rather than make them re-opt-in), and it only
-- ever grants access, never removes it. A pro who wants a narrower board can
-- uncheck cities in their profile at any time.
--
-- The `not (launch_cities @> array[...])` guard exists so a re-run right after
-- the first is a zero-row update rather than a rewrite of every contractors
-- row. It is NOT a promise to leave a later narrowing alone: a pro who trims
-- their cities tomorrow would be re-widened by a re-run, so run this once, at
-- expansion time, and never on a schedule.
update public.contractors
   set launch_cities = array[
         'Huntington Beach', 'Fountain Valley', 'Seal Beach', 'Westminster',
         'Midway City', 'Garden Grove', 'Santa Ana', 'Costa Mesa',
         'Newport Beach'
       ]
 where serves_orange_county = true
   and not (launch_cities @> array[
         'Huntington Beach', 'Fountain Valley', 'Seal Beach', 'Westminster',
         'Midway City', 'Garden Grove', 'Santa Ana', 'Costa Mesa',
         'Newport Beach'
       ]::text[]);

-- ---- 4. apply_to_lead: 0124's body, two messages generalized -------------------
-- A COPY-ONLY re-issue, exactly like 0118 was. 0124 is the latest definition of
-- apply_to_lead in this folder (0125 does not touch it), so this replaces the
-- body that is actually live. The diff vs 0124 is two strings and NOTHING else:
--
--   before: 'Confirm you serve Huntington Beach or Fountain Valley in your profile before applying to jobs'
--   after:  'Confirm the cities you serve in your profile before applying to jobs'
--
--   before: 'This job is outside the cities you serve. Update your service area (Huntington Beach / Fountain Valley) in your profile.'
--   after:  'This job is outside the cities you serve. Update your service area in your profile.'
--
-- Both named two of what are now nine cities, so both would have sent a pro
-- serving Santa Ana off to fix a service area that was never the problem. The
-- second string is the one 0124 introduced; the first is 0118's, re-generalized
-- for the same reason 0118 changed it in the first place.
--
-- Every line of logic below is 0124's, character for character: the same two
-- gates, the same aging price, the same 0113 intro price, the same wallet FOR
-- UPDATE, the same cash-first split, the same FIFO bonus drain, the same
-- applicant cap, the same relationship guard, the same ledger row. This
-- migration cannot move money differently.
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
begin
  perform set_config('hearth.lead_write', 'on', true);

  select id, categories, serves_orange_county, launch_cities
    into v_contractor, v_cats, v_oc, v_launch_cities
    from contractors where user_id = auth.uid();
  if v_contractor is null then raise exception 'Not a contractor'; end if;

  -- 0087 fix (MED): reproduce open_jobs_for_me()'s hard Orange County launch
  -- gate here too, so a pro who never confirmed serves_orange_county can't
  -- bypass the board by applying directly against a leaked/guessed lead id.
  if not coalesce(v_oc, false) then
    raise exception 'Confirm the cities you serve in your profile before applying to jobs';
  end if;

  -- Price the fee from the job's age at apply time (the aging deal). FOR UPDATE
  -- serializes concurrent applies to the same job so the cap below can't be
  -- raced past 3.
  select contractor_id, status, category, property_id,
         public.lead_fee_cents(payout_amount, created_at)
    into v_lead_contractor, v_status, v_category, v_property, v_price
    from contractor_leads where id = p_lead
    for update;
  if v_category is null then raise exception 'Job not found'; end if;

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
  v_price := public.major_lead_price_cents(v_contractor, v_category, v_price);

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

  insert into lead_applications (lead_id, contractor_id, message, status, fee_cents)
    values (p_lead, v_contractor, nullif(btrim(p_message), ''), 'applied', v_price);

  insert into wallet_transactions
    (wallet_id, type, cash_delta_cents, bonus_delta_cents,
     cash_balance_after_cents, bonus_balance_after_cents, lead_id, note)
    values (v_wallet, 'apply_fee', -v_from_cash, -v_from_bonus,
            v_cash_after, v_bonus_after, p_lead, 'Applied to job');

  return true;
end; $$;
-- Signature is unchanged from 0124's definition, so CREATE OR REPLACE
-- preserves apply_to_lead's existing EXECUTE grants (authenticated) without
-- needing to restate them here.
