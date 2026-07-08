# Hearth Production Go-Live Runbook

Compiled 2026-07-07 from deploy-hardening research grounded in this exact repo
(14 crons in vercel.json, the 4 Stripe webhook events the code handles, every
env var name the code reads). Full sourced report in the session transcript.
Steps marked OWNER need the owner's accounts/cards; everything else the
assistant can execute.

## Monthly cost at launch
Vercel Pro $20 (Hobby ToS forbids commercial use, full stop) + Supabase Pro
$25 (free tier PAUSES after 7 idle days and has zero backups) + Sentry free +
Resend free + UptimeRobot free = ~$45/mo + Stripe's 2.9% + 30c per charge.

## Order of operations
1. OWNER (do first, has lead time): buy domain; upgrade Vercel to Pro;
   upgrade the Supabase project (ref tubkvvfkwggaddcmcjqv) to Pro; START
   STRIPE LIVE-MODE VERIFICATION (business details + bank, can take days);
   create Resend, Sentry, UptimeRobot accounts.
2. Pre-deploy code fixes: DONE for the cron/widget middleware allowlist
   (2026-07-07). Still open: renumber the duplicate 0019/0020/0021 migration
   filenames before adopting the CLI workflow (order-sensitive: needs its own
   careful session, see below).
3. Resend: verify the domain (DKIM/SPF DNS records at the registrar), create
   an API key.
4. Supabase custom SMTP: Project Settings -> Auth -> SMTP -> smtp.resend.com,
   port 465, username "resend", password = Resend API key. Then raise the
   auth email rate limit (default sender allows ~2/hour: signups stall
   without this).
5. Supabase Auth settings: Confirm email ON, secure email change ON, leaked
   password protection ON. URL Configuration: Site URL = https://yourdomain,
   redirect allowlist https://yourdomain/** (signup code passes no
   emailRedirectTo, so confirmation links follow Site URL: today that is
   localhost, which would break every real signup).
6. Stripe live mode: "Copy to live mode" each product/price (NEW live price
   ids result); recreate or skip the intro coupon (code self-creates a
   fallback safely); grab live sk_/pk_ keys.
7. Vercel project from the Git repo. Env vars (Production scope; Sensitive
   where noted): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
   SUPABASE_SERVICE_ROLE_KEY (Sensitive, NEVER in Preview scope),
   NEXT_PUBLIC_SITE_URL=https://yourdomain (no trailing slash; build-time
   inlined, must exist at deploy), STRIPE_SECRET_KEY (live, Sensitive),
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (live), STRIPE_WEBHOOK_SECRET (real
   value after step 9), STRIPE_PRICE_PLUS_MONTHLY/_YEARLY,
   STRIPE_PRO_MONTHLY/_YEARLY_PRICE_ID, STRIPE_PRO_INTRO_COUPON_ID
   (optional), CRON_SECRET (Sensitive; this exact name makes Vercel attach
   it as the Bearer token on cron calls), GEMINI_API_KEY (Sensitive),
   RESEND_API_KEY (Sensitive), RESEND_FROM, REGRID_API_TOKEN (optional).
   Never set NEXT_DIST_DIR on Vercel. Leave Supabase vars OUT of Preview
   scope so preview deploys cannot touch the production database.
8. First deploy on *.vercel.app; confirm the 14 crons registered. Then add
   the domain (apex A 76.76.21.21, www CNAME cname.vercel-dns.com), SSL is
   automatic.
9. Stripe webhook (live): endpoint https://yourdomain/api/stripe/webhook
   subscribing to exactly: checkout.session.completed,
   customer.subscription.updated, customer.subscription.deleted,
   invoice.payment_succeeded. Put its whsec_ into STRIPE_WEBHOOK_SECRET and
   REDEPLOY (env changes need one).
10. Smoke test: anon pages incl sitemap (URLs must show the real domain);
    real homeowner + contractor signups (emails arrive, links land on the
    domain); post a lead end to end; OWNER buys Plus with a real card ($4.99,
    verify webhook 200s + subscriptions row + features unlock, then refund);
    hit one cron with ?secret= expecting JSON, not a signin redirect; open
    /p/<id> and the widget in incognito.
11. Monitors: UptimeRobot on the homepage (5 min), Sentry wizard
    (npx @sentry/wizard -i nextjs) in a follow-up deploy. Add one Vercel WAF
    rate-limit rule: /api/* and /signin, ~100 req/60s per IP -> 429.

## Top 5 first-deploy breakages for THIS codebase
1. Crons dead via middleware session bounce: FIXED in code 2026-07-07
   (/api/cron/ + /api/pro-widget/ allowlisted; routes still self-auth).
2. Auth emails linking to localhost (Supabase Site URL): step 5.
3. Auth email throttling (2/hr default sender): step 4.
4. Webhook signature mismatch (test whsec with live endpoint): step 9;
   symptom is charged cards but no subscription row.
5. NEXT_PUBLIC_SITE_URL unset/trailing slash: localhost in sitemap/OG/
   checkout URLs; the home-digest cron silently no-ops without it.

## Future migrations: never again the wrong project
supabase login -> supabase link --project-ref tubkvvfkwggaddcmcjqv (inside
the repo) -> from then on ONLY `supabase db push` (shows target ref +
files, asks confirmation). SQL editor becomes read-only territory.
Prerequisites before baselining: renumber the duplicate 0019/0020/0021
filename pairs into unique slots WITHOUT changing fresh-install apply order
(order-sensitive: 0019_security_hardening's revokes interact with later
grants; do this in its own reviewed session), then
`supabase migration list --linked` + `migration repair --status applied` for
everything the live DB already has.

## Weekly 5-minute health check
UptimeRobot red? Vercel cron runs all green? Stripe webhook failed
deliveries? New Sentry issues? Supabase DB size + Resend bounce rate.
