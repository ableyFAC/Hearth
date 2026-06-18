-- =============================================================================
-- Hearth — public lead previews
-- Lets contractors see THAT demand exists (category, coarse area, severity, fee)
-- before creating an account, while homeowner PII stays locked behind signup.
--
-- This view intentionally exposes only non-PII columns and is readable by anon.
-- It runs with the view owner's rights, so it surfaces all "new" leads for the
-- teaser — but never name / email / phone / street address.
-- =============================================================================

create or replace view public.lead_previews as
select
  l.id,
  l.category,
  l.issue_severity                                          as severity,
  l.payout_amount                                           as lead_fee,
  nullif(trim(split_part(l.property_address, ',', 2)), '')  as area,
  l.created_at
from public.contractor_leads l
where l.status = 'new';

grant select on public.lead_previews to anon, authenticated;
