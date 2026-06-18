# Privacy commitments (starter)

> This is engineering scaffolding for a real policy — **have counsel review it
> before launch.** You're in California, so CCPA/CPRA applies, and you collect
> personal + property data you intend to monetize.

## The principle

The homeowner is the customer, not the product. We are upfront about what we
collect and we never quietly sell "this owner's house has problems" behind their
back. Anything shared with a real-estate agent happens only as an **opt-in,
permissioned warm intro** that the owner knowingly agreed to.

## What we collect

- **Account**: email and/or phone (for sign-in), name.
- **Home facts**: address, parcel data, year built, size, beds/baths — partly
  pre-filled from public records.
- **Condition**: systems inventory, reported issues, photos, maintenance history.
- **Service requests**: contractor lead details you submit.
- **Intent (optional)**: stay timeline, valuation interest, selling
  consideration — only what you choose to answer.

## How it's used

| Data | Use |
|---|---|
| Account + home facts | Run your home profile and reminders |
| Condition + issues | Power your dashboard and (with consent) the agent signal |
| Service requests | Shared with the **specific vetted pro** you request, to quote the job — nothing more |
| Intent signals | Stored separately; shared with an agent **only** when `shared_consent = true` |

## Consent model (how it's enforced in code)

- `intent_signals.shared_consent` (boolean, default **false**) gates every
  agent-facing use of sell-intent. No consent → not shareable. Full stop.
- Row-Level Security ensures one owner can never read another's data.
- Contractor leads share only name, address, and the request — never the broader
  condition profile.

## Your rights (CCPA/CPRA)

- Know what we hold, request a copy, and request deletion.
- Opt out of any sharing — including withdrawing a previously granted
  `shared_consent`.
- We will not discriminate against you for exercising these rights.

## No dark patterns

Intent capture is optional and honestly labeled. A homeowner who trusts us is
worth far more than one coerced data point.

_Contact: privacy@<yourdomain>._
