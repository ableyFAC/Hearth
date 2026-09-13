# Internal / test accounts

How the OakTend team's own test accounts are kept invisible to real users.

Shipped as migration `0165_internal_accounts.sql` (Landen request E4,
2026-09-12). Paste file:
`supabase/PASTE-ME-0165-internal-accounts-2026-09-12.sql`.

## The rule

**Internal sees internal, real sees only real.**

- An internal homeowner's open jobs and direct requests reach **internal pros
  only**. A real homeowner's reach **real pros only**.
- An internal contractor is listed, profiled and reviewable **only for an
  internal homeowner**. A real contractor only for a real homeowner.
- An anonymous visitor is never internal, so the public web (`/p/<id>`, its
  OG card, the embeddable widget, the sitemap) only ever sees real pros.
- **Nothing is hidden from an account about itself.** An internal pro still
  reads their own contractors row, their own leads, chats and wallet, and
  their own `/p/<id>` still renders. The flag only ever filters the other side.

Nothing about the product changes for real users, and nothing visible changes
for the internal accounts either. There is no badge, no banner, no copy.

### Why symmetric

The obvious half is "hide test accounts from real users". The second half -
hiding real users from test accounts - is needed because the money functions
refuse a cross-internal pairing in **both** directions: an internal pro must
not pay real wallet money for a real homeowner's job either. A board that
listed jobs the viewer cannot apply to would be worse than one that lists
nothing. The same argument runs on the homeowner side: an internal homeowner
who could still see real pros could still send one a direct request.

## Marking an account

Service role only. Run it in the Supabase SQL editor, which connects as a
platform role and is therefore waved through the `users_column_lock` trigger.

```sql
-- MARK an account (and any pro row it owns) internal
update public.users set is_internal = true where email = 'someone@oaktend.test';
update public.contractors c set is_internal = true
  from public.users u where u.id = c.user_id and u.is_internal;
```

```sql
-- UNMARK (turn a test account back into a real one)
update public.users set is_internal = false where email = 'someone@oaktend.test';
update public.contractors c set is_internal = false
  from public.users u where u.id = c.user_id and not u.is_internal;
```

```sql
-- AUDIT what is currently internal
select u.id, u.email, u.is_internal, c.id as contractor_id, c.is_internal
  from public.users u
  left join public.contractors c on c.user_id = u.id
 where u.is_internal or c.is_internal;
```

`contractors.is_internal` **follows the owning user**. Two triggers keep it
that way:

- `contractors_internal_follows_user` (BEFORE INSERT on `contractors`) stamps
  a new pro row from the owning user's flag, so a test pro created later from
  an internal account is internal automatically.
- `users_internal_propagates` (AFTER UPDATE OF `is_internal` on `users`)
  carries a flip through to every contractors row that account owns.

So the second statement in each block above is belt-and-braces - a no-op when
the triggers did their job, and the repair for rows that predate the flag.
**Do not set `contractors.is_internal` on its own** and expect it to stick: the
next change to that user's flag overwrites it.

## Where it is enforced

Almost entirely in the database, so it holds for a direct PostgREST call with
the anon key and a session token, not just for the app's own screens.

| Object | Source migration | What 0165 added |
| --- | --- | --- |
| `open_jobs_for_me()` | 0161 | `and public.is_internal_user(pr.user_id) = public.is_internal_user(auth.uid())` |
| `my_direct_requests()` | 0116 | same predicate |
| `browse_pros()` | 0154 | `and coalesce(c.is_internal, false) = public.is_internal_user(auth.uid())` |
| `public_pro_profile()` | 0155 | same predicate |
| `contractor_reviews()` | 0138 | same predicate, inside its EXISTS |
| `"contractors read"` policy | 0069 | same predicate, on the `contractor_related_to_me` arm only |
| `apply_to_lead()` | 0161 | guard clause, before any wallet read |
| `unlock_direct_request()` | 0153 | guard clause, before `get_or_create_wallet` |
| `choose_applicant()` | 0107 | guard clause, before the lead is locked |
| `enforce_users_column_lock()` | 0139 | `'is_internal'` in the LOCKED list |

Each one is the **latest** body in `supabase/migrations`, copied byte-for-byte,
plus exactly one predicate or one guard clause.

Because `public_pro_profile()` returns `null` for a pro the caller may not see,
all three public surfaces fall over to their existing not-found paths with no
app change: `/p/<id>` calls `notFound()`, its `opengraph-image` renders the
generic branded card, and `/api/pro-widget/<id>` returns 404.

The three refusals raise a deliberately vague message ("This job is not
available to you.", the same wording blocking uses) so the error cannot be used
to probe which accounts are internal. The machine-readable marker rides in the
error's `HINT` field as `internal_account`.

### The app-side half

RLS and the RPCs cover every **session-client** read. The handful of surfaces
that read through the **admin client** bypass RLS entirely and had to be
filtered by hand, via `src/lib/internalAccounts.ts`:

- `src/app/sitemap.ts` - `.eq("is_internal", false)`, with a retry that drops
  the filter if the column is not there yet.
- `src/lib/proAlerts.ts` (`alertProsForNewLead`) - the new-lead email/SMS/in-app
  fan-out matches the pro's flag against the poster's.
- `src/app/(app)/contractors/actions.ts` - the two "nudge matching pros" blocks
  (`postJobAction`, the rehire path) do the same, and `requestProAction`
  refuses to create a cross-internal direct request in the first place.

`src/lib/internalAccounts.ts` never throws and answers **false / empty** on any
failure, including a database that has not run 0165 yet. That is the pre-0165
behaviour (nobody is internal, nothing is filtered) and it means a DB hiccup
can never hide real pros from real homeowners.

## Security notes

Both columns are **service role only**, and that is the control the whole
feature rests on - an account that could clear its own flag would walk straight
back into the real marketplace.

- `users.is_internal` is in `enforce_users_column_lock()`'s LOCKED array
  (0139's trigger), so a session PATCH that changes it raises `42501`.
- `contractors.is_internal` is granted to nobody. 0069 revoked table-level
  SELECT on `contractors` and re-granted it column-scoped; 0085 (widened by
  0098 / 0124 / 0128 / 0141) did the same for INSERT/UPDATE. A column in none
  of those lists is neither readable nor writable by `authenticated` or `anon`.
  0165 grants nothing, exactly as 0164 did for the Stripe Connect columns.

The `"contractors read"` policy still *references* `is_internal`. That is not a
hole: an RLS policy expression is evaluated by the system, not by the querying
role, so column privileges never apply to it.

## Known gaps

- The **`"leads contractor select"` policy (0005) is deliberately untouched.**
  It is what a pro's own accepted leads, contacts and chats hang off, and it
  only ever matches leads already assigned to that pro. A cross-internal
  assignment can no longer be created, so the only rows it could hide are ones
  that predate the flag - and hiding those would break a job already in flight.
- `browse_pros()` is still `EXECUTE`-able by `anon`: 0123 revoked that and 0154
  re-granted it. 0165 does not change the grant (it is out of scope), but the
  new predicate means an anonymous call can no longer return a test pro.
