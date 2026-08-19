-- =============================================================================
-- Hearth - major-tier project scope fields (0114)
-- RUN THIS AGAINST THE LIVE DATABASE (Supabase SQL editor); editing repo SQL
-- alone does NOT change the already-deployed database.
--
-- WHY: a major-tier job (roof, structural, remodeling - LEAD_TIER_FEES.major
-- in src/lib/constants.ts, isMajorCategory()) is big-ticket enough that a
-- one-line description and an optional budget aren't enough for a pro to bid
-- seriously. This adds three optional fields a homeowner can fill in only when
-- posting a major-tier job: square footage, a short material-notes line, and
-- whether plans/permits are already in hand. Posting a job also now REQUIRES a
-- real budget_range (0047) for major-tier categories - no more silent "Prefer
-- not to say" default at that price point - enforced both client-side
-- (src/app/(app)/contractors/BudgetField.tsx) and, authoritatively, in
-- postJobAction (src/app/(app)/contractors/actions.ts).
--
-- WHAT CHANGES:
--   1. contractor_leads gains three nullable columns: square_footage
--      (integer), material_notes (text), has_plans_permits (boolean). Nullable
--      so every existing row, and every non-major job going forward, is
--      untouched - postJobAction only ever writes these for a major-tier
--      category. CHECK constraints back up the app-side clamp/cap
--      (postJobAction clamps square_footage to 1-20000 and caps
--      material_notes at 300 chars before it ever reaches the DB) so a
--      client hitting PostgREST directly can't store nonsense either.
--   2. open_jobs_for_me() and my_direct_requests() each gain the three new
--      columns in their return set, byte-for-byte identical bodies to 0104's
--      definitions otherwise (0104 is still the newest definition of both on
--      disk), so the pro board and the "Asked for you" cards can show them.
--      Both return sets grow, so both are dropped + recreated rather than
--      CREATE OR REPLACE (0104's own convention: Postgres refuses to widen a
--      RETURNS TABLE list via CREATE OR REPLACE).
--
-- GRACEFUL DEGRADATION: src/app/pro/page.tsx reads these three columns
-- straight off the RPC results (undefined until this migration runs, which
-- the UI already treats as "not provided"), and its one direct-table select
-- (the pro's own assigned jobs) cascades to a column list without them on a
-- missing-schema error, same isMissingSchemaError pattern as quote-check's
-- free_quote_used_at read. postJobAction's insert cascades the same way for
-- writes. Nothing here can break posting or the board on a DB this hasn't
-- reached yet.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, guarded DO blocks for the CHECK
-- constraints (0093's convention), DROP FUNCTION IF EXISTS + CREATE for both
-- functions. Safe to re-run.
-- =============================================================================

-- ---- 1. New columns ----------------------------------------------------------
alter table public.contractor_leads
  add column if not exists square_footage integer;
alter table public.contractor_leads
  add column if not exists material_notes text;
alter table public.contractor_leads
  add column if not exists has_plans_permits boolean;

comment on column public.contractor_leads.square_footage is
  'Optional homeowner-entered square footage for a major-tier job (roof, '
  'structural, remodeling - see isMajorCategory() in src/lib/constants.ts). '
  'Null for every non-major job and for major jobs the homeowner left blank. '
  'App clamps to 1-20000 before writing; the CHECK below is the backstop.';
comment on column public.contractor_leads.material_notes is
  'Optional short free-text material note for a major-tier job (e.g. '
  '"asphalt shingle, quartz counters"). Null for every non-major job. App '
  'caps at 300 characters before writing; the CHECK below is the backstop.';
comment on column public.contractor_leads.has_plans_permits is
  'Whether the homeowner says plans/permits are already in hand, for a '
  'major-tier job only. Null (not just false) for every non-major job, since '
  'the question was never asked there - false means "asked, and no".';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contractor_leads_square_footage_range'
      and conrelid = 'public.contractor_leads'::regclass
  ) then
    alter table public.contractor_leads
      add constraint contractor_leads_square_footage_range
      check (square_footage is null or square_footage between 1 and 20000);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contractor_leads_material_notes_length'
      and conrelid = 'public.contractor_leads'::regclass
  ) then
    alter table public.contractor_leads
      add constraint contractor_leads_material_notes_length
      check (material_notes is null or char_length(material_notes) <= 300);
  end if;
