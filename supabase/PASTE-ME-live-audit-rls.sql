-- PASTE-ME (2026-08-20, second pass): audit RLS across public and hard-reset
-- the policy set on public.properties.
--
-- Why a second pass: after PASTE-ME-live-fix-properties-grants.sql ran, a
-- brand-new authenticated user with zero homes could still SELECT every row of
-- properties. The five canonical policies were re-created, so the remaining
-- explanation is an EXTRA permissive policy (for example the dashboard
-- template "Enable read access for all users", which is `using (true)`), or
-- RLS being switched off again. This file reports, then removes anything on
-- properties that is not one of the five policies defined in migrations 0002
-- and 0051.
--
-- Run the whole file. Copy the output of sections 1a-1d back to Claude.
-- Idempotent.

-- ---- 1a. Tables in public with RLS off ---------------------------------------
select c.relname as table_without_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
 order by 1;

-- ---- 1b. Policies that are wide open (qual true) or granted to anon/public -----
select tablename, policyname, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and (
     qual = 'true' or with_check = 'true'
     or roles::text like '%anon%' or roles::text = '{public}'
   )
 order by tablename, policyname;

-- ---- 1c. Every policy currently on properties ---------------------------------
select policyname, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'properties'
 order by policyname;

-- ---- 1d. Table grants to anon anywhere in public ------------------------------
select table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee = 'anon'
 order by 1, 2;

-- ---- 2. Hard-reset the policy set on properties -------------------------------
alter table public.properties enable row level security;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'properties'
       and policyname not in (
         'properties owner select', 'properties owner insert',
         'properties owner update', 'properties owner delete',
         'properties member select')
  loop
    execute format('drop policy %I on public.properties', p.policyname);
    raise notice 'dropped stray policy on properties: %', p.policyname;
  end loop;
end $$;

drop policy if exists "properties owner select" on public.properties;
create policy "properties owner select" on public.properties
  for select using (user_id = auth.uid());
drop policy if exists "properties owner insert" on public.properties;
create policy "properties owner insert" on public.properties
  for insert with check (user_id = auth.uid());
drop policy if exists "properties owner update" on public.properties;
create policy "properties owner update" on public.properties
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "properties owner delete" on public.properties;
create policy "properties owner delete" on public.properties
  for delete using (user_id = auth.uid());
drop policy if exists "properties member select" on public.properties;
create policy "properties member select" on public.properties
  for select using (public.is_active_member(id));

revoke all on public.properties from public;
revoke all on public.properties from anon;
grant select, insert, update, delete on public.properties to authenticated;
grant all on public.properties to service_role;

-- ---- 3. Result ------------------------------------------------------------------
select policyname, roles, cmd, qual
  from pg_policies
 where schemaname = 'public' and tablename = 'properties'
 order by policyname;
