# RentCast: the free tier, and how not to spend it

RentCast (<https://www.rentcast.io/api>) is the property-records source behind
onboarding's auto-fill and the home-value estimate. The account is on the
**free tier: 50 calls per month**, and the paid tier is waiting on the business
credit card. That single number is what shapes every design decision in this
area, so it is worth stating plainly: a busy afternoon of retries can lock out
auto-fill for every homeowner for the rest of the month.

Set `RENTCAST_API_KEY` in the environment to enable it. Without a key nothing
is looked up, no call is made, and onboarding falls back to manual entry — that
is a supported state, not a broken one.

## How many calls are left this month

Run this in the Supabase SQL editor:

```sql
select * from public.rentcast_usage_monthly order by month desc;
```

One row per month per endpoint (`property` = `/v1/properties`, `avm` =
`/v1/avm/value`) with the number of **real outbound calls**. Cache hits are not
counted, because they are not calls — this view answers "what did we spend?",
not "how many lookups happened".

It reads `app_events` rows with `event = 'rentcast_call'`, written by
`rentcastRequest` in `src/lib/parcel.ts`. Each row's props carry the endpoint,
the HTTP status (or `"network"` for a timeout or dead socket) and whatever
rate-limit headers the response actually exposed.

The view is **service-role only** — it is not on `/api/health`, which is public
and rate-limited, and there is no admin page in this app to hang it off. The
SQL above is the interface.

## Where the calls come from

Every outbound call in the app goes through one function, `rentcastRequest` in
`src/lib/parcel.ts`. There is no second path.

| Surface | Calls | Notes |
| --- | --- | --- |
| Onboarding "Continue" (`lookupParcelAction`) | `property` | Rate-limited 10/hour and 25/day per user |
| Claim (`claimPropertyAction`) | `property` | Same buckets; usually a cache hit from the step before |
| First job post's ownership re-check | `property` | `src/app/(app)/contractors/actions.ts` |
| `/value` first estimate (`fetchAndSaveMarketValueAction`) | `avm` | Free for everyone, once per home |
| `/value` manual refresh (`refreshMarketValueAction`) | `avm` | Plus only, and floored at 24 hours |

The dashboard, `/taxes`, the tax-appeal route and the home-digest cron do **not**
call RentCast at all: they read the values already stored on the `properties`
row.

## The two caches, and why there are two

- **`parcel_cache`** (migration 0071) caches the *derived facts* — a
  `ParcelFacts` / `MarketValueFacts` blob. It deliberately never stores a
  non-answer, because a 401 or a 5xx says nothing about an address and freezing
  it would put "we couldn't reach the county records" in front of a real home
  for a whole cache window.
- **`rentcast_cache`** (migration 0167) sits underneath it at the network
  boundary and caches the *call*. It stores the non-answers too, which is the
  point: without it, an outage or an exhausted quota meant one billed call per
  page load.

Time to live, in `rentcast_cache`:

| Kind | Status | Served for |
| --- | --- | --- |
| `property` | `ok` | forever (a parcel's year built and lot size do not change) |
| `property` | `not_found` | 90 days (coverage improves, so a miss is re-asked once a season) |
| `avm` | `ok`, `not_found` | 30 days |
| either | `quota`, `error` | 1 hour |

Plus one shorter window that is not a cache TTL: the manual "Refresh estimate"
button re-fetches only if the last `avm` call is **older than 24 hours**, and
otherwise shows the stored number with "Updated &lt;when&gt;".

Rows are keyed on `address_key` — the app's normalized address line plus ZIP
(and, for an `avm` only, the unit), produced by `rentcastAddressKey` in
`src/lib/rentcastCache.ts` from the same normalizers the onboarding confirm
step uses (`houseNumberOf` / `streetTokensOf`, `src/lib/addressMatch.ts`). So
"1770 South Harbor Boulevard" and "1770 S Harbor Blvd" are one cached call, and
two members of the same household looking up the same home share a row.

## Calls that are never made at all

- **The address is already claimed.** If a `properties` row exists for the same
  normalized address (any owner), onboarding copies the building's public shape
  off it — year built, size, beds, lot — and calls nothing. Purchase price,
  assessed value and owner of record are **not** copied: those describe a
  transaction and a household, not a building.
- **The account is internal.** Staff, demo and test accounts skip the lookup
  and land on manual entry with the same note anyone else gets on a miss. They
  are never refused. (Read via `users.is_internal`; see
  `isInternalUserForRentcast` in `src/lib/parcel.ts`, which is meant to be
  replaced by `src/lib/internalAccounts.ts` once that lands.)

## Failure policy

One attempt, 6 seconds, **no retry** — including on 429, 5xx and network
failures. Every failure returns a typed miss (`quota` / `not_found` / `error`)
and never throws at a caller. A miss means the homeowner fills the boxes in
themselves, with one line on the confirm step:

> We couldn't auto-fill this address, please enter the basics.

The earlier policy retried once on a connection failure, which was measured and
real (2026-08-28: two of eight live calls never opened a socket and both
succeeded on retry). It was reversed because a retry doubles the worst case of
every failure mode against a budget of fifty. A rescued call costs one
homeowner some typing; a burnt month costs all of them the feature.

## Not verified yet

Which rate-limit headers RentCast actually returns has **not** been confirmed
against the live API — no request has been made from this work. The code reads
`res.headers` and logs every header whose name matches `x-ratelimit-*` or
`ratelimit-*`, surfacing `*-remaining` and `*-reset` as their own fields, and
records nothing extra if RentCast exposes none. Check the first few
`rentcast_call` rows after go-live to see what actually arrives:

```sql
select created_at, props from public.app_events
where event = 'rentcast_call'
order by created_at desc limit 20;
```