end $$;

-- ---- 2. open_jobs_for_me: 0104's body + the three scope columns -------------
drop function if exists public.open_jobs_for_me();
create function public.open_jobs_for_me()
returns table (
  id                 uuid,
  category           text,
  timing             text,
  issue_description  text,
  issue_severity     text,
  payout_amount      numeric,
  created_at         timestamptz,
  application_count  bigint,
  has_photos         boolean,
  plus_poster        boolean,
  budget_range       text,
  city               text,
  ownership_verified boolean,
  photo_urls         text[],
  square_footage     integer,
  material_notes     text,
  has_plans_permits  boolean
) language sql security definer set search_path = public as $$
  select cl.id, cl.category, cl.timing, cl.issue_description,
         cl.issue_severity, cl.payout_amount, cl.created_at,
         (select count(*) from lead_applications la
           where la.lead_id = cl.id and la.refunded_at is null),
         (cl.issue_id is not null and exists (
           select 1 from photos p
           where p.related_type = 'issue' and p.related_id = cl.issue_id)),
         exists (
           select 1
           from subscriptions s
           where s.user_id = pr.user_id
             and (s.side = 'homeowner'
                  or s.plan is null
                  or s.plan not like 'pro\_%' escape '\')
             and s.status in ('active', 'trialing')
             and (s.current_period_end is null or s.current_period_end > now())
         ) as plus_poster,
         cl.budget_range,
         pr.city,
         coalesce(pr.ownership_status = 'verified', false) as ownership_verified,
         (select array_agg(p.url order by p.uploaded_at)
            from photos p
           where p.related_type = 'issue'
             and p.related_id = cl.issue_id) as photo_urls,
         cl.square_footage,
         cl.material_notes,
         cl.has_plans_permits
  from contractor_leads cl
  join contractors c on c.user_id = auth.uid()
  left join properties pr on pr.id = cl.property_id
  where cl.contractor_id is null
    and cl.status = 'new'
    and cl.direct_to is null
    and (c.categories is null or cl.category = any (c.categories))
    and (c.service_state is null
         or pr.state is null
         or upper(btrim(pr.state)) = upper(btrim(c.service_state)))
    and c.serves_orange_county = true
    and not exists (
      select 1 from lead_applications la
      where la.lead_id = cl.id and la.contractor_id = c.id
    )
  order by plus_poster desc, cl.created_at desc
  limit 200;
$$;

-- ---- 3. my_direct_requests: 0104's body + the three scope columns -----------
-- Return set grows (three new columns), so drop + recreate rather than
-- CREATE OR REPLACE - same house convention 0104 itself used for
-- open_jobs_for_me when ITS return set grew, since Postgres refuses to widen
-- a RETURNS TABLE list via CREATE OR REPLACE.
drop function if exists public.my_direct_requests();
create function public.my_direct_requests()
returns table (
  id                uuid,
  category          text,
  timing            text,
  issue_description text,
  issue_severity    text,
  payout_amount     numeric,
  fee_cents         bigint,
  budget_range      text,
  city              text,
  has_photos        boolean,
  photo_urls        text[],
  created_at        timestamptz,
  square_footage    integer,
  material_notes    text,
  has_plans_permits boolean
) language sql security definer set search_path = public as $$
  select cl.id, cl.category, cl.timing, cl.issue_description,
         cl.issue_severity, cl.payout_amount,
         public.lead_fee_cents(cl.payout_amount, cl.created_at) as fee_cents,
         cl.budget_range,
         pr.city,
         (cl.issue_id is not null and exists (
           select 1 from photos p
           where p.related_type = 'issue' and p.related_id = cl.issue_id)) as has_photos,
         (select array_agg(p.url order by p.uploaded_at)
            from photos p
           where p.related_type = 'issue'
             and p.related_id = cl.issue_id) as photo_urls,
         cl.created_at,
         cl.square_footage,
         cl.material_notes,
         cl.has_plans_permits
  from contractor_leads cl
  join contractors c on c.user_id = auth.uid()
  left join properties pr on pr.id = cl.property_id
  where cl.direct_to = c.id
    and cl.contractor_id is null
    and cl.status = 'new'
    and cl.direct_declined_at is null
  order by cl.created_at desc
  limit 200;
$$;
