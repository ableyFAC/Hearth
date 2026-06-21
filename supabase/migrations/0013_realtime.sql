-- =============================================================================
-- Hearth — enable Supabase Realtime on the tables the UI subscribes to.
--
-- Realtime only pushes changes for tables that are in the `supabase_realtime`
-- publication. `messages` is usually already there (the chat uses it), but we
-- add it idempotently alongside the leads + applications tables so the contractor
-- Leads board and the unread-message badge update instantly instead of waiting
-- on their poll fallbacks.
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'contractor_leads',
    'lead_applications',
    'messages'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Full row image on update/delete so realtime filters (e.g. contractor_id) match
-- reliably even when the changed columns aren't the filtered ones.
alter table public.contractor_leads replica identity full;
alter table public.lead_applications replica identity full;
