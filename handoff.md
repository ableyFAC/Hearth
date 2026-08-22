# Hearth handoff (2026-08-20)

Snapshot to continue from after clearing the chat. Durable context also lives in
the Claude memory files (the real cross-session handoff); this is the readable
summary. Everything below is committed and pushed unless marked otherwise.

## Current state (verified, not aspirational)

- Branch `main` at `HEAD` == origin. 196 Vitest tests passing, `tsc --noEmit` clean.
- LIVE Supabase DB is at migration **0126** - verified read-only against the live
  API on 2026-08-20: launch_city_for_zip resolves all 9 cities (Santa Ana check),
  Surfside 90743 correctly maps to Seal Beach, anon is denied EXECUTE, pros with
  serves_orange_county are backfilled to all 9 launch cities, verified-license
  set is duplicate-free. Landen pasted `supabase/PASTE-ME-live-0124-0125-0126-COMBINED.sql` himself.
- Launch area: Huntington Beach, Fountain Valley, Seal Beach, Westminster,
  Midway City, Garden Grove, Santa Ana, Costa Mesa, Newport Beach. Enforced end
  to end: homeowner ZIP gates (onboarding + job post + direct request + post
  publicly), pro city pick (9 checkboxes), open_jobs_for_me + apply_to_lead
  filters. Deliberate exception: unlock_direct_request has NO city gate - the
  homeowner picked that specific pro; gate it only if Landen decides to.
- Dev server: `npm run dev` on :3000 (running in background at handoff time).

## What shipped 2026-08-19 and 08-20 (commit order)

1. `607b163`/`b5ccb30` - Ethan's PR #6 migration renumbering merged + stale-name cleanup.
2. `5f88057` - Sign in with Apple on web (button on signin + both signups).
   Owner setup steps in `docs/APPLE-SIGN-IN-SETUP.md`; App Store research in
   `docs/APP-STORE-CHECKLIST.md`. THE TRAP: Apple's client secret JWT expires in
   6 months and fails silently - Landen must set a 5-month recurring reminder.
3. `840560a` - Pricing pages: Free / Annual hero / Monthly anchor on both plus
   pages + /pricing; annual is the checkout default via checkoutCadence() (one
   choke point, disclosure and charge can never disagree); per-day framing and
   savings computed from constants (planMath helpers).
4. `b1176b5` - Launch-city enforcement (0124) + CSLB license identity lock
   (0125): name matching in src/lib/licenseMatch.ts (generic trade words do not
   count as identity; containment is token-boundary anchored - a substring
   forgery hole was found by the verifier and fixed), partial unique index =
   one license verified on one account, first claim wins, dispute form lands in
   support_messages.
5. `3f4f37c` - Perf wave 1: 15 loading.tsx skeletons, middleware skips auth on
   public paths, guides share one cached auth call, waterfalls collapsed
   (pro/billing 7->3 waves), /profile is a config redirect, greeting fetched
   lazily on dock open, contractor/property/chats selects trimmed to column
   lists, qrcode loads on demand.
6. `e921f55` - The big one: free-tier audit fixes (13-agent persona audit,
   cross-examined; full report artifact "Free-Tier Feel Audit"), 9-city
   expansion (0126), Ask Hearth consistency (strongest Gemini first, temp 0.4,
   thinking budget, continuity prompt rules), owner fixes (home value AVM
   preference, quote-form validation on submit only, BackLink on /p/[id],
   #your-jobs anchor, plain-text project chips).
7. `5659506` - Perf wave 2 (flash toast client-side so public pages can
   prerender; job-post fan-out 402 queries -> 3) + trade-pictogram sweep
   (CategoryIcon and every per-trade symbol deleted app-wide; icons in general
   stay - tool tiles, nav, functional).
8. (this commit) - getProperties redirects to /signin instead of returning []
   when the session cookie is unreadable - fixes the "random onboarding page,
   back, login, then homeowner side" loop Landen hit.

Key monetization decisions Landen made (all implemented):
- Email/SMS for proactive homeowner alerts/reminders are Plus-only, enforced
  inside sendNotification (src/lib/notifyGating.ts is the kind list; fails
  CLOSED; billing notices are never gated - legal). In-app bell is free forever.
- Hearth pays for a pro's Checkr check only after 3 PAID leads (refunded ones
  do not count). Atomic status claim before the Checkr call prevents
  double-billing. Card shows "you're at X of 3" progress.
- Home report: free users see the full page, printing carries a diagonal
  "Hearth Plus preview" watermark; members print clean AND complete (print now
  carries full per-system details via shared src/lib/health.ts helpers so
  screen and print cannot drift).

## Next steps (priority order)

1. **Landen: Next.js 15 smoke test, then merge.** Branch `upgrade/next-15` at
   `fed0a84` in the worktree `.claude/worktrees/agent-a271b33cb247f403a` was
   re-merged with all of the above and is fully green (tsc, 196 tests, full
   build). ~2 min: save something + see toast, sign in/out, scrub demo video,
   glance pro billing. Then say "merge it". After stable: Next 16 hop closes
   the last 3 npm-audit highs.
2. **Landen: Apple sign-in portal setup** per docs/APPLE-SIGN-IN-SETUP.md
   ($99/yr + ~40 min + the 5-month JWT reminder).
