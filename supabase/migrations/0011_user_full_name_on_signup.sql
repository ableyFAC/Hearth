-- =============================================================================
-- Hearth — carry the user's name from sign-up into their profile row.
--
-- handle_new_user() previously copied only id/email/phone, so full_name stayed
-- null until the user edited their account — which left the toolbar showing
-- their email. Sign-up now collects a name and passes it in the auth metadata
-- (raw_user_meta_data.full_name); copy it through on account creation.
--
-- Idempotent (create or replace); safe to re-run.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, phone, full_name)
  values (
    new.id,
    new.email,
    new.phone,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
