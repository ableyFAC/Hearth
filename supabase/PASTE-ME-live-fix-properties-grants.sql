-- PASTE-ME (2026-08-20): restore the permission posture on public.properties.
--
-- Symptoms seen live:
--   * authenticated users get "permission denied for table properties"
--     (the app throws "Could not load your homes: ..." on every page), and
--   * the anon key can SELECT every row of properties, addresses included,
--     which means row level security is not being enforced on the table.
-- No migration or PASTE-ME file ever touched grants/RLS on properties, so this
-- drifted in the dashboard. This file puts back exactly what 0002 intended:
-- RLS on, owner/member policies in force, authenticated has the table
-- privileges, anon and public have none.
--
-- Idempotent. Safe to run twice. Run the whole thing in the SQL editor.

-- 1. Show what we are starting from (read-only, for the record).
select relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
  from pg_class where oid = 'public.properties'::regclass;
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'properties'
 order by grantee, privilege_type;
select policyname, roles, cmd
  from pg_policies where schemaname = 'public' and tablename = 'properties'
 order by policyname;

-- 2. Fix.
alter table public.properties enable row level security;

revoke all on public.properties from public;
revoke all on public.properties from anon;
grant select, insert, update, delete on public.properties to authenticated;
grant all on public.properties to service_role;

-- Re-assert the policies from 0002 / 0051 in case one was dropped.
drop policy if exists "properties owner select" on public.properties;
create policy "properties owner select" on public.properties
  for select using (auth.uid() = user_id);
drop policy if exists "properties owner insert" on public.properties;
create policy "properties owner insert" on public.properties
  for insert with check (auth.uid() = user_id);
drop policy if exists "properties owner update" on public.properties;
create policy "properties owner update" on public.properties
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "properties owner delete" on public.properties;
create policy "properties owner delete" on public.properties
  for delete using (auth.uid() = user_id);
drop policy if exists "properties member select" on public.properties;
create policy "properties member select" on public.properties
  for select using (public.is_active_member(id));

-- 3. Show the result.
select relrowsecurity as rls_enabled
  from pg_class where oid = 'public.properties'::regclass;
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'properties'
 order by grantee, privilege_type;
