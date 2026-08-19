-- ============================================================================
-- HEARTH LIVE-DB BUNDLE: migration 0124 (2026-08-19)
-- Paste this WHOLE file into the Supabase SQL editor and run it ONCE.
-- Safe to re-run: every section is idempotent.
-- Live DB should be at 0123 before this. After running, live is at 0124.
--
-- ORDER MATTERS INSIDE THE FILE: the launch_cities column and the
-- launch_city_for_zip() helper are created before the two functions that read
-- them, so do not paste sections out of order.
-- ============================================================================

-- >>>>>>>>>> BEGIN 0124_launch_city_enforcement.sql >>>>>>>>>>

-- =============================================================================
-- Hearth - enforce the two launch cities, per pro and per job (0124)
-- RUN THIS AGAINST THE LIVE DATABASE (Supabase SQL editor); editing repo SQL
-- alone does NOT change the already-deployed database.
--
-- WHY: Hearth launches in exactly two cities, Huntington Beach and Fountain
-- Valley. The copy has said so since 0118, but nothing enforced it. Pro signup
-- already asks WHICH of the two a pro covers (two checkboxes,
-- src/app/pro/onboarding/LaunchCityCheckboxes.tsx + launchCities.ts), and then
-- collapses that answer into contractors.serves_orange_county - a single
-- boolean covering all of Orange County. So a pro who checked only Fountain
-- Valley still saw (and could pay to apply to) every Huntington Beach job, and
-- the per-city answer they gave was thrown away. On the homeowner side the ZIP
-- gate accepted any Orange County ZIP, so an Irvine or Anaheim address could
-- claim a home in a market Hearth has no pros for.
--
-- WHAT CHANGES:
--   1. contractors gains launch_cities text[] (not null, default '{}'), CHECK
--      constrained to a subset of the two launch cities. This is the per-city
--      pick, stored instead of discarded.
--   2. Backfill: every pro who already attested serves_orange_county gets both
--      cities. Both launch cities are inside Orange County, so an existing
--      attestation covers both, and granting both preserves each pro's current
--      access EXACTLY - this migration must not silently narrow anyone.
--   3. Column-level INSERT/UPDATE grants on launch_cities for `authenticated`,
--      because 0085 revoked the table-level privilege and re-granted an
--      explicit column allowlist. A new column is invisible to that allowlist
--      until it is named, which is the exact 42501 bug 0098 had to fix for
--      serves_orange_county. Same shape, ahead of time this round.
--   4. New helper launch_city_for_zip(text): the single canonical ZIP -> city
--      mapping the SQL gates below read. Mirrored byte-for-byte in
--      src/lib/serviceArea.ts (launchCityForZip) for the app-side gates.
--   5. open_jobs_for_me() gains ONE where-clause line: the job's city must be
--      one the pro picked.
--   6. apply_to_lead() gains the same gate, so a pro cannot bypass the board by
--      applying directly against a leaked or guessed lead id (the same reason
--      0087 duplicated the serves_orange_county gate here).
--
-- NOT A TRIGGER JOB: contractors' column lock is grant-based, not a trigger.
-- 0080 revokes UPDATE/INSERT on a DENYLIST of trust columns (badges, balance)
-- and 0085 revokes the table-level privilege then re-grants an explicit column
-- ALLOWLIST. launch_cities is not a trust column, so 0080 is left alone; the
-- allowlist extension is item 3 above.
--
-- WHAT DOES NOT CHANGE, deliberately: serves_orange_county and every gate on
-- it (this is an ADDITIONAL narrowing, not a replacement - the 0074
-- attestation still has to be true first), the aging price, the 0115 intro
-- price, the wallet lock, the cash-first split, the FIFO bonus drain, the
-- ledger row, the applicant cap, the relationship guard. apply_to_lead's body
-- below is 0118's copied byte for byte plus two declarations, one extra
-- selected column, and the city gate block - nothing in this migration can
-- move money differently.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, drop-then-add for the CHECK
-- constraint, a backfill that only touches rows still at '{}', additive
-- grants, CREATE OR REPLACE for all three functions. Safe to re-run.
-- =============================================================================

-- ---- 1. The per-city pick -----------------------------------------------------
alter table public.contractors
  add column if not exists launch_cities text[] not null default '{}';

comment on column public.contractors.launch_cities is
  'Which of the two launch cities this pro actually covers, from the signup / '
  'profile checkboxes (src/app/pro/onboarding/launchCities.ts, canonical '
  'order). open_jobs_for_me() and apply_to_lead() both filter on it: a job '
  'whose property ZIP maps (launch_city_for_zip) to a city NOT in this array '
  'is hidden from the board and refused at apply time. Empty means no city, '
  'so no jobs - narrower than serves_orange_county, which still has to be '
  'true as well.';

-- Drop-then-add so a re-run cannot fail on an already-present constraint, and
-- so a future edit to the city list lands cleanly.
alter table public.contractors
  drop constraint if exists contractors_launch_cities_subset;
alter table public.contractors
  add constraint contractors_launch_cities_subset
  check (launch_cities <@ array['Huntington Beach', 'Fountain Valley']::text[]);

-- ---- 2. Backfill --------------------------------------------------------------
-- Pre-existing pros attested to Orange County broadly (0074/0098). Both launch
-- cities are inside Orange County, so granting both is exactly what their
-- existing attestation already says - their access is unchanged the moment the
-- gates below go live. Only rows still at the '{}' default are touched, so a
-- re-run can never overwrite a pro's real per-city pick.
update public.contractors
   set launch_cities = array['Huntington Beach', 'Fountain Valley']
 where serves_orange_county = true
   and launch_cities = '{}';

