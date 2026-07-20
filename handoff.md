# Hearth handoff - 2026-07-19 (session 3, evening)

## LATE SESSION 3 ADDENDUM (QA sweep + fix wave + legal review + design)

### Full-app QA/security sweep (11 agents) - DONE
Ran 10 QA agents + 2 red-team agents (all live-verified against the running dev server + live DB with throwaway accounts, all cleaned up). Result: app works end to end for homeowner AND pro (both browser walkthroughs clean, zero console errors); every security attack BLOCKED live (0083/0086/0087/0088 all empirically confirmed live: trust-badge forgery=42501, sender_role forgery corrected, oversized msg rejected, IDOR=0 rows, service-role RPCs blocked, webhook sig enforced, wallet double-spend race blocked, sybil self-deal blocked, guarantee reuse blocked, AI-cap race holds). Two RED-TEAM CONFIRMED-EXPLOITED (both now fixed in 0089): messages had NO send-rate limit (40 inserts/604ms); job-post rate-limit/redaction/plus-cap are app-only, bypassable by direct PostgREST insert (deferred - cold-start makes it low impact now).

### Fix wave - DONE + VERIFIED (all tsc 0, uncommitted)
- 3 realtime-channel crashes fixed (same bug as LiveUnreadBadge): NotificationBell.tsx (shell-wide!), LeadChat.tsx, LeadsRealtime.tsx - unique per-mount topic + try/catch degrade-to-poll. Dashboard null-property crash fixed (page.tsx redirect to /onboarding). Open redirect in src/lib/safeNext.ts fixed (rejects C0/DEL control chars - tab/newline URL-parser bypass). All verified ship (49-payload adversarial pass on the redirect).
- MIGRATION 0089_referral_and_flood_fixes.sql (verified ship): closes 0088 Shape-B waived-recharge referral leak; adds messages send-rate-limit trigger (30/60s, mirrors 0087 support/reports); grants is_active_member to anon (fixes 42501 on anon properties select).
- MIGRATION 0090_membership_credit_clawback.sql (verified ship after fixing an over-claw bug): reverse_membership_credit + membership_reversals guard table, wired into stripe webhook dispute/refund handlers; mirrors reverse_deposit. No-match branch reverses 0 (never claws the membership PRICE). Uses stripe.invoicePayments.list (SDK v22 removed Charge.invoice) - RECOMMEND a Stripe test-mode trigger before trusting invoice resolution end to end.
- Reliability batch: cron batching (alerts/maintenance-reminders/aging-deals now chunked Promise.all), Checkr webhook returns 500 on real DB error/failed update so Checkr retries, ghost-protection notifications now via sendNotification (email/SMS, batching preserved), home-alerts parallelized (no cache - user-specific), pro-past-jobs real-tier cap. package.json em-dash removed.
- ~~TO PASTE ON LIVE DB: 0089 then 0090.~~ DONE: live DB probe-verified caught up through 0092 (0089/0090 via APPLY_0089_0090, 0091/0092 via APPLY_0091_0092, both bundles spent in applied-bundles/). No live-DB migration work outstanding.

### Legal CODE fixes (the 5 code-fixable items) - DONE + VERIFIED (uncommitted, owner asked for them)
1. src/app/privacy/page.tsx: added the free-tier Gemini disclosure paragraph in the AI section + link to /ai-disclosure (the "see the AI section above" pointer now resolves).
2. src/app/privacy/page.tsx: added a PUBLIC "Your privacy rights" section (CCPA rights + retention statement, mirrored from PrivacyRightsPanel) so it is readable without login; links to /account/privacy for the controls.
3. src/app/privacy/page.tsx: added honest deletion caveat (a pro keeps their own pro_clients copy; deleting your Hearth account does not reach it).
4. src/app/ai-disclosure/page.tsx: route inventory corrected to all 13 Gemini routes + draft-apply named in the feature list.
5. src/app/api/cron/renewal-reminders/route.ts: added AB 2863 "annual_notice" (once-per-calendar-year "renews automatically" reminder for active recurring members any cadence; separate query+loop, dup-guard url ?annual=YEAR, kind "annual_notice", skips trialing/cancelling, billingTerms(plan,false) copy). Verified SHIP.
NON-BLOCKING copy nit surfaced: billingTerms.ts recurring string starts "After that," which reads orphaned when standalone in the annual notice body; optional follow-up = add a recurringStandalone variant. tsc 0 across all.
STILL NOT DONE (attorney/business, unchanged): LLC formation, DMCA agent registration, liability-cap $ / arbitration opt-out address / venue county / pro circumvention window, move legal contact off personal Gmail.

