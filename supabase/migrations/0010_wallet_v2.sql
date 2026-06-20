-- =============================================================================
-- Hearth — dual-balance wallet (cash + bonus) with deposit-match tiers.
-- All money is integer CENTS. No floats anywhere.
-- Replaces the old single-balance wallet (contractors.balance + add_deposit /
-- unlock_lead). Those are dropped at the bottom.
-- =============================================================================

-- ---- Config (single row; tunable without a redeploy) ------------------------
create table if not exists public.wallet_config (
  id                      int primary key default 1,
  min_bonus_deposit_cents bigint  not null default 25000,  -- $250
  bonus_expiry_days       int     not null default 60,
  spend_cash_first        boolean not null default true,
  constraint wallet_config_single_row check (id = 1)
);
insert into public.wallet_config (id) values (1) on conflict (id) do nothing;

-- ---- Deposit match tiers ----------------------------------------------------
create table if not exists public.deposit_tiers (
  id        uuid primary key default gen_random_uuid(),
  min_cents bigint not null,
  max_cents bigint,            -- null = no upper bound
  bonus_pct int    not null
);
insert into public.deposit_tiers (min_cents, max_cents, bonus_pct)
select v.min_cents, v.max_cents, v.bonus_pct
from (values
  (25000,  49999::bigint, 10),
  (50000,  99999::bigint, 15),
  (100000, null::bigint,  20)
) as v(min_cents, max_cents, bonus_pct)
where not exists (select 1 from public.deposit_tiers);

