# Hearth handoff

Last updated: 2026-07-18. Branch `fix/money-safety-0058`, HEAD `818f5f5` (pushed to origin, working tree clean, tsc 0 errors).

## 1. Goal

Hearth is a two-sided homeowner-maintenance app (Next.js App Router + Tailwind + hosted Supabase, Stripe, RentCast). This work stream had two immediate goals, both now essentially done:

- Make onboarding pull in as much real property data as possible from the RentCast API (street + ZIP -> full record) so features light up with zero typing.
- Close the QA-found account-security holes and finish a broad polish pass (dark mode, demo video, onboarding research).

The near-term product goal beyond this: add a guided first-run tour / coach-mark popups (research is done, build is not) and ship the branch to `main`.

## 2. Current state

- **Committed + pushed:** commit `818f5f5` on branch `fix/money-safety-0058`, 226 files. Local == `origin/fix/money-safety-0058`. Nothing uncommitted, nothing unpushed. NOT yet merged to `main`.
- **Typecheck:** `npx tsc --noEmit` = 0 errors across the whole tree.
- **Database:** migrations `0062`–`0066` were hand-applied to the LIVE hosted Supabase project (`tubkvvfkwggaddcmcjqv.supabase.co`) via the dashboard SQL editor and VERIFIED present (invoices table, pro_tool_edits table, wallet_config.spend_cash_first, and all properties enrichment columns). The founder confirmed a live address onboarding works.
- **Env:** `RENTCAST_API_KEY` is set in local `.env.local` (gitignored). MUST also be set on the prod host (Vercel) for autofill to work live. `.env.local.example` was updated (RENTCAST replaces old REGRID token doc). The real key is in NO tracked file.
- **Dev server:** `npm run dev` on port 3000 (restarted after adding the key so it loads).
- **Open tasks:** #25 (issue-resolved consistency + "Complete job" -> homeowner popup) and #40 (surface market_value + tax history on /value and /taxes) are still pending. Everything else from the session is completed.

## 3. Active files