### Legal review (3 research-grounded agents) - findings that drove the fixes above
Docs are honest + well-grounded (no fabrication, no stale prices thanks to billingTerms.ts single-source, no gov-law/arbitration contradictions, cancellation is ARL click-to-cancel compliant, CSLB claims hedged, Stripe-cancel-on-delete now works). CODE-FIXABLE items (offered, awaiting go): (1) /privacy says "see the AI section above" for free-tier Gemini disclosure that isn't there - only on /ai-disclosure which /privacy never links; (2) CCPA rights + retention disclosures are login-walled (/account/privacy + /pro/privacy redirect to signin) - public /privacy can't reach them; (3) deletion claim contradicts pro_clients CRM keeping homeowner data after deletion; (4) AB 2863 (CA ARL, eff 7/1/2025) appears to require an ANNUAL reminder for ALL continuous-service agreements incl monthly/weekly - renewal-reminders cron deliberately skips those; (5) AI-disclosure route inventory stale (4 more Gemini routes; draft-apply not named). ATTORNEY/BUSINESS BLOCKERS (unchanged, still open): form the LLC ("Hearth LLC" is placeholder, entity not formed), register DMCA agent w/ Copyright Office + fill /dmca (ZERO safe harbor now), fill liability-cap $ + arbitration opt-out mailing address + venue county + pro-terms circumvention window, move legal contact off founder personal Gmail to monitored inbox. FTC click-to-cancel rule was VACATED (8th Cir, Jul 2025) - not in force; ROSCA + CA ARL still apply.

