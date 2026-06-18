-- =============================================================================
-- Hearth — lead messaging (homeowner <-> contractor)
-- A thread is attached to a contractor_lead. Only the homeowner who owns the
-- lead's property and the contractor assigned to it can read/post.
-- =============================================================================

create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.contractor_leads (id) on delete cascade,
  sender_role  text not null,  -- homeowner, contractor
  sender_id    uuid references auth.users (id) on delete set null,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index messages_lead_idx on public.messages (lead_id, created_at);

alter table public.messages enable row level security;

-- Can the current user see this lead (either side of it)?
create or replace function public.can_access_lead(p_lead_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.contractor_leads l
    where l.id = p_lead_id
      and (
        public.owns_property(l.property_id)
        or l.contractor_id in (
          select id from public.contractors where user_id = auth.uid()
        )
      )
  );
$$;

create policy "messages select" on public.messages
  for select to authenticated
  using (public.can_access_lead(lead_id));

create policy "messages insert" on public.messages
  for insert to authenticated
  with check (public.can_access_lead(lead_id) and sender_id = auth.uid());
