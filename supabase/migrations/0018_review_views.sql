-- =============================================================================
-- Hearth — let homeowners read a contractor's reviews when choosing a pro.
--
-- The reviews RLS only lets a homeowner read reviews on their OWN leads, so they
-- couldn't read an applicant's track record. This adds contractor_reviews(), a
-- SECURITY DEFINER function that returns only the safe, public columns (rating,
-- comment, date) for a contractor — never the lead/property that links a review
-- back to a specific homeowner.
-- =============================================================================

create or replace function public.contractor_reviews(p_contractor uuid)
returns table (
  rating     smallint,
  comment    text,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select rating, comment, created_at
  from public.reviews
  where contractor_id = p_contractor
  order by created_at desc
  limit 100;
$$;
