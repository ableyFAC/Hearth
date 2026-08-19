-- ============================================================================
-- HEARTH LIVE-DB BUNDLE: migration 0125 (2026-08-19)
-- Paste this WHOLE file into the Supabase SQL editor and run it ONCE.
-- Safe to re-run: every section is idempotent.
-- Live DB should be at 0124 before this. After running, live is at 0125.
--
-- ORDER MATTERS INSIDE THE FILE: the duplicate-claim cleanup runs BEFORE the
-- unique index is created, because the index cannot be built while duplicate
-- verified claims still exist. Do not paste sections out of order.
--
-- THIS ONE CHANGES DATA, not just schema: any license number that is currently
-- 'verified' on more than one contractors row keeps its badge only on the
-- earliest-verified row; the later claimants drop to 'unverified'. Read the
-- cleanup's comment below before running - it explains who is demoted, why
-- earliest wins, and the dispute path they get.
-- ============================================================================

-- >>>>>>>>>> BEGIN 0125_license_identity_lock.sql >>>>>>>>>>

-- =============================================================================
-- Hearth - one license, one account (0125)
-- RUN THIS AGAINST THE LIVE DATABASE (Supabase SQL editor); editing repo SQL
-- alone does NOT change the already-deployed database.
--
-- WHY: 0055 shipped real CSLB verification, but the only question it asked was
-- "is this license number current and active" (src/lib/cslb.ts). It never
-- asked whose license it is. So a pro could paste a stranger's valid CSLB
-- number into their profile and collect a real, dated "License verified" badge
-- on somebody else's credential - and nothing stopped ten accounts from doing
-- it with the same number. That badge is the single strongest trust signal a
-- homeowner sees on /p/<id>, which makes it exactly the thing worth forging.
--
-- The fix has two halves, and this migration is the hard one:
--   1. Name linkage, app-side (src/lib/licenseMatch.ts): the CSLB-registered
--      business name must line up with a name Hearth knows for the account.
--      Deliberately lenient, because CSLB stores sole proprietors surname-first
--      ("DOE JOHN"), packs dba lines into the same field, and disagrees about
--      INC/LLC constantly - a false rejection locks out a real pro.
--   2. THIS FILE: a partial unique index so a given license number can be
--      'verified' on at most ONE contractors row, ever. Leniency upstream is
--      affordable precisely because of this: even if a bad actor's name is
--      close enough to slip past the matcher, they cannot ride along on a
--      license a real pro already verified.
--
-- WHAT CHANGES:
--   1. A guarded cleanup that demotes pre-existing duplicate verified claims
--      (the index cannot be created while they exist).
--   2. The partial unique index itself, on the license number's DIGITS.
--
-- DIGITS, NOT THE RAW STRING: CSLB license numbers are numeric, but pros type
-- "270663", "270-663" and "LIC# 270663" for the same license. Indexing the raw
-- text would let the same license be verified three times over just by
-- retyping it. The expression here is mirrored byte for byte by
-- licenseDigits() in src/lib/licenseMatch.ts, so the app-side duplicate
-- pre-check and this index always agree on what "the same license" means.
--
-- PARTIAL, ON 'verified' ONLY: an unverified or failed row is just a number
-- somebody typed. Two pros can both CLAIM a number (one of them is wrong, or
-- lying, and the CSLB check will sort it out); only one can hold the verified
-- badge for it. Constraining unverified rows too would block a real pro from
-- even entering their own number after an impostor typed it first.
--
-- Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS, and a cleanup that by
-- construction only touches rows that are duplicates at the moment it runs
-- (after the first pass there are none). Safe to re-run.
-- =============================================================================

-- ---- 1. Demote pre-existing duplicate verified claims -------------------------
-- FIRST VERIFIED CLAIM WINS, until a human rules otherwise. Where the same
-- license digits are verified on more than one row, the row with the EARLIEST
-- license_verified_at keeps the badge (ties broken by the earlier created_at,
-- then by id so the choice is deterministic on a re-run); every later claimant
-- is set back to 'unverified' with its timestamp cleared.
--
-- WHY EARLIEST WINS: it is the only ordering that is not a guess. Hearth
-- cannot tell from these rows which account is the license's real owner - both
-- passed the same CSLB status check - so the tiebreak is deliberately
-- mechanical and reversible rather than a judgment this migration is not
-- qualified to make. Whoever is demoted is NOT accused of anything: they keep
-- their account, their profile, and their ability to work, they simply lose
-- the badge until a person looks. failure_reason tells the app to show them
-- the dispute form (a demoted pro clicks "Verify now" again, gets a clean
-- 'failed' + 'duplicate_license', and can file from there); disputes land in
-- support_messages (0024) via licenseDisputeAction and a human decides. If the
-- demoted pro is the rightful holder, support clears the other row and they
-- reverify.
--
-- 'unverified', not 'failed': nothing about their license was actually checked
-- and found wanting here. The badge is withdrawn pending review, which is what
-- 'unverified' means (0037).
--
-- The detail column is MERGED into, never replaced: whatever CSLB fields 0055
-- wrote for their last check stay exactly as they are, so the pro (and
-- support) can still see what was found. coalesce covers a row that somehow
-- has no detail yet.
with ranked as (
  select
    id,
    row_number() over (
      partition by regexp_replace(license_number, '\D', '', 'g')
      order by license_verified_at asc nulls last, created_at asc, id asc
    ) as claim_rank
  from public.contractors
  where license_verified_status = 'verified'
    and license_number is not null
    and regexp_replace(license_number, '\D', '', 'g') <> ''
)
update public.contractors c
   set license_verified_status = 'unverified',
       license_verified_at     = null,
       license_verify_detail   =
         coalesce(c.license_verify_detail, '{}'::jsonb)
         || jsonb_build_object('failure_reason', 'duplicate_license_demoted_0125')
  from ranked r
 where c.id = r.id
   and r.claim_rank > 1;

-- ---- 2. The lock ---------------------------------------------------------------
-- The guarantee the app-side pre-check in src/app/pro/actions.ts
-- (verifiedElsewhere) cannot make on its own: that check is a read, so two
-- accounts submitting the same number in the same moment can both pass it.
-- This index settles that race in the database, and the 23505 handler at the
-- write converts the loser into the ordinary "failed, duplicate_license"
-- outcome instead of an unhandled error.
--
-- Note the WHERE clause repeats the non-empty-digits test: a row whose
-- license_number holds no digits at all ("pending paperwork", a stray note)
-- would otherwise collapse to '' and collide with every other such row.
create unique index if not exists contractors_verified_license_digits_key
  on public.contractors ((regexp_replace(license_number, '\D', '', 'g')))
  where license_verified_status = 'verified'
    and license_number is not null
    and regexp_replace(license_number, '\D', '', 'g') <> '';

comment on index public.contractors_verified_license_digits_key is
  'One license, one account (0125). A CSLB license number can carry the '
  'verified badge on exactly one contractors row. Matched on digits only, '
  'mirroring licenseDigits() in src/lib/licenseMatch.ts, so 270-663 and '
  '"LIC# 270663" are one identity. Partial: only ''verified'' rows are '
  'constrained, so two pros may both have an unchecked number on file.';


-- <<<<<<<<<< END 0125_license_identity_lock.sql <<<<<<<<<<
