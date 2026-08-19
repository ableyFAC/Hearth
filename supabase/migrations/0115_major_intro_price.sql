-- =============================================================================
-- Hearth - major tier $99 + $49.99 first big-ticket lead intro price (0113)
-- RUN THIS AGAINST THE LIVE DATABASE (Supabase SQL editor); editing repo SQL
-- alone does NOT change the already-deployed database. APPLIED to live 2026-07-22.
--
-- WHAT CHANGES (owner decision, 2026-07-12):
--   1. The major (big-ticket) lead tier moves from $90 to $99. The dollar
--      number itself lives in src/lib/constants.ts (LEAD_TIER_FEES.major),
--      which postJobAction snapshots onto contractor_leads.payout_amount at
--      post time, so NEW major jobs carry 99 as soon as the app deploys.
--      Nothing in SQL stores the tier price; existing open major leads keep
--      their posted payout_amount (90) and keep charging from that snapshot,
--      which is at or below the newly advertised price, so no pro ever pays
--      more than the card said.
--   2. INTRO PRICE: a pro's FIRST major-tier lead EVER costs $49.99 (4999
--      cents); every major-tier lead after that costs the normal tier price.
--      "First ever" is derived from EXISTING data, no new column: has this
--      contractor any lead_applications row with fee_cents > 0 whose lead is
--      a major-tier category? Both charge paths (apply_to_lead and
--      unlock_direct_request) insert such a row at charge time, so the very
--      act of paying the intro price ends eligibility. A later refund
--      (ghost protection, credit-back, first-application guarantee) does NOT
--      restore eligibility: the pro was made whole for that fee, and their
--      first big-ticket lead really did cost $49.99.
--
-- WHERE THE PRICE IS DECIDED: only here, in the two SECURITY DEFINER charge
-- functions. The app's board preview (src/app/pro/page.tsx) mirrors this math
-- for display, but what the wallet is debited comes from these functions.
--
-- RACE SAFETY: the existing charge paths already serialize all of a pro's
-- charges on the wallet row FOR UPDATE (0065/0087/0104). The intro-price
-- check runs AFTER that lock is taken: if two major applies race, the second
-- transaction blocks on the wallet lock until the first commits, and (READ
-- COMMITTED) its post-lock statements see the first's freshly committed
-- lead_applications row, so exactly one charge can ever get the intro price.
--
-- REFUNDS: every refund path (ghost_refund_application 0028,
-- ghost_refund_direct 0104, choose_applicant's credit-back 0106,
-- guarantee_refund_first_application 0041) pays back lead_applications
-- .fee_cents or the actual wallet_transactions deltas, never a hardcoded
-- tier price, so an intro-priced lead refunds exactly $49.99. The
-- choose_applicant ghost re-charge likewise re-charges the stored fee_cents,
-- so a revived intro application re-charges the intro amount.
--
-- KEEP IN SYNC: the major category list below mirrors LEAD_FEES in
-- src/lib/constants.ts (roof / structural / remodeling), and 4999 mirrors
-- MAJOR_INTRO_FEE there.
--
-- Idempotent: CREATE OR REPLACE throughout, unchanged signatures for the two
-- charge functions (preserves their existing EXECUTE grants). Safe to re-run.
-- =============================================================================

-- ---- 1. Price helper ---------------------------------------------------------
-- Returns what a major-tier charge should actually cost this contractor:
-- the intro price (4999) on their first ever paid major lead, otherwise the
-- price passed in. Non-major categories pass through untouched. least() is a
-- safety net so a deeper aging markdown could never be priced UP to the intro.
-- Counts refunded rows on purpose (see header: a refund does not restore
-- intro eligibility). STABLE, and only ever called inside the two SECURITY
-- DEFINER charge functions after the caller holds the wallet lock.
create or replace function public.major_lead_price_cents(
  p_contractor uuid, p_category text, p_price_cents bigint
) returns bigint language sql stable set search_path = public as $$
  select case
    when p_category in ('roof', 'structural', 'remodeling')
     and not exists (
       select 1
         from lead_applications la
         join contractor_leads cl on cl.id = la.lead_id
        where la.contractor_id = p_contractor
          and coalesce(la.fee_cents, 0) > 0
          and cl.category in ('roof', 'structural', 'remodeling')
     )
    then least(p_price_cents, 4999)
    else p_price_cents
  end;
$$;

revoke all on function public.major_lead_price_cents(uuid, text, bigint) from public;
revoke all on function public.major_lead_price_cents(uuid, text, bigint) from anon;
revoke all on function public.major_lead_price_cents(uuid, text, bigint) from authenticated;

-- ---- 2. apply_to_lead: intro-aware charge -------------------------------------
-- Byte-for-byte the 0087 body (its Orange County gate, aging price, wallet
-- lock, cash-first split, FIFO bonus drain, ledger row) with ONE block added:
-- the intro-price adjustment, placed AFTER the wallet FOR UPDATE so the
-- first-ever check is serialized per pro (see RACE SAFETY in the header).
create or replace function public.apply_to_lead(p_lead uuid, p_message text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid; v_wallet uuid; v_cats text[]; v_oc boolean;
  v_lead_contractor uuid; v_status text; v_category text; v_price bigint;
  v_property uuid; v_owner uuid;
  v_cash bigint; v_bonus bigint; v_grant_sum bigint; v_bonus_avail bigint;
  v_from_cash bigint; v_from_bonus bigint;
  v_remaining bigint; v_grant record; v_cash_first boolean;
  v_cash_after bigint; v_bonus_after bigint;
begin
  perform set_config('hearth.lead_write', 'on', true);

  select id, categories, serves_orange_county
    into v_contractor, v_cats, v_oc
    from contractors where user_id = auth.uid();
  if v_contractor is null then raise exception 'Not a contractor'; end if;

  -- 0087 fix (MED): reproduce open_jobs_for_me()'s hard Orange County launch
  -- gate here too, so a pro who never confirmed serves_orange_county can't
  -- bypass the board by applying directly against a leaked/guessed lead id.
  if not coalesce(v_oc, false) then
    raise exception 'Confirm you serve Orange County, CA in your profile before applying to jobs';
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
-- Signature is unchanged from 0087's definition, so CREATE OR REPLACE
-- preserves apply_to_lead's existing EXECUTE grants (authenticated) without
-- needing to restate them here.

-- ---- 3. unlock_direct_request: intro-aware charge -----------------------------
-- Byte-for-byte the 0104 body with TWO additions: the lead SELECT also reads
-- category (needed to recognize a major-tier request), and the same
-- intro-price adjustment as apply_to_lead, again AFTER the wallet FOR UPDATE.
-- A direct request is a real paid major lead, so it both gets the intro price
-- and (via the lead_applications row it inserts) ends intro eligibility.
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
begin
  -- Privileged flag: the contractor_leads_locked trigger (0077, latest body
  -- 0088) strips any client write to contractor_id/paid/paid_at/status unless
  -- this session flag is set, exactly as apply_to_lead/choose_applicant do
  -- (0087). Without it, the final assignment UPDATE below would be silently
  -- reverted after the wallet was already debited. Must be the FIRST statement.
  perform set_config('hearth.lead_write', 'on', true);

  select id into v_contractor from contractors where user_id = auth.uid();
  if v_contractor is null then raise exception 'Not a contractor'; end if;

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
-- Signature is unchanged from 0104's definition, so CREATE OR REPLACE
-- preserves unlock_direct_request's existing EXECUTE grants without needing
-- to restate them here.