RentCast ingest (this session's core):
- `src/lib/parcel.ts` - lookupParcel(street, zip); maps full RentCast record + second AVM value call; deriveSystemFacts/derivePurchasePrice/deriveAssessed/derivePropertyTaxHistory.
- `src/app/onboarding/OnboardingForm.tsx` - address step is now street + ZIP boxes; confirm step carries 13 hidden inputs of enrichment facts.
- `src/app/onboarding/actions.ts` - claimPropertyAction: baseRow/extendedRow resilient insert, seeds home_systems.material_or_model.
- `supabase/migrations/0066_rentcast_enrichment.sql` - new properties columns.

Account security:
- `src/app/(app)/account/actions.ts` - deleteAccountAction reauth + saveAccountAction name guard.
- `src/app/pro/profile/actions.ts` - pro deleteAccountAction reauth.
- `src/components/AccountSecurityPanel.tsx` - styled inline delete confirm w/ password.
- `src/app/(app)/account/ProfileInfoForm.tsx` - name required.

For the NEXT build (guided tour / popups) - patterns to reuse, per research:
- `src/app/(app)/dashboard/WalkthroughNudge.tsx` (localStorage dismiss + cooldown pattern)
- `src/components/pro/SetupChecklist.tsx` (stateless data-driven checklist, self-hides)
- `src/components/ChecklistProvider.tsx`, `ChatDrawer.tsx`, `ProfileMenu.tsx`, `Toaster.tsx` (context + overlay + animation precedents)
- `src/app/(app)/walkthrough/page.tsx` (the "aha" screen that's under-discoverable)

Demo video (do not casually touch; large + fragile):
- `src/components/HeroDemoPlayer.tsx` + `.module.css` (rendered on `src/app/page.tsx`), VO in `public/demo-vo/`.

## 4. Changes made (this session)

- RentCast: split onboarding address into street + ZIP; ingest assessed value/year, purchase date/price, 11-year property-tax history, lat/long, HOA fee, county, AVM market value (+range); seed roof/HVAC/foundation materials on starter systems. Migration 0066. This auto-fills /taxes and /value and sharpens the Home Health Score.
- Account deletion: server-side current-password re-verification on both homeowner and pro sides (fail-closed, verified by a security review); replaced raw confirm() with a styled inline confirm.
- Full name: required on edit-profile, empty save rejected server-side.
- Signup: reject blank/whitespace/junk addresses.
- Wallet: cash-before-credit charge order (0064); wallet row lock on charge (0065); in-chat invoices (0062).
- AI back office: category limited to pro's own categories, "send to a lead" action, remembered edits (0063).
- Dark mode: full per-page sweep (~100 files) + dark score-band tones in `src/lib/health.ts`.
- Demo video: true fullscreen 16:9 landscape sizing, centered replay button, caption/VO sync, calmer camera, clicky keyboard SFX.
- Quote analyzer editable "what's missing" + locked during analysis; home report honest history + editable synced systems; notification opens the specific lead; My Business download fix; offline regression fix; post-a-job form styling.
- Research completed (not built): whole-app UX investigation, 3-agent guided-tour/popup research, tutorial video script. Tutorial script saved to Claude memory (`hearth-tutorial-video-script.md`), decided script-only for now.

## 5. Failed attempts / gotchas (so we don't repeat)

- **Could not apply migrations programmatically.** The project has only the anon + service-role keys, which talk to PostgREST and CANNOT run DDL. No DB password / connection string / Supabase access token exists in the repo, and the Supabase CLI is not installed. Resolution: bundled 0062–0066 into one ordered .sql file, founder pasted it into the Supabase SQL editor. For future migrations, either install the CLI + a DB password, or use a Supabase personal access token against the Management API (`POST /v1/projects/{ref}/database/query`), or keep hand-applying.
- **Verifier caught a real ingest bug:** the pre-migration `baseRow` fallback in claimPropertyAction originally omitted purchase_date/price and assessed_value/year (columns that already existed pre-0066), so they'd have been dropped if 0066 wasn't applied yet. Fixed: those four moved into baseRow.
- **Transient tsc error** during concurrent verifiers (TS2345 in onboarding/actions.ts, an excess-property mismatch because database.types.ts doesn't know the new columns) - resolved with `as any` casts on the inserts, matching the existing pattern in value/actions.ts and taxes/actions.ts. Final tsc is clean.
- **CRLF warnings** on commit ("LF will be replaced by CRLF") are just Windows line-ending notices, harmless, nothing failed.
- Migration bundle is NOT safely re-runnable: tables use `if not exists` but `create policy` lines will error on a second run. Apply each migration once.

## 6. Next steps

Ordered, highest value first:

1. **Confirm `RENTCAST_API_KEY` is set on the prod host (Vercel).** Without it, live autofill is dead even though the code is correct.
2. **Decide on `main`:** open a PR from `fix/money-safety-0058` -> `main` (or merge) to actually ship. Not done yet.
3. **Build the guided tour / onboarding popups** (research done, build pending). Recommendation from research: a dependency-free custom solution (React context + fixed overlay + spotlight + positioned tooltip), NOT a library (intro.js is AGPL, react-joyride had a long unmaintained gap). Persist "seen tour" as a per-user Supabase column; use localStorage for per-feature hints (mirror WalkthroughNudge). Highest-leverage guidance moments: `/walkthrough` discoverability (the aha moment, currently one dismiss from vanishing), the pro-side first "Apply" fee explanation, and a homeowner SetupChecklist mirroring the pro one.
4. **#40:** surface the now-populated market_value (+range) on `/value` and the property_tax_history trend on `/taxes`.
5. **#25:** issue "resolved" vs home-page status consistency + a "Complete job" -> homeowner update popup.
6. **Minor QA nit (open):** pro deleteAccountAction deletes the `contractors` row before `admin.deleteUser` without checking that first delete's error; if deleteUser then fails you get an orphaned auth user. ~2-line fix, not security-critical.
7. **Reminder (saved, not implemented):** lead pricing change - big-ticket lead tier $90 -> $99, plus a $49.99 first-time intro price.
8. Optional: produce the tutorial video from the saved script (currently script-only, placed nowhere; would go on a `/tour` or help page, not the landing page).
