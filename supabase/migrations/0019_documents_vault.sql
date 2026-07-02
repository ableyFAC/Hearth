-- =============================================================================
-- Hearth - documents vault (auto-fill columns)
-- The vault stores a homeowner's warranties, manuals, receipts, and data-plate
-- photos, then Ask Hearth's vision model reads each one and extracts the
-- structured facts below so they can flow into the digital twin. Adding the
-- columns idempotently keeps existing rows intact.
-- =============================================================================

alter table public.documents add column if not exists title           text;
alter table public.documents add column if not exists brand           text;
alter table public.documents add column if not exists model           text;
alter table public.documents add column if not exists install_year    integer;
alter table public.documents add column if not exists warranty_expires date;
alter table public.documents add column if not exists system_type     text;
alter table public.documents add column if not exists summary         text;
-- Marks whether the extracted facts have been pushed into home_systems yet, so
-- the vault can show an "Added to your home" state and avoid double-applying.
alter table public.documents add column if not exists applied_at      timestamptz;
