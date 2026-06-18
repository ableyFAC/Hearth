-- =============================================================================
-- Hearth — Row-Level Security
-- Default-deny. An owner can touch only rows belonging to a property they own.
-- Reference data (contractors, system_lifespans) is read-only to any signed-in
-- user. Writes to those tables happen via service-role/admin only.
-- =============================================================================

-- Helper: does the current user own this property?
create or replace function public.owns_property(p_property_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.properties p
    where p.id = p_property_id and p.user_id = auth.uid()
  );
$$;

-- Enable RLS everywhere.
alter table public.users             enable row level security;
alter table public.properties        enable row level security;
alter table public.home_systems      enable row level security;
alter table public.maintenance_tasks enable row level security;
alter table public.issues            enable row level security;
alter table public.photos            enable row level security;
alter table public.improvements      enable row level security;
alter table public.contractor_leads  enable row level security;
alter table public.intent_signals    enable row level security;
alter table public.documents         enable row level security;
alter table public.contractors       enable row level security;
alter table public.system_lifespans  enable row level security;

-- ---- users: self only -------------------------------------------------------
create policy "users self select" on public.users
  for select using (id = auth.uid());
create policy "users self update" on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---- properties: owner only -------------------------------------------------
create policy "properties owner select" on public.properties
  for select using (user_id = auth.uid());
create policy "properties owner insert" on public.properties
  for insert with check (user_id = auth.uid());
create policy "properties owner update" on public.properties
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "properties owner delete" on public.properties
  for delete using (user_id = auth.uid());

-- ---- child tables: gated through property ownership --------------------------
-- A single all-command policy per table keeps this readable; owns_property()
-- enforces select/insert/update/delete uniformly.
create policy "home_systems owner all" on public.home_systems
  for all using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

create policy "maintenance_tasks owner all" on public.maintenance_tasks
  for all using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

create policy "issues owner all" on public.issues
  for all using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

create policy "photos owner all" on public.photos
  for all using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

create policy "improvements owner all" on public.improvements
  for all using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

create policy "contractor_leads owner all" on public.contractor_leads
  for all using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

create policy "intent_signals owner all" on public.intent_signals
  for all using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

create policy "documents owner all" on public.documents
  for all using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

-- ---- reference data: read-only to any authenticated user --------------------
create policy "contractors read" on public.contractors
  for select to authenticated using (true);

create policy "system_lifespans read" on public.system_lifespans
  for select to authenticated using (true);