3. **Landen: legal track** - CA LLC (~$90 + $800/yr franchise tax, time it near
   launch), DMCA agent ($6), attorney flat-fee REVIEW of ToS/privacy/pro-terms
   ($1.5-4k), move legal contact off personal Gmail.
4. **Landen: Stripe test-mode checklist** before the 3-day trial goes live.
5. **Landen: GO-LIVE-WIRING keys** (Resend, Twilio + A2P, Stripe live, Checkr,
   RentCast, CRON_SECRET) per docs/GO-LIVE-WIRING.md. Riders: register the
   sending domain with Apple private relay; swap free Gemini key for paid
   Claude API (privacy + the 25/day cap math changes).
6. Open product decisions: (a) direct-request city-gate exception - keep or
   gate; (b) /p/[id] full staticization (exact path written into that page's
   comments - move the request-form CTA decision client-side); (c) landlord/
   renter product idea - Phase 1 is a "tenant" flavor of household sharing
   whose issues notify the landlord instead of posting jobs; do NOT start
   before HB/FV launch proves itself; (d) eventual iOS app per
   docs/APP-STORE-CHECKLIST.md.
7. "Value features batch 2" from the old roadmap is ALREADY BUILT (verified
   08-20: doc vault, service history/reviews/report, photo-to-AI, referrals,
   email/SMS senders). Do not re-plan it; delivery wakes up with the keys.

## What went bad (learn from these)

- **Migration 0124 initially mapped Surfside (90743) to Huntington Beach** -
  it belongs to Seal Beach. Caught in the 0126 work. ZIP facts need checking,
  not vibes; there is now a test asserting every launch ZIP is in the OC set.
- **The license name-matcher shipped with a substring hole** ("Ndo" matched
  "MENDOZA CONSTRUCTION") - the adversarial verifier caught it before push.
  The verify-everything-money-adjacent loop earns its cost; keep it.
- **startBackgroundCheckAction claimed its whitelist closed the double-click
  race - it did not** (read-then-write). Fixed with a conditional-update claim
  before the paid call. Pattern to reuse: claim state atomically BEFORE
  spending money (analyze-quote does it right).
- **The /plus table sold "all alerts, every channel" while no code enforced
  it** and the weather cron passed no contacts at all. Perk pages must be
  cross-checked against enforcement; the audit found it, both halves fixed.
- **A dishonest banner shipped at some point**: "You've used your free quote
  check" shown unconditionally to fresh users. Now conditional. Copy that
  states a fact must read the fact.
- **getProperties returned [] for a missing session**, misrouting stale-cookie
  users to /onboarding (the bug fixed in this commit). Empty-data and
  no-session are different answers; never conflate them.
- **Stale .next after mass file changes** broke localhost with webpack
  "reading 'call'" errors - fix is stop server, delete .next, restart.
- **Two agents stalled mid-run** (stream watchdog); a SendMessage nudge with
  "re-read the tree, resume exactly where you left off" recovered both.
- Landen's test account has a DUPLICATE property (two 17860 Santa Mariana St
  rows; the 2-system one from 06-03 is the dead one). Default active home =
  oldest, so the near-empty duplicate shows first. He was offered deletion -
  not yet authorized. Use the home switcher meanwhile.

## What went well (keep doing)

- Plan (Fable) -> execute (Opus subagents) -> adversarially verify anything
  money/security -> commit in reviewed batches. Verifier caught 2 real
  pre-push bugs across the run.
- The 13-agent persona audit with cross-examination produced findings that
  survived scrutiny AND a balanced "leave these alone" list. Report artifact:
  "Free-Tier Feel Audit"; runway doc artifact: "Hearth Launch Runway" (update
  the same artifacts, do not create new ones).
- Byte-level mechanical diffs of money functions (apply_to_lead re-issues)
  instead of eyeballing.
- Centralized choke points: checkoutCadence(), notifyGating, health.ts status
  helpers, shared launch-area constants in serviceArea.ts - copies drift,
  choke points cannot.
- Honest copy discipline held: loss framing only where the loss is real, no
  invented urgency, computed numbers only.

## Working agreements (carried forward; also in Claude memory)

- Fable plans + reviews; Opus subagents execute; separate verifier re-checks
  money/security. Commit + push routine inside an active directive; STILL ASK
  before merges (PRs and big branches), force pushes, destructive/irreversible
  actions.
- No em dashes anywhere (prose or code).
- UI: clean and compact; NO per-trade/category pictograms anywhere (wrench,
  roller, etc.) - plain text labels; general icons (nav, tools, functional,
  provider logos) stay. Forecast/quote features stay.
- Live DB changes ship as PASTE-ME files; Landen pastes; Claude verifies
  read-only afterward.
- Don't `git add -A` without excluding handoff.md leftovers; `.claude/` is
  gitignored agent scratch.

## Gotchas for the next session

- Gemini thinking budget (512) is billed inside maxOutputTokens (1024) on the
  2.5 models - if Ask Hearth answers start truncating, raise maxOutputTokens
  rather than dropping thinking.
- BackLink on /p/[id] uses history.length as the back heuristic - a shared-link
  visitor with tab history gets "Back" that may pop off-site; document.referrer
  origin check is the upgrade if it bothers anyone.
- The FlashToast effect deliberately has no dependency array (revalidate-only
  actions re-render without navigation); don't "fix" it.
- next.config.mjs changes (the /profile redirect) need a dev-server restart.
- vitest include is `src/**/*.test.{ts,tsx}`; 14 files / 196 tests as of now.
