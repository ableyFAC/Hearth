# Partner referral codes

A partner is a person or business who sends OakTend traffic under an
arrangement of their own — as opposed to a post OakTend published itself. They
get a link, `https://oaktend.com/go/<code>`, and everything that follows from
it is automatic.

The first one is **Curtis Do**: `/go/curtis`.

> Do not confuse this with the user-to-user invite system. `users.referral_code`
> (migration 0102) is an account's **own** invite slug and `users.referred_by`
> is the neighbour who invited them. A partner campaign names a **source**, not
> a person, so it lives in its own column, `users.campaign_code`. Nothing here
> touches the invite system, and the invite system does not touch this.

## What happens when someone follows a partner link

1. **`/go/<code>`** (`src/app/go/[code]/route.ts`) checks the code against the
   frozen allowlist in `src/lib/campaigns.ts`, logs one `campaign_click` row in
   `public.app_events`, sets a 30-day first-party `httpOnly` cookie, and
   redirects. For `curtis` the destination is `/homeowner-signup`; for the
   social-calendar codes it is `/` or `/pros`.
   A code that is not on the allowlist redirects to `/` and is logged as the
   fixed literal `unknown_code`, never as the string the visitor typed. There is
   no pixel and no third-party tag anywhere in this path.
2. **Sign-up.** `recordTermsAcceptance` (`src/app/(auth)/recordTermsAcceptance.ts`)
   runs at the moment the account is created, from both the homeowner and the
   contractor flow. If the visitor still carries the cookie and the code is
   still on the allowlist, it:
   - logs a `campaign_signup` event, and
   - stamps `users.campaign_code` + `users.campaign_recorded_at` **once**
     (migration 0166).

   The stamp is filtered on `campaign_code is null`, so the **first** code wins
   and nothing ever overwrites it. That guarantee is a `WHERE` clause in the
   database, not a branch in TypeScript, because two entry points call this
   function for the same sign-up.
3. **Nothing else.** The code is not read anywhere in the product. It does not
   change pricing, gating, onboarding, or what anyone sees.

The cookie lasts 30 days; the column lasts as long as the account. That is the
whole reason the column exists — `app_events` is an analytics stream on a
retention schedule, and a commission conversation six months later cannot
depend on it.

## The two views

Both are created by migration 0166 and both are **service role only**: `anon`
and `authenticated` are revoked explicitly, so no browser session can read
them. Run them from the Supabase SQL editor.

| View | Columns | What one row means |
| --- | --- | --- |
| `public.campaign_signups_by_month` | `campaign_code`, `month`, `signups` | Accounts created in that month carrying that code. |
| `public.campaign_upgrades_by_month` | `campaign_code`, `month`, `upgrades` | Attributed accounts that reached a **paid** homeowner Plus subscription (`subscriptions.status = 'active'`, `side = 'homeowner'`). |

### The two queries

```sql
select * from public.campaign_signups_by_month where campaign_code = 'curtis' order by month;
```

```sql
select * from public.campaign_upgrades_by_month where campaign_code = 'curtis' order by month;
```

### Caveats worth knowing before quoting a number

- **Sign-up month is exact.** It comes from `campaign_recorded_at`, written in
  the same statement as the code.
- **Upgrade month is the *checkout* month, not the *first payment* month.**
  `public.subscriptions` has `created_at` (row first written) and `updated_at`
  (last webhook write, which moves on every renewal and cancellation), and
  neither one is "when this subscription first became paid" — the table has no
  such column. The view groups on `created_at` because it is stable; `updated_at`
  would silently re-bucket an account into a later month at its next renewal, so
  last month's number would change every time you ran it. For an account that
  started on a trial and converted later, the upgrade is therefore counted in
  the month it started, which is early by the trial length. If exact
  became-paid-at months are ever needed, that is a new column on
  `public.subscriptions` written by the Stripe webhook, not a change to the view.
- **`trialing` is not counted as an upgrade.** Only `active` — money that
  actually moved.
- **There is no backfill.** Anyone who used a partner link *before* migration
  0166 was pasted has `campaign_code` null. The `campaign_signup` rows in
  `app_events` are the only record of those.
- **Deleting an account removes its attribution.** `public.users.id` cascades
  from `auth.users`, so a deletion takes the whole row. Past months already
  reported will not match a re-run.

## Adding another partner

Two edits, no migration, no database change:

1. `src/lib/campaigns.ts` — add one entry to `PARTNER_CODES`:

   ```ts
   const PARTNER_CODES: Record<string, CampaignLink> = {
     curtis: { destination: "/homeowner-signup", channel: "partner", label: "Curtis Do referral" },
     newpartner: { destination: "/homeowner-signup", channel: "partner", label: "Their Name referral" },
   };
   ```

   The code must match `^[a-z0-9-]{2,32}$` (`CAMPAIGN_CODE_RE`) and the
   destination must be a same-site path starting with a single `/`. Only a
   **public** page is a sensible destination — `/homeowner-signup`, `/pros` and
   `/` are all reachable signed out (`isPublicPath` in
   `src/lib/supabase/middleware.ts`); a gated path would bounce the visitor to
   `/signin` and waste the click.

2. `src/lib/campaigns.test.ts` — add the code to the expected-keys list, so
   adding a partner stays a visible diff in two places.

Then add a row here:

| Code | Partner | Link | Destination | Live since |
| --- | --- | --- | --- | --- |
| `curtis` | Curtis Do | `/go/curtis` | `/homeowner-signup` | pending deploy + migration 0166 |

The allowlist is deliberately a literal object in source, not an environment
variable and not a database table. `trackServerEvent` inserts props raw, and
`campaign_code` is grouped by and pasted into a partner report, so the set of
strings that can reach either one is fixed at build time and reviewable in a
diff. Adding a partner is a code change on purpose.

## Where the numbers are *not*

`/api/health` is public and rate-limited. Business counts do not go on it, and
no page, dashboard, or API route exposes cross-account campaign totals. The two
views above are the entire reporting surface, and both need the service role.
