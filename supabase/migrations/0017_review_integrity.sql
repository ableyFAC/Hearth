-- =============================================================================
-- Hearth — review integrity. Only the real homeowner can review the actual pro
-- who did their job, exactly once.
--
-- Before this, the insert trusted lead_id + contractor_id from the client and
-- only checked can_access_lead(), so:
--   * a homeowner could attribute a review to ANY contractor_id (sabotage a
--     competitor) on a lead they own;
--   * an assigned contractor could self-review;
--   * anyone could leave unlimited reviews on one job (rating manipulation).
--
-- Now reviews go through leave_review(), a SECURITY DEFINER function that derives
-- the contractor from the lead, verifies the caller owns the job's property, and
-- enforces one review per job. Direct inserts are no longer allowed by RLS.
-- =============================================================================

-- One review per job. Drop any pre-existing duplicates first (keep one).
delete from public.reviews a
  using public.reviews b
 where a.lead_id = b.lead_id
   and a.ctid < b.ctid;
create unique index if not exists reviews_lead_unique
  on public.reviews (lead_id);

-- The only sanctioned way to leave a review. Everything is derived/verified
-- server-side; nothing about who is reviewed is taken from the caller.
create or replace function public.leave_review(
  p_lead uuid, p_rating smallint, p_comment text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid;
  v_property   uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  select contractor_id, property_id
    into v_contractor, v_property
    from contractor_leads
   where id = p_lead;

  if v_property is null then
    raise exception 'Job not found';
  end if;
  -- Only the homeowner who owns the job's property can review it.
  if not public.owns_property(v_property) then
    raise exception 'You can only review your own job';
  end if;
  -- And only once a pro was actually assigned to that job.
  if v_contractor is null then
    raise exception 'No pro was assigned to this job';
  end if;

  insert into public.reviews (lead_id, contractor_id, property_id, rating, comment)
    values (p_lead, v_contractor, v_property, p_rating, nullif(btrim(p_comment), ''))
  on conflict (lead_id) do update
    set rating     = excluded.rating,
        comment    = excluded.comment,
        created_at = now();
end;
$$;

-- Block direct inserts — the function above is the only path in.
drop policy if exists "reviews insert" on public.reviews;
