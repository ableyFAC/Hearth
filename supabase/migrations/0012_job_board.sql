-- =============================================================================
-- Hearth — job board (Indeed-style)
--
-- A homeowner POSTS A JOB: a contractor_leads row with contractor_id = NULL.
-- Pros PAY THE PER-CATEGORY FEE TO APPLY, creating a lead_applications row.
-- The homeowner REVIEWS applicants and CHOOSES one; the chosen pro is assigned
-- the lead and unlocked (gets contact + chat). Apply fees are non-refundable, so
-- the other applicants keep their 'applied' status with no refund.
--
-- Privacy: open jobs are read by ALL matching pros, but contractor_leads carries
-- the homeowner's contact snapshot, so pros never read that table directly for an
-- open job. They go through SECURITY DEFINER functions that return only safe,
-- non-contact columns until they are chosen (which assigns them the lead).
-- =============================================================================

-- ---- Applications -----------------------------------------------------------
create table if not exists public.lead_applications (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.contractor_leads (id) on delete cascade,
  contractor_id uuid not null references public.contractors (id) on delete cascade,
  message       text,
  status        text not null default 'applied'
                  check (status in ('applied', 'chosen', 'declined')),
  fee_cents     bigint not null default 0,
  created_at    timestamptz not null default now(),
  unique (lead_id, contractor_id)
);
create index if not exists lead_applications_lead_idx
  on public.lead_applications (lead_id);
create index if not exists lead_applications_contractor_idx
  on public.lead_applications (contractor_id);

alter table public.lead_applications enable row level security;

-- A contractor reads their own applications.
drop policy if exists "applications contractor read" on public.lead_applications;
create policy "applications contractor read" on public.lead_applications
  for select to authenticated
  using (contractor_id in (
    select id from public.contractors where user_id = auth.uid()
  ));

-- A homeowner reads the applications on jobs they posted.
drop policy if exists "applications homeowner read" on public.lead_applications;
create policy "applications homeowner read" on public.lead_applications
  for select to authenticated
  using (lead_id in (
    select cl.id from public.contractor_leads cl
    where public.owns_property(cl.property_id)
  ));
-- No insert/update policies: writes go through the SECURITY DEFINER functions
-- below, which also handle billing and authorization.

-- ---- Open jobs a pro can apply to (no contact, category-matched) -------------
create or replace function public.open_jobs_for_me()
returns table (
  id                uuid,
  category          text,
  timing            text,
  issue_description text,
  issue_severity    text,
  payout_amount     numeric,
  created_at        timestamptz,
  application_count bigint
) language sql security definer set search_path = public as $$
  select cl.id, cl.category, cl.timing, cl.issue_description,
         cl.issue_severity, cl.payout_amount, cl.created_at,
         (select count(*) from lead_applications la where la.lead_id = cl.id)
  from contractor_leads cl
  join contractors c on c.user_id = auth.uid()
  where cl.contractor_id is null
    and cl.status = 'new'
    and (c.categories is null or cl.category = any (c.categories))
    and not exists (
      select 1 from lead_applications la
      where la.lead_id = cl.id and la.contractor_id = c.id
    )
  order by cl.created_at desc;
$$;

-- ---- A pro's own applications (safe job fields; no contact) ------------------
create or replace function public.my_applications()
returns table (
  application_id    uuid,
  lead_id           uuid,
  status            text,
  fee_cents         bigint,
  applied_at        timestamptz,
  category          text,
  timing            text,
  issue_description text,
  issue_severity    text,
  payout_amount     numeric,
  lead_status       text
) language sql security definer set search_path = public as $$
  select la.id, la.lead_id, la.status, la.fee_cents, la.created_at,
         cl.category, cl.timing, cl.issue_description, cl.issue_severity,
         cl.payout_amount, cl.status
  from lead_applications la
  join contractors c on c.id = la.contractor_id and c.user_id = auth.uid()
  join contractor_leads cl on cl.id = la.lead_id
  order by la.created_at desc;
$$;

-- ---- Apply to a job: charge the per-category fee (cash first, then bonus) ----
-- Returns true if applied (or already applied), false if the balance is short.
create or replace function public.apply_to_lead(p_lead uuid, p_message text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid; v_wallet uuid; v_cats text[];
  v_lead_contractor uuid; v_status text; v_category text; v_price bigint;
  v_cash bigint; v_bonus bigint; v_from_cash bigint; v_from_bonus bigint;
  v_remaining bigint; v_grant record; v_cash_first boolean;
  v_cash_after bigint; v_bonus_after bigint;
begin
  select id, categories into v_contractor, v_cats
    from contractors where user_id = auth.uid();
  if v_contractor is null then raise exception 'Not a contractor'; end if;

  select contractor_id, status, category, round(payout_amount * 100)::bigint
    into v_lead_contractor, v_status, v_category, v_price
    from contractor_leads where id = p_lead;
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

  v_wallet := get_or_create_wallet(v_contractor);
  select cash_balance_cents, bonus_balance_cents into v_cash, v_bonus
    from wallets where id = v_wallet;
  if coalesce(v_cash, 0) + coalesce(v_bonus, 0) < v_price then
    return false;  -- insufficient: prompt a deposit
  end if;

  select spend_cash_first into v_cash_first from wallet_config where id = 1;
  if v_cash_first then
    v_from_cash := least(v_cash, v_price);
    v_from_bonus := v_price - v_from_cash;
  else
    v_from_bonus := least(v_bonus, v_price);
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

  insert into lead_applications (lead_id, contractor_id, message, status, fee_cents)
    values (p_lead, v_contractor, nullif(btrim(p_message), ''), 'applied', v_price);

  insert into wallet_transactions
    (wallet_id, type, cash_delta_cents, bonus_delta_cents,
     cash_balance_after_cents, bonus_balance_after_cents, lead_id, note)
    values (v_wallet, 'apply_fee', -v_from_cash, -v_from_bonus,
            v_cash_after, v_bonus_after, p_lead, 'Applied to job');

  return true;
end; $$;

-- ---- Homeowner chooses an applicant -----------------------------------------
-- Assigns + unlocks the chosen pro; declines the rest (no refund).
create or replace function public.choose_applicant(p_application uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_lead uuid; v_contractor uuid; v_owns boolean;
begin
  select lead_id, contractor_id into v_lead, v_contractor
    from lead_applications where id = p_application;
  if v_lead is null then raise exception 'Application not found'; end if;

  select public.owns_property(cl.property_id) into v_owns
    from contractor_leads cl where cl.id = v_lead;
  if not coalesce(v_owns, false) then raise exception 'Not your job'; end if;

  update contractor_leads
     set contractor_id = v_contractor, status = 'accepted',
         paid = true, paid_at = now()
   where id = v_lead;

  update lead_applications set status = 'chosen' where id = p_application;
  update lead_applications set status = 'declined'
   where lead_id = v_lead and id <> p_application and status = 'applied';
end; $$;
