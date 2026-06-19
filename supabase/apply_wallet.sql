-- =============================================================================
-- Hearth — apply the contractor prepaid wallet (migration 0008)
-- Run this once in the Supabase SQL Editor if the wallet errors with
--   "Could not find ... in the schema cache" (balance / wallet_transactions /
--   add_deposit / unlock_lead missing).
-- Safe to re-run: columns/tables use IF NOT EXISTS, the policy is dropped first.
-- =============================================================================

-- Prepaid balance on the contractor.
alter table public.contractors
  add column if not exists balance numeric(10,2) not null default 0;

-- Ledger of deposits and lead charges.
create table if not exists public.wallet_transactions (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors (id) on delete cascade,
  amount        numeric(10,2) not null,   -- + deposit, - lead charge
  kind          text not null,            -- deposit, lead_charge
  lead_id       uuid references public.contractor_leads (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists wallet_tx_contractor_idx
  on public.wallet_transactions (contractor_id, created_at desc);

alter table public.wallet_transactions enable row level security;

drop policy if exists "wallet tx owner select" on public.wallet_transactions;
create policy "wallet tx owner select" on public.wallet_transactions
  for select to authenticated
  using (contractor_id in (select id from public.contractors where user_id = auth.uid()));

-- Add funds (simulated — no real charge yet). UI enforces $5–$100; enforced here too.
create or replace function public.add_deposit(p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_cid uuid;
begin
  if p_amount < 5 or p_amount > 100 then
    raise exception 'Deposit must be between $5 and $100';
  end if;
  select id into v_cid from public.contractors where user_id = auth.uid();
  if v_cid is null then raise exception 'Not a contractor'; end if;
  update public.contractors set balance = balance + p_amount where id = v_cid;
  insert into public.wallet_transactions (contractor_id, amount, kind)
    values (v_cid, p_amount, 'deposit');
end;
$$;

-- Pay a lead's fee from the wallet to unlock contact + messaging.
create or replace function public.unlock_lead(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_cid uuid; v_fee numeric; v_balance numeric; v_paid boolean;
begin
  select id, balance into v_cid, v_balance
    from public.contractors where user_id = auth.uid();
  if v_cid is null then raise exception 'Not a contractor'; end if;

  select payout_amount, paid into v_fee, v_paid
    from public.contractor_leads
    where id = p_lead_id and contractor_id = v_cid;
  if v_fee is null then raise exception 'Lead not found'; end if;
  if v_paid then return; end if;
  if v_balance < v_fee then
    raise exception 'Insufficient balance — add funds first';
  end if;

  update public.contractors set balance = balance - v_fee where id = v_cid;
  update public.contractor_leads set paid = true, paid_at = now() where id = p_lead_id;
  insert into public.wallet_transactions (contractor_id, amount, kind, lead_id)
    values (v_cid, -v_fee, 'lead_charge', p_lead_id);
end;
$$;

grant execute on function public.add_deposit(numeric) to authenticated;
grant execute on function public.unlock_lead(uuid) to authenticated;
