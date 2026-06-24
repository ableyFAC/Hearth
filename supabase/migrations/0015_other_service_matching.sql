-- =============================================================================
-- Hearth — match jobs to a pro's custom (free-text) services by keyword.
--
-- Canonical-category jobs already match on exact equality (cl.category =
-- any(c.categories)). On top of that, this rewrites open_jobs_for_me() so ANY
-- open job also surfaces to a pro whose custom (free-text) service appears in the
-- job description or fuzzy-matches it (trigram word similarity, e.g. "gutter
-- cleaning" ~ "I need my gutters cleaned"). It runs regardless of the job's
-- category, because homeowners bucket jobs imperfectly — a gutter job might be
-- filed under Roof, Cleaning, or Other — so a niche pro should still find it.
-- The trigram threshold keeps it specific, so feeds aren't flooded.
--
-- pg_trgm provides word_similarity(); it lives in the `extensions` schema on
-- Supabase, so the function's search_path includes it.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

create or replace function public.open_jobs_for_me()
returns table (
  id                uuid,
  category          text,
  timing            text,
  issue_description text,
  issue_severity    text,
  payout_amount     numeric,
  created_at        timestamptz,
  application_count bigint
) language sql security definer set search_path = public, extensions as $$
  select cl.id, cl.category, cl.timing, cl.issue_description,
         cl.issue_severity, cl.payout_amount, cl.created_at,
         (select count(*) from lead_applications la where la.lead_id = cl.id)
  from contractor_leads cl
  join contractors c on c.user_id = auth.uid()
  where cl.contractor_id is null
    and cl.status = 'new'
    and (
      c.categories is null
      -- canonical match (roof = any(...))
      or cl.category = any (c.categories)
      -- keyword match: the description against the pro's custom services
      -- (any category — homeowners bucket jobs imperfectly)
      or (
        cl.issue_description is not null
        and exists (
          select 1
          from unnest(c.categories) as svc
          where
            -- only custom services (not one of the canonical categories)
            svc <> all (array[
              'roof','plumbing','electrical','hvac','structural',
              'remodeling','landscaping','cleaning','windows','painting','other'
            ])
            and length(btrim(svc)) >= 3
            and (
              -- the service phrase appears in the homeowner's description …
              cl.issue_description ilike '%' || svc || '%'
              -- … or it's a close fuzzy match (handles plurals / word forms)
              or word_similarity(lower(svc), lower(cl.issue_description)) > 0.4
            )
        )
      )
    )
    and not exists (
      select 1 from lead_applications la
      where la.lead_id = cl.id and la.contractor_id = c.id
    )
  order by cl.created_at desc;
$$;
