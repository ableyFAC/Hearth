-- DIAGNOSE (2026-09-12): which migrations are actually on the live database?
-- READ-ONLY. Changes nothing. Paste the whole thing; one row per check.
--
-- Written after PASTE-ME-ALL-PENDING-2026-09-12-preview-wave.sql stopped at
-- 0165's precheck ("open_jobs_for_me() is not on 0161's body"). The two
-- files that should have carried 0154-0162 to live are
-- PASTE-ME-ALL-PENDING-2026-09-08-PART1.sql (0154, 0155-0161) and
-- FIX-DUPLICATE-HOMES-AND-LOCK-2026-09-08.sql (0162). This tells us where
-- live really stopped, and confirms the 09-12 wave rolled back cleanly.

select '0153 insurance gate (apply_to_lead)' as check_name,
       exists (select 1 from pg_proc where proname = 'apply_to_lead'
                 and pronamespace = 'public'::regnamespace
                 and prosrc ilike '%insurance%') as live
union all
select '0154 users.avatar_url',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'users'
                  and column_name = 'avatar_url')
union all
select '0155 contractors.banner_url',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'contractors'
                  and column_name = 'banner_url')
union all
select '0156 home_systems.other_label',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'home_systems'
                  and column_name = 'other_label')
union all
select '0157 pro_feedback.credited_cents',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'pro_feedback'
                  and column_name = 'credited_cents')
union all
select '0158 index pro_clients_contractor_created_idx',
       exists (select 1 from pg_indexes
                where schemaname = 'public'
                  and indexname = 'pro_clients_contractor_created_idx')
union all
select '0160 table native_push_tokens',
       exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name = 'native_push_tokens')
union all
select '0161 open_jobs_for_me owner exclusion',
       exists (select 1 from pg_proc where proname = 'open_jobs_for_me'
                 and pronamespace = 'public'::regnamespace
                 and prosrc like '%pr.user_id is distinct from auth.uid()%')
union all
select '0161 apply_to_lead self-apply guard',
       exists (select 1 from pg_proc where proname = 'apply_to_lead'
                 and pronamespace = 'public'::regnamespace
                 and prosrc like '%You cannot apply to your own job.%')
union all
select '0162 index properties_address_unique',
       exists (select 1 from pg_indexes
                where schemaname = 'public'
                  and indexname = 'properties_address_unique')
union all
select '0164 contractors.stripe_account_id (should be false: wave rolled back)',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'contractors'
                  and column_name = 'stripe_account_id')
union all
select '0165 users.is_internal (should be false)',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'users'
                  and column_name = 'is_internal');
