# 🏡 Hearth

A homeowner tool. The owner's job-to-be-done — *"keep my house in good shape,
tell me what needs attention, store my home docs, and get me a trustworthy
contractor when something breaks"* — is the product. The business data
(condition, leads, intent) falls out as a byproduct of a tool people actually
want to use.

> **Working name only.** "Hearth" is a placeholder — rename freely
> (`package.json`, `src/app/layout.tsx`, `Nav.tsx`, this file).

## What's built (Phase 1 — the value loop + first revenue)

| Screen | Route | Status |
|---|---|---|
| 1. Onboarding & address claim | `/login` → `/onboarding` | ✅ |
| 2. Home Profile (digital twin) | `/profile` | ✅ |
| 3. Home Health Dashboard | `/dashboard` | ✅ |
| 4. Report an Issue | `/issues` | ✅ |
| 5. Find a Contractor / Get Quotes | `/contractors` | ✅ |
| 6. Improvements / remodel log | — | ⏳ Phase 2 (schema ready) |
| 7. Intent capture | — | ⏳ Phase 2 (schema ready) |
| Documents vault | — | ⏳ v1.1 (schema ready) |

The Phase 2 / v1.1 tables ship in the migrations now so foreign keys and RLS are
coherent, but no UI is wired for them yet.

## Stack

- **Next.js 15** + **React 19** (App Router, TypeScript, Server Actions)
  - `cookies()`, `headers()`, and a page's `params`/`searchParams` are async
    here: server code awaits them, client pages unwrap them with React's
    `use()`. `createClient()` from `src/lib/supabase/server.ts` is async for
    the same reason, so every call site awaits it.
- **Tailwind CSS**
- **Supabase** — Postgres + Auth (email/phone OTP) + Storage (photos)
- Row-Level Security on every table: an owner can only ever touch their own
  home's data.

## Project layout

```
supabase/migrations/   0001 schema · 0002 RLS · 0003 seed · 0004 storage
src/lib/               supabase clients, DB types, health/maintenance logic, parcel lookup
src/app/               login, onboarding, auth routes
src/app/(app)/         authed shell: dashboard, profile, issues, contractors
src/components/         Nav, PhotoUpload
```

## Setup

> The toolchain (npm / git / supabase) wasn't runnable in the environment that
> scaffolded this, so run these yourself.

### 1. Install dependencies

```bash
cd hearth
npm install
```

### 2. Start Supabase (local) and apply migrations

Easiest path is local via the Supabase CLI (needs Docker):

```bash
supabase start          # boots Postgres, Auth, Storage, Studio
supabase db reset       # applies all migrations in supabase/migrations + seeds
```

`supabase start` prints your local **API URL**, **anon key**, and the **Inbucket**
mail UI URL (where magic-link emails land in dev).

> Prefer a hosted project? Create one at supabase.com, then
> `supabase link --project-ref <ref>` and `supabase db push`. Use the project's
> URL + anon key in step 3, and paste the contents of each migration into the
> SQL editor if you're not using the CLI.

### 3. Environment

```bash
cp .env.local.example .env.local
# fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from `supabase start`
```

### 4. Configure the auth email template (magic link)

In Supabase **Auth → Email Templates → Magic Link**, point the confirmation URL at:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

(Locally, confirmations are disabled in `config.toml` and you can also just type
the 6-digit code shown in Inbucket.)

### 5. Run

```bash
npm run dev        # http://localhost:3000
npm run typecheck  # optional: verify types
```

### 6. Regenerate DB types after schema changes

```bash
npm run db:types   # supabase gen types typescript --local > src/lib/database.types.ts
```

## Known local limitation (Windows) - FIXED by the Next 15 upgrade

Historical, kept because the workaround it explains is still in the code.

On Next 14, `npm run build` failed during static prerender of
`/opengraph-image` on Windows with `TypeError: Invalid URL` thrown from
`node_modules/next/dist/compiled/@vercel/og/index.node.js`. That bundled file
called `fileURLToPath(join(import.meta.url, ...))` to locate its default font
at ES module load time, and Node's `path.join` on Windows mangled a
`file://` URL into an invalid path. It ran before any application code, so it
could not be worked around from our side (see the writeup in
`src/lib/ogFont.ts`, which routes around the same bug for `npm run dev` by
loading the font ourselves). Vercel builds on Linux, where the bundled path
logic was correct, so production OG images were never affected.

Next 15 ships a newer bundled `@vercel/og` and the failure is gone: a full
`npm run build` on Windows now reaches `Generating static pages (113/113)`
and exits 0 with no export errors, `/opengraph-image` included. So the bar
for "a change hasn't introduced a new problem" is now simply that
`npm run build` succeeds. `src/lib/ogFont.ts` is left in place: it is
harmless, and it still covers the dev-server path.

## Data → revenue, honestly

- **Condition signal**: `home_systems` + `issues` (the ~80% of the value).
- **Revenue from day one**: `contractor_leads` — created when an owner requests
  a pro. No license/RESPA exposure.
- **Sell-intent**: kept in a separate `intent_signals` table with a
  `shared_consent` flag, so it's easy to govern. **Opt-in warm intros only** —
  see [PRIVACY.md](./PRIVACY.md).

## Notable decisions / TODOs

- **Ownership** is self-attested (`ownership_verified = true` on claim). Tighten
  later with a postcard or utility-bill check.
- **Parcel pre-fill** pulls real county-record facts (year built, sqft,
  beds/baths, lot, type) via RentCast once `RENTCAST_API_KEY` is set (free
  tier: 50 lookups/month); with no key the homeowner types facts in by hand.
  See `src/lib/parcel.ts` (`fetchFromRentcast`).
- **Current-year** is a static constant in `src/lib/health.ts` — bump per
  release (the scaffolding environment disallowed `Date.now()`).
- Lead **pricing** (`payout_amount`) and the agent-facing side are Phase 3.
# Hearth
