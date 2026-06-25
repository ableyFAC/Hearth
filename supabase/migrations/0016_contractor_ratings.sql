-- =============================================================================
-- Hearth — keep a contractor's rating in sync with their reviews.
--
-- Homeowners leave reviews (0009 reviews table), but contractors.rating was
-- static (seeded demo values). This adds a review_count column and a trigger
-- that recomputes rating (average, 1 decimal) + review_count whenever a review
-- is inserted / updated / deleted. The UI shows the rating only when
-- review_count > 0, so seeded values are never displayed as if they were real.
-- =============================================================================

alter table public.contractors
  add column if not exists review_count int not null default 0;

-- Recompute one contractor's aggregate from the reviews table. SECURITY DEFINER
-- because the homeowner writing the review doesn't own the contractor row.
create or replace function public.recompute_contractor_rating(p_contractor uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.contractors c
     set rating       = sub.avg_rating,
         review_count = sub.cnt
    from (
      select round(avg(rating)::numeric, 1) as avg_rating,
             count(*)                        as cnt
      from public.reviews
      where contractor_id = p_contractor
    ) sub
   where c.id = p_contractor;
$$;

-- Fire on any change to a review; refresh the affected contractor(s).
create or replace function public.reviews_sync_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recompute_contractor_rating(old.contractor_id);
    return old;
  end if;
  perform public.recompute_contractor_rating(new.contractor_id);
  -- An update that re-points the review to a different contractor refreshes both.
  if (tg_op = 'UPDATE' and new.contractor_id is distinct from old.contractor_id) then
    perform public.recompute_contractor_rating(old.contractor_id);
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_sync_rating on public.reviews;
create trigger reviews_sync_rating
  after insert or update or delete on public.reviews
  for each row execute function public.reviews_sync_rating();

-- Backfill from any reviews that already exist. Contractors with no reviews keep
-- review_count = 0 (their seeded rating simply won't be shown by the UI).
update public.contractors c
   set rating       = sub.avg_rating,
       review_count = sub.cnt
  from (
    select contractor_id,
           round(avg(rating)::numeric, 1) as avg_rating,
           count(*)                        as cnt
    from public.reviews
    group by contractor_id
  ) sub
 where c.id = sub.contractor_id;