-- ---- 3. Column grants ---------------------------------------------------------
-- 0085 revoked table-level UPDATE/INSERT on contractors and re-granted an
-- explicit column allowlist; a column not on that list fails 42501. 0098 had to
-- ship this same fix after the fact for serves_orange_county, which silently
-- blocked every new pro's job board. Same two grants, same style, shipped with
-- the column this time.
grant insert (launch_cities) on public.contractors to authenticated;
grant update (launch_cities) on public.contractors to authenticated;

-- ---- 4. ZIP -> launch city ----------------------------------------------------
-- The one canonical mapping. 90742/90743 are Sunset Beach and Surfside,
-- annexed parts of Huntington Beach that route through 90xxx ZIPs (the same
-- OC/LA border overlap ORANGE_COUNTY_ZIPS documents). Anything else is not a
-- launch city and returns null, which every caller treats as "hide it".
-- Normalization matches isOrangeCountyZip/launchCityForZip in
-- src/lib/serviceArea.ts exactly: trim, then take the first 5 characters, so a
-- ZIP+4 and a padded ZIP both resolve.
create or replace function public.launch_city_for_zip(p_zip text)
returns text language sql immutable set search_path = public as $$
  select case left(btrim(coalesce(p_zip, '')), 5)
           when '92646' then 'Huntington Beach'
           when '92647' then 'Huntington Beach'
           when '92648' then 'Huntington Beach'
           when '92649' then 'Huntington Beach'
           when '90742' then 'Huntington Beach'
           when '90743' then 'Huntington Beach'
           when '92708' then 'Fountain Valley'
           else null
         end;
$$;

comment on function public.launch_city_for_zip(text) is
  'Maps a property ZIP to one of Hearth''s two launch cities, or null when it '
  'is neither. Kept in sync by hand with launchCityForZip() in '
  'src/lib/serviceArea.ts. Read by open_jobs_for_me() and apply_to_lead().';

-- PUBLIC holds a default EXECUTE grant on every new function, and anon
-- inherits it, so revoking from anon alone would be a no-op - the exact bug
-- 0123 had to clean up after 0118 left browse_pros wide open. Revoke PUBLIC
-- first, then grant back only the roles that need it.
revoke all on function public.launch_city_for_zip(text) from public, anon;
grant execute on function public.launch_city_for_zip(text) to authenticated, service_role;

-- ---- 5. open_jobs_for_me: 0116's body + the launch-city gate ------------------
-- CREATE OR REPLACE, not drop + recreate: the return set is unchanged, and
-- OR REPLACE preserves the EXECUTE grant posture 0119/0123 settled on. The body
-- is 0116's byte for byte with exactly ONE added where-clause line.
--
-- HARD GATE, same posture as 0074's launch gate: the join to properties is a
-- LEFT join, so a lead with no property row yields a null ZIP, and
-- launch_city_for_zip(null) is null, which is `= any (...)` against nothing -
-- false. A lead whose ZIP is not a launch ZIP is hidden the same way. A pro
-- with an empty launch_cities sees NOTHING at all. Failing closed is the point:
-- a job Hearth cannot honestly serve should never be sold to a pro.
create or replace function public.open_jobs_for_me()
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
  has_plans_permits  boolean
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
         cl.has_plans_permits
  from contractor_leads cl
  join contractors c on c.user_id = auth.uid()
  left join properties pr on pr.id = cl.property_id
  where cl.contractor_id is null
    and cl.status = 'new'
    and cl.direct_to is null
    and (c.categories is null or cl.category = any (c.categories))
    and (c.service_state is null
         or pr.state is null
         or upper(btrim(pr.state)) = upper(btrim(c.service_state)))
    and c.serves_orange_county = true
    and public.launch_city_for_zip(pr.zip) = any (c.launch_cities)
    and not exists (
      select 1 from lead_applications la
      where la.lead_id = cl.id and la.contractor_id = c.id
    )
  order by plus_poster desc, cl.created_at desc
  limit 200;
$$;

-- ---- 6. apply_to_lead: 0118's body + the same launch-city gate ----------------
-- 0118 is the latest definition of apply_to_lead in this folder (0119, 0120,
-- 0121 and 0123 do not touch it), so this replaces the body that is actually
-- live. The diff vs 0118 is exactly three things and nothing else:
--   a. two new declarations, v_launch_cities and v_lead_city;
--   b. launch_cities added to the contractors select that already reads
--      categories and serves_orange_county;
--   c. the city gate block.
--
-- WHERE THE GATE SITS AND WHY: it needs the lead's property id, and v_property
-- is not known until the `for update` select on contractor_leads further down -
-- it cannot go next to the serves_orange_county gate above. So it sits
-- after that select's "Job not found" guard and the cheap early-returns that
-- follow it (already assigned, not open, already applied): late enough to have a
-- property id, early enough that a bogus lead id still gets the honest "Job not
-- found" message, and well before ANY money moves (get_or_create_wallet, the
-- wallet FOR UPDATE, the bonus drain, the wallet debit) or any row is written
-- (the lead_applications insert, the ledger row). Nothing between the select
-- and the gate mutates anything.
--
-- Same hard-gate posture as open_jobs_for_me above: a lead with no property, or
-- one whose ZIP is not a launch ZIP, is refused, and a pro with an empty
-- launch_cities can apply to nothing.
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
    raise exception 'Confirm you serve Huntington Beach or Fountain Valley in your profile before applying to jobs';
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
    raise exception 'This job is outside the cities you serve. Update your service area (Huntington Beach / Fountain Valley) in your profile.';
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
-- Signature is unchanged from 0118's definition, so CREATE OR REPLACE
-- preserves apply_to_lead's existing EXECUTE grants (authenticated) without
-- needing to restate them here.


-- <<<<<<<<<< END 0124_launch_city_enforcement.sql <<<<<<<<<<