-- ---- Wallets ----------------------------------------------------------------
create table if not exists public.wallets (
  id                  uuid primary key default gen_random_uuid(),
  contractor_id       uuid not null unique references public.contractors (id) on delete cascade,
  cash_balance_cents  bigint not null default 0,
  bonus_balance_cents bigint not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---- Bonus grants (per-tranche expiry, drawn FIFO) --------------------------
create table if not exists public.bonus_grants (
  id              uuid primary key default gen_random_uuid(),
  wallet_id       uuid not null references public.wallets (id) on delete cascade,
  amount_cents    bigint not null,
  remaining_cents bigint not null,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);
create index if not exists bonus_grants_wallet_idx
  on public.bonus_grants (wallet_id, expires_at);

-- ---- Ledger (append-only). Replace the old simple table. --------------------
drop table if exists public.wallet_transactions cascade;
create table public.wallet_transactions (
  id                        uuid primary key default gen_random_uuid(),
  wallet_id                 uuid not null references public.wallets (id) on delete cascade,
  type                      text not null,   -- deposit | bonus_grant | lead_charge | bonus_expiry | adjustment
  cash_delta_cents          bigint not null default 0,
  bonus_delta_cents         bigint not null default 0,
  cash_balance_after_cents  bigint not null,
  bonus_balance_after_cents bigint not null,
  lead_id                   uuid references public.contractor_leads (id) on delete set null,
  note                      text,
  created_at                timestamptz not null default now()
);
create index if not exists wallet_tx_wallet_idx
  on public.wallet_transactions (wallet_id, created_at desc);

-- ---- RLS: owners can read their own wallet data; config/tiers are public ----
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.bonus_grants enable row level security;
alter table public.wallet_config enable row level security;
alter table public.deposit_tiers enable row level security;

drop policy if exists "wallets owner read" on public.wallets;
create policy "wallets owner read" on public.wallets for select to authenticated
  using (contractor_id in (select id from public.contractors where user_id = auth.uid()));

drop policy if exists "wallet tx owner read" on public.wallet_transactions;
create policy "wallet tx owner read" on public.wallet_transactions for select to authenticated
  using (wallet_id in (
    select w.id from public.wallets w
    join public.contractors c on c.id = w.contractor_id
    where c.user_id = auth.uid()
  ));

drop policy if exists "bonus grants owner read" on public.bonus_grants;
create policy "bonus grants owner read" on public.bonus_grants for select to authenticated
  using (wallet_id in (
    select w.id from public.wallets w
    join public.contractors c on c.id = w.contractor_id
    where c.user_id = auth.uid()
  ));

drop policy if exists "wallet config read" on public.wallet_config;
create policy "wallet config read" on public.wallet_config for select to authenticated using (true);
drop policy if exists "deposit tiers read" on public.deposit_tiers;
create policy "deposit tiers read" on public.deposit_tiers for select to authenticated using (true);

-- ---- Functions --------------------------------------------------------------

create or replace function public.get_or_create_wallet(p_contractor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from wallets where contractor_id = p_contractor;
  if v_id is null then
    insert into wallets (contractor_id) values (p_contractor) returning id into v_id;
  end if;
  return v_id;
end; $$;

-- Bonus (cents) earned on a deposit, per the tier table.
create or replace function public.bonus_for_deposit(p_deposit_cents bigint)
returns bigint language sql stable set search_path = public as $$
  select coalesce((
    select (p_deposit_cents * bonus_pct) / 100
    from deposit_tiers
    where p_deposit_cents >= min_cents
      and (max_cents is null or p_deposit_cents <= max_cents)
    order by min_cents desc
    limit 1
  ), 0);
$$;

-- Apply a successful deposit: credit cash, grant bonus, create grant + ledger.
-- Called by the Stripe webhook (service role).
create or replace function public.apply_deposit(p_contractor uuid, p_deposit_cents bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_wallet uuid;
  v_bonus bigint;
  v_days int;
  v_cash_after bigint;
  v_bonus_after bigint;
begin
  v_wallet := get_or_create_wallet(p_contractor);
  v_bonus := bonus_for_deposit(p_deposit_cents);
  select bonus_expiry_days into v_days from wallet_config where id = 1;

  update wallets
     set cash_balance_cents = cash_balance_cents + p_deposit_cents, updated_at = now()
   where id = v_wallet
   returning cash_balance_cents, bonus_balance_cents into v_cash_after, v_bonus_after;
  insert into wallet_transactions
    (wallet_id, type, cash_delta_cents, cash_balance_after_cents, bonus_balance_after_cents, note)
    values (v_wallet, 'deposit', p_deposit_cents, v_cash_after, v_bonus_after, 'Deposit');

  if v_bonus > 0 then
    update wallets
       set bonus_balance_cents = bonus_balance_cents + v_bonus, updated_at = now()
     where id = v_wallet
     returning cash_balance_cents, bonus_balance_cents into v_cash_after, v_bonus_after;
    insert into bonus_grants (wallet_id, amount_cents, remaining_cents, expires_at)
      values (v_wallet, v_bonus, v_bonus, now() + (v_days || ' days')::interval);
    insert into wallet_transactions
      (wallet_id, type, bonus_delta_cents, cash_balance_after_cents, bonus_balance_after_cents, note)
      values (v_wallet, 'bonus_grant', v_bonus, v_cash_after, v_bonus_after, 'Deposit bonus');
  end if;
end; $$;

-- Charge a lead to the caller's wallet (cash first, then bonus FIFO).
-- Returns true if charged/already paid, false if balance is insufficient.
-- Derives the contractor from auth.uid() and the price from the lead, so a
-- caller can't charge someone else or fake a price.
create or replace function public.charge_lead(p_lead uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid; v_wallet uuid;
  v_price bigint; v_paid boolean;
  v_cash bigint; v_bonus bigint;
  v_from_cash bigint; v_from_bonus bigint;
  v_remaining bigint; v_grant record;
  v_cash_first boolean;
  v_cash_after bigint; v_bonus_after bigint;
begin
  select id into v_contractor from contractors where user_id = auth.uid();
  if v_contractor is null then raise exception 'Not a contractor'; end if;

  select round(payout_amount * 100)::bigint, paid into v_price, v_paid
    from contractor_leads where id = p_lead and contractor_id = v_contractor;
  if v_price is null then raise exception 'Lead not found'; end if;
  if v_paid then return true; end if;

  v_wallet := get_or_create_wallet(v_contractor);
  select cash_balance_cents, bonus_balance_cents into v_cash, v_bonus
    from wallets where id = v_wallet;
  if coalesce(v_cash,0) + coalesce(v_bonus,0) < v_price then
    return false;  -- insufficient: caller should prompt a deposit
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
        update bonus_grants set remaining_cents = remaining_cents - v_remaining where id = v_grant.id;
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

  update contractor_leads set paid = true, paid_at = now() where id = p_lead;

  insert into wallet_transactions
    (wallet_id, type, cash_delta_cents, bonus_delta_cents,
     cash_balance_after_cents, bonus_balance_after_cents, lead_id, note)
    values (v_wallet, 'lead_charge', -v_from_cash, -v_from_bonus,
            v_cash_after, v_bonus_after, p_lead, 'Lead unlocked');

  return true;
end; $$;

-- Daily job: expire bonus tranches past their date.
create or replace function public.expire_bonus()
returns void language plpgsql security definer set search_path = public as $$
declare v_grant record; v_cash_after bigint; v_bonus_after bigint;
begin
  for v_grant in
    select * from bonus_grants where expires_at < now() and remaining_cents > 0
  loop
    update wallets
       set bonus_balance_cents = bonus_balance_cents - v_grant.remaining_cents, updated_at = now()
     where id = v_grant.wallet_id
     returning cash_balance_cents, bonus_balance_cents into v_cash_after, v_bonus_after;
    insert into wallet_transactions
      (wallet_id, type, bonus_delta_cents, cash_balance_after_cents, bonus_balance_after_cents, note)
      values (v_grant.wallet_id, 'bonus_expiry', -v_grant.remaining_cents,
              v_cash_after, v_bonus_after, 'Bonus expired');
    update bonus_grants set remaining_cents = 0 where id = v_grant.id;
  end loop;
end; $$;

-- Note: CREATE FUNCTION already grants EXECUTE to PUBLIC (incl. authenticated),
-- so no explicit grants are needed. apply_deposit / expire_bonus are called by
-- the service role (webhook / scheduled job).

-- ---- Retire the old single-balance wallet -----------------------------------
drop function if exists public.add_deposit(numeric);
drop function if exists public.unlock_lead(uuid);
-- (contractors.balance is left in place but unused; safe to drop later.)
