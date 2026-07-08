import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/contractor";
import { FOUNDER, LEAD_TIER_FEES, COLD_START_FREE_ALERTS } from "@/lib/constants";
import { AGING_LEAD_TIERS } from "@/lib/leadPricing";

// Marketing front door for contractors. Every claim here is a real product
// behavior (lead fee shown up front, aging markdowns, pay-per-apply wallet),
// so keep copy in sync with /pro and leadPricing.ts if those change.
export default async function ProsLanding() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Contractors go straight to their leads. Everyone else, including signed-in
  // homeowners, can read the pitch: bouncing them to the dashboard made this
  // page look like it demanded an account before showing anything.
  if (user && (await getRole()) === "contractor") {
    redirect("/pro");
  }

  // Aging discount sentence, built from the real tiers instead of a hardcoded
  // string, so a change to leadPricing.ts can never drift out of sync here.
  const agingCopy = [...AGING_LEAD_TIERS]
    .sort((a, b) => a.days - b.days)
    .map((t) => `${t.days}+ days old, ${t.off}% off`)
    .join("; ");

  const PROMISES = [
    {
      icon: "🏷️",
      title: "The price is on the job card",
      body: "Every open job shows its fee before you pay a cent. No blind bidding, no mystery invoices.",
    },
    {
      icon: "👆",
      title: "You only pay when you apply",
      body: "Browse everything for free. Your wallet is only charged for the jobs you choose to go after.",
    },
    {
      icon: "⏳",
      title: "Older jobs get cheaper",
      body: "Jobs that sit unclaimed are automatically marked down 15-30%, so patient pros get real deals.",
    },
    {
      icon: "⚡",
      title: "Instant job alerts, free for now",
      // COLD START: while COLD_START_FREE_ALERTS is on, every pro gets these
      // alerts free, worded the same as the perk on /pro/plus so the two
      // pages never contradict each other.
      body:
        "The moment a job posts in your trades and area, it hits your email and your phone." +
        (COLD_START_FREE_ALERTS
          ? " Included for every pro right now while Hearth is new."
          : " A Pro membership perk."),
    },
    {
      icon: "✅",
      title: "Free license verification",
      body: "We check your CSLB number against the state's public database and show homeowners a verified badge on your profile. Free, no membership needed.",
    },
    {
      icon: "🚫",
      title: "No subscription required",
      body: "Load your wallet with deposits from $5 and pay per application. An optional Pro membership adds perks like bonus credit and an AI back office, but it never changes which jobs you can see or apply to.",
    },
  ];

  const STEPS = [
    { n: "1", text: "Set up your company in about a minute." },
    { n: "2", text: "Browse open jobs with the fee shown on every card." },
    { n: "3", text: "Apply only to the ones you want." },
  ];

  return (
    <main className="pb-16">
      {/* Warm gradient band wraps header and hero */}
      <div className="bg-gradient-to-b from-hearth-50 via-white to-white">
        <div className="mx-auto max-w-3xl px-6 pt-6">
          <header className="flex items-center justify-between">
            <a
              href="/"
              className="flex items-center gap-2 font-semibold text-stone-900"
            >
              <span aria-hidden>🏡</span> Hearth
            </a>
            <a
              href="/"
              className="text-sm text-stone-500 hover:text-hearth-700"
            >
              For homeowners →
            </a>
          </header>

          {/* Hero */}
          <div className="mt-14 flex flex-col items-center pb-4 text-center">
            <div className="mb-4 text-4xl" aria-hidden>
              🛠️
            </div>
            <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-stone-900 sm:text-6xl">
              Leads without the games.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-stone-600">
              Tired of lead sites that charge you for shared leads you never
              asked for? On Hearth you see the price first, and you only pay
              when you choose to apply.
            </p>
            <a
              href="/contractor-signup"
              className="btn-primary mt-8 px-6 py-3 text-base shadow-md"
            >
              Create your pro account
            </a>
            <a
              href="/signin"
              className="mt-3 text-sm text-hearth-700 hover:underline"
            >
              Already have an account? Sign in
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6">
      {/* Ghost protection and the first-application guarantee get top
          billing, side by side: they are the two promises no lead-platform
          competitor keeps. */}
      <div className="mt-14 grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-hearth-200 bg-hearth-50 p-6 text-center shadow-sm">
          <div className="text-3xl" aria-hidden>
            👻
          </div>
          <h2 className="mt-2 text-xl font-semibold text-stone-900">
            Ghost protection: if the lead is dead, you don&apos;t pay.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">
            If a homeowner never responds within 7 days, your apply fee comes
            back to your wallet automatically. No request form, no support
            ticket, no arguing.
          </p>
        </section>
        <section className="rounded-2xl border border-hearth-200 bg-hearth-50 p-6 text-center shadow-sm">
          <div className="text-3xl" aria-hidden>
            🎟️
          </div>
          <h2 className="mt-2 text-xl font-semibold text-stone-900">
            Your first application is guaranteed.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">
            Not chosen: the fee comes back as wallet credit, automatically.
            One time, for licensed pros.
          </p>
        </section>
      </div>

      {/* Who's behind this: founder identity is the trust signal a national
          lead platform can never offer. Details are owner-fillable in
          src/lib/constants.ts; until they're filled in, this stays honest and
          generic instead of showing a placeholder name. */}
      <section className="mt-6 rounded-2xl bg-stone-900 px-6 py-8 text-center">
        <div className="text-3xl" aria-hidden>
          👋
        </div>
        <h2 className="mt-2 text-xl font-semibold text-white">
          Who&apos;s behind this
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-stone-300">
          {FOUNDER.name
            ? `Hearth is built by ${FOUNDER.name}, one person${
                FOUNDER.city ? `, based in ${FOUNDER.city}` : ""
              }. No call center, no sales team.`
            : "Hearth is built by one local founder, not a corporation. You will talk to the same person every time."}
        </p>
        {FOUNDER.name && FOUNDER.cellPhone && (
          <p className="mt-1 text-sm text-stone-300">
            Cell: {FOUNDER.cellPhone}
          </p>
        )}
        {/* The in-app help page requires an onboarded contractor account, so
            it is exactly wrong for the signed-out prospective pros this page
            targets. Contact renders only from owner-fillable FOUNDER fields:
            an email (mailto) or phone (tel), and NOTHING when both are blank:
            no link beats a link that bounces to /signin. */}
        {FOUNDER.email ? (
          <a
            href={`mailto:${FOUNDER.email}`}
            className="mt-4 inline-block text-sm text-hearth-300 hover:underline"
          >
            Questions? Email {FOUNDER.email} →
          </a>
        ) : FOUNDER.cellPhone ? (
          <a
            href={`tel:${FOUNDER.cellPhone.replace(/[^\d+]/g, "")}`}
            className="mt-4 inline-block text-sm text-hearth-300 hover:underline"
          >
            Questions? Call or text {FOUNDER.cellPhone} →
          </a>
        ) : null}
      </section>

      {/* The promises */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        {PROMISES.map((p) => (
          <div key={p.title} className="card">
            <div className="icon-chip" aria-hidden>
              {p.icon}
            </div>
            <h2 className="mt-3 font-semibold text-stone-900">{p.title}</h2>
            <p className="mt-1 text-sm text-stone-600">{p.body}</p>
          </div>
        ))}
      </section>

      {/* Pricing, in writing: the real per-category fees and the real aging
          markdown, both read straight from src/lib/constants.ts and
          src/lib/leadPricing.ts so this section can never drift from what
          checkout actually charges. */}
      <section className="mt-16 rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">
          The price, in writing
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">
          ${LEAD_TIER_FEES.light} light work, ${LEAD_TIER_FEES.skilled}{" "}
          skilled trades, ${LEAD_TIER_FEES.major} big-ticket jobs, printed on
          every job card before you pay.
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">
          Jobs that sit unclaimed get cheaper: {agingCopy}.
        </p>
      </section>

      {/* Single-player value: worth having even before the first job comes
          in. Every item here is verified against the shipped feature, and
          the AI back office is labeled honestly as a Pro membership perk
          rather than lumped in as free. */}
      <section className="mt-16">
        <h2 className="text-center text-2xl font-semibold text-stone-900">
          Worth it even before your first job
        </h2>
        <div className="mx-auto mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
          <div className="card">
            <div className="icon-chip" aria-hidden>
              🌐
            </div>
            <h3 className="mt-3 font-semibold text-stone-900">
              A free public profile page
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              Your own shareable page with your services and real Hearth
              reviews, built to rank on Google. Every pro gets one, free, no
              membership required.
            </p>
          </div>
          <div className="card">
            <div className="icon-chip" aria-hidden>
              ✅
            </div>
            <h3 className="mt-3 font-semibold text-stone-900">
              A free CSLB-verified badge
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              We check your license number against the state database and
              show it on that same page. Free, not a membership perk.
            </p>
          </div>
          <div className="card">
            <div className="icon-chip" aria-hidden>
              📅
            </div>
            <h3 className="mt-3 font-semibold text-stone-900">
              A compliance calendar
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              Upload your license and insurance once and get a heads up
              before either one expires. Free for every pro.
            </p>
          </div>
          <div className="card">
            <div className="icon-chip" aria-hidden>
              📇
            </div>
            <h3 className="mt-3 font-semibold text-stone-900">
              A simple CRM
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              Track every lead through quoted, won, and lost, with notes and
              a follow-up date. Free for every pro.
            </p>
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-md text-center text-sm text-stone-500">
          Hearth Pro membership adds an AI back office on top: estimates
          drafted from your own past invoices, review replies, and
          overdue-invoice reminders.{" "}
          <a href="/pro/plus" className="text-hearth-700 hover:underline">
            See what&apos;s included
          </a>
          .
        </p>
      </section>

      {/* How it works */}
      <section className="mt-16">
        <h2 className="text-center text-2xl font-semibold text-stone-900">
          How it works
        </h2>
        <ol className="mx-auto mt-6 max-w-md space-y-4">
          {STEPS.map((s) => (
            <li key={s.n} className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hearth-600 text-sm font-semibold text-white">
                {s.n}
              </span>
              <p className="pt-0.5 text-stone-600">{s.text}</p>
            </li>
          ))}
        </ol>
        {/* The honest deal: every line here is a real, shipped product rule
            (3-spot cap, ghost refunds, first-apply guarantee, aging tiers,
            pay-per-apply). Restyled from claims elsewhere on this page; add
            nothing here that isn't true in code. */}
        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-stone-200 bg-stone-50 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            The honest deal
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-stone-600">
            <li className="flex items-start gap-2">
              <span aria-hidden>✔️</span>
              <span>Max 3 pros per job, so you never race a crowd.</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden>✔️</span>
              <span>
                Ghost protection: if the homeowner never responds, your fee
                comes back automatically.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden>✔️</span>
              <span>
                Your first application is guaranteed: not chosen, and the fee
                comes back as wallet credit. One time, for licensed pros.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden>✔️</span>
              <span>Jobs that sit unclaimed get marked down 15-30%.</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden>✔️</span>
              <span>No subscription required. You pay per application.</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Honesty line: this matches the wallet's actual bonus terms */}
      <p className="mx-auto mt-12 max-w-md text-center text-xs text-stone-500">
        Deposits of $200+ earn bonus credit. Bonus credit expires 60 days after
        each grant, so plan to use it.
      </p>

      <footer className="mt-16 border-t border-stone-200 pt-6 text-center">
        <a href="/" className="text-sm text-stone-500 hover:text-hearth-700">
          Looking after your own home instead? Hearth for homeowners →
        </a>
        <p className="mt-2 text-xs text-stone-500">
          <a href="/privacy" className="hover:text-hearth-700 hover:underline">
            Privacy
          </a>{" "}
          ·{" "}
          <a href="/terms" className="hover:text-hearth-700 hover:underline">
            Terms
          </a>
        </p>
      </footer>
      </div>
    </main>
  );
}
