-- =============================================================================
-- Hearth — learning requests. When a homeowner can't find an answer in Learn,
-- they ask for a guide and we capture it (to prioritize what to add next).
-- =============================================================================

create table if not exists public.learning_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  question   text not null,
  created_at timestamptz not null default now()
);

alter table public.learning_requests enable row level security;

drop policy if exists "learning_requests insert own" on public.learning_requests;
create policy "learning_requests insert own" on public.learning_requests
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "learning_requests read own" on public.learning_requests;
create policy "learning_requests read own" on public.learning_requests
  for select to authenticated using (user_id = auth.uid());