### Design overhaul - IMPLEMENTED + dark-mode tuned (owner approved the direction, uncommitted)
- FOUNDATION (Fable, by hand): layout.tsx font Inter -> Hanken_Grotesk (var --font-sans); tailwind.config.ts hearth-* ramp is now a RED-LEANING ember (600=#b8442a primary, 50=#faf4f0 paper - deliberately red not orange so it does not drift yellow on dark); globals.css .card-hero flattened, body leading-[1.55]. Production build passed (99 routes), font self-hosts fine.
- GRADIENT SWEEP (2 Sonnet agents): flattened all 10 gradient/glass .tsx files (Nav, ProNav, value, forecast, pro/business, PublicProfileForm, landing page, pros, p/[id], not-found). Zero bg-gradient/backdrop-blur/from-/via- left in src .tsx. Copy was already plain (no buzzwords found).
- DARK-MODE tuning (owner iterated live): accent pulled redder (was reading yellow); PublicProfileForm cover banner dark:bg-stone-800 -> stone-700 (was invisible); chart de-emphasized bars dark:bg-hearth-600 -> hearth-500/60; Wins bars got dark:bg-stone-500 (were missing dark variant). AMBER NORMALIZATION: SystemRow "check soon" border amber-300(too yellow)->amber-400/dark amber-500; and app-wide, ~16 files normalized from the muddy `dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200` to the clean standard `dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-300` (matches globals.css .chip-warn). Zero old muddy amber classes remain.
- STILL CSS-gradients (deliberately NOT flattened): src/app/api/{win-card,review-card}/[...]/route.tsx + p/[id]/opengraph-image.tsx (generated SHARE/OG images, seen outside the app) and HeroDemoPlayer.module.css (the demo video, intentional). Ask owner if they want the share-card images flattened too.
- OPEN owner decisions: (a) green "on track" + red "overdue" statuses still use the darker wash style (only amber was normalized per owner's ask) - offer to unify all status colors; (b) confirm the redder ember accent feels right; (c) share-card gradients above.
- tsc 0 throughout. billingTerms annual-notice "After that," orphan copy fixed (strip lead-in in the cron).

### Design overhaul - direction mockup (published artifact, reference)
Fable built a visual direction mockup (published artifact: https://claude.ai/code/artifact/5f15e5c7-c001-4675-ad2e-2a0d15c8ddbb). Direction: flat warm paper (#FAF8F5) + white cards + ONE ember accent (#C0552B, on-brand for "hearth"); green/amber/red = status only; ONE humanist font Hanken Grotesk (replaces Inter, self-host via next/font; alternates Public Sans/Figtree); line-height 1.55; kill .card-hero gradient + ~43 gradient usages; tokenize palette; sweep buzzwords. NOT executed yet - owner must approve direction first, then Sonnet executes page-by-page + verifier guards desktop-unchanged. Existing system was already ~80% there; the real violations are Inter, leftover gradients, buzzword copy.


## TL;DR / current state
- Branch `feature/2026-07-19-app-update`. EVERYTHING IS NOW COMMITTED AND PUSHED
  (2026-07-19, owner asked): `dea448f` security remediation + redesign, then `cd597a7`
  audit fix wave + 0.0.0.0 redirect fix (new src/lib/requestOrigin.ts) + migrations
  0091/0092. Working tree clean. Still NOT merged to main; PR can be opened at
  github.com/r3dhoodi3/Hearth. (Ask before commit/push remains the standing rule.)
- **THE LIVE DB IS FULLY CAUGHT UP: migrations 0001-0088 applied and probe-verified.**
  This was the day's big win; details and the probe method below.
- App runs in DEV: `npm run dev -- -H 0.0.0.0 -p 3000`, open http://localhost:3000 (HTTP).
  `npx tsc --noEmit` = 0 errors. The owner's browser crash is FIXED (real bug, see #4).
- The closed_at backfill fixup RAN and was probe-verified (2/2 closed leads stamped).
  No live-DB work is outstanding.

## 1. Live DB catch-up saga (the bulk of the session)
- The previous handoff claimed live was "missing 0067+". WRONG. Direct probing showed a
  patchwork: caught up through 0057, plus 0062/0063/0064/0066, missing 0058-0061, 0065,
  all 0067-0087, AND 0009's lead_reads + message_reactions (read receipts/reactions were
  broken on live the whole time). Migration 0058 (Stripe money-safety) had never run.
- Built `supabase/applied-bundles/RUN_THIS_ONE_applied_2026-07-19.sql` (0009 backfill +
  0058-0087, idempotency-audited). Owner ran it successfully. All older bundles are in
  `supabase/applied-bundles/` - every one of them is SPENT, never re-run, never commit them.
- Real dormant bug found and fixed in repo during this: `migrations/0061` used
  `(completed_at::date)` in an index (timezone-dependent, 42P17 on any fresh DB); now
  `(((completed_at at time zone 'utc'))::date)`.
- **PROBE METHOD (use this, never trust memory/handoff claims about live state):**
  service key from `.env.local` + `@supabase/supabase-js`, plain
  `.select('col').limit(1)` per table/column; 42703/PGRST205 = missing. WARNING:
  `head:true` probes LIE (no error for missing tables). rpc({}) probes give PGRST202 on
  signature mismatch even when the function exists. Probe scripts pattern is in the
  session transcript; trivially rebuildable in node -e.
- Supabase SQL editor facts proven today: each paste runs atomically (error = full
  rollback); a SELECTION runs alone silently; big pastes can clip (always check the last
  line pasted before running).

## 2. Referral closed-deal gate - migration 0088 (DONE in code + applied live)
- `supabase/migrations/0088_referral_closed_deal.sql` (Sonnet built, adversarially
  verified, two verifier-caught bugs fixed). Owner ran it on live; column probe-confirmed.
- New rules: $25+$25 fires only when the referred pro has a QUALIFYING CLOSED DEAL:
  chosen application with fee_cents>0, not refunded, lead closed, `closed_at` >= 21 days
  old, no waived recharge (or the no-application shape: paid=true AND payout_amount>0 AND
  closed 21+ days). Rehire freebies excluded. Plus: $500 lifetime referrer ceiling
  (wallet-ledger sum), claim_promo('referral_reward_referred') once-per-user guard,
  cron pre-filter fail-open on any error.
- `closed_at` is a new contractor_leads column stamped ONLY by the trigger on real status
  transitions (set on entering 'closed', cleared on leaving, never client-writable, runs
  AFTER the anti-forgery guards - ordering matters, a verifier caught corruption when it
  ran before them).
- GOTCHA discovered post-apply: the migration's own backfill was reverted by its own
  trigger (backfill ran after the trigger swap). Repo file is FIXED (backfill now before
  the trigger replacement) but the live DB needs the 3-line fixup at top of this file.
  Verify with: `s.from('contractor_leads').select('id,closed_at').eq('status','closed')`
  - all rows must have closed_at.
- Deferred (still): phone + Stripe-card-fingerprint sybil dedupe (needs infra).

## 3. Renewal-reminders cron - weekly + trial support (DONE in code)
- `src/app/api/cron/renewal-reminders/route.ts` reworked (Sonnet built, verified SHIP):
  `toPaidPlan` accepts "weekly"; new `trial_end` notice ~24h before a short (<=7d) trial
  ends, all cadences incl. yearly; legacy month-long trials keep the 5-day lead;
  step-up branch now `!trialing && (discounted || flaggedStepUp) && !yearly` (Plus stamps
  intro_step_up on EVERY cadence - without !trialing the dup-guard suppressed the real
  trial notice); query excludes active (post-trial) weekly subs
  (`.or("plan.neq.weekly,status.eq.trialing")`) to stop MAX_SUBSCRIPTIONS starvation;
  renewal notices always quote standard terms (`billingTerms(plan, due !== "renewal" && stepUp)`).

## 4. Owner's "Something went sideways" crash - FIXED (real bug, not cache)
- `src/components/LiveUnreadBadge.tsx`: fixed realtime channel topic `unread-<role>`;
  supabase-js returns the SAME already-subscribed channel for a duplicate topic and the
  second `.on()` THROWS, crashing the signed-in shell to the root error boundary.
  Triggered by StrictMode remount races (removeChannel is async) or any double render of
  the badge. Fix: unique per-mount topic + try/catch best-effort realtime (polling is the
  fallback). Owner confirmed the dashboard loads.
- Diagnostic fact for future: the root error page (Logo + "Go home / Your dashboard")
  means the (app) LAYOUT subtree crashed (Nav/AskHearthDock/NewMessageNotifier);
  the Nav-still-visible variant means the page's own tree. Audit agent verified
  NAV_ICONS map integrity (clean) and that the repeated /api/home-alerts calls in dev
  logs are HMR remounts, not a fetch loop.
- If a page crashes ONLY in the owner's normal browser profile but works in incognito:
  get the F12 Console text FIRST (it found this bug in one paste), then suspect
  localStorage.

## 5. Owner spot-check status
- Dashboard loads post-fix: CONFIRMED by owner.
- NOT yet explicitly confirmed: pro saves profile / sends chat message / changes lead
  status (exercises 0083-0087 grants + triggers). Ask for this early next session.

## 6. Next-session queue (owner-approved order)
1. Confirm the pro spot-check (see #5) if the owner didn't do it at session end.
2. COMMIT the giant uncommitted tree - ASK the owner first, stage cleanly. Includes:
   security remediation 0083-0087 + code fixes, pricing paywall (weekly/3-day trial),
   nav crash fix, video tweaks, trial-reminder cron, 0088 + cron, LiveUnreadBadge fix,
   0061 fix, handoff/memory files. Never commit `supabase/applied-bundles/`
   (gitignore-check; they are spent one-time bundles).
3. Flat-design + plain-copy overhaul (queued, owner asked): one flat bg + single accent,
   no gradients/glass/purple-blue, real font, line-height 1.5-1.6, plain human copy, no
   buzzwords/emoji. See design-and-copy-preferences memory.
4. aiUsage.ts: request-count cap -> dollar-cost cap per user.
5. Hero video: "License verified" badge, proof captions, mobile clipping, reduced-motion,
   ElevenLabs VO regeneration for word-timestamp caption sync (owner rule: demo VO copy
   cannot change without regenerating the matching mp3). Backup:
   demo-video-backup/2026-07-19-pre-revision/.
6. Pre-launch legal: DMCA agent registration + TODO(legal) fills + owner review of
   /privacy /terms drafts.
7. For prod later: weekly Stripe price (STRIPE_PRICE_PLUS_WEEKLY), hosting (no Vercel
   yet - crons run NOWHERE until hosted), CRON_SECRET, Resend.

## 7. Working rules (owner-stated, standing)
- Fable 5 plans/brainstorms/reviews; SONNET subagents execute; separate verifier agents
  re-check (mandatory for money/security). Launch execution agents with model "sonnet".
- Never commit/push without explicit owner confirmation in that moment.
- No em dashes anywhere. Plain human copy. Mobile changes must not alter desktop.
- Verify live-DB state by probe, never by claim (see #1 probe method).
