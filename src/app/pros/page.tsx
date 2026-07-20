import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/contractor";
import {
  FOUNDER,
  FOUNDER_CREDIT,
  LEAD_TIER_FEES,
  COLD_START_FREE_ALERTS,
} from "@/lib/constants";
import { AGING_LEAD_TIERS } from "@/lib/leadPricing";
import Logo from "@/components/Logo";
import {
  Tag,
  MousePointerClick,
  Hourglass,
  Zap,
  Ban,
  Globe,
  CalendarDays,
  Contact,
} from "lucide-react";

// Inline check mark. Emoji checks (✔️/✅) render differently per OS; one SVG
// keeps every check on this page identical. Color comes from text-green-700
// via currentColor.
function Check({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4 10.5 4 4 8-9" />
    </svg>
  );
}

// Canonical first-application guarantee sentence. Used verbatim everywhere the
// guarantee is described on this page so the terms can never drift.
const FIRST_APPLICATION_GUARANTEE =
  "Not chosen on your first application? The fee comes back as credit you can spend on any job within 60 days.";

export const metadata: Metadata = {
  title: "Hearth for Pros: local leads without the games",
  description:
    "Browse local jobs free and pay only when you apply, with the price on every card. No subscription required, no ghost leads, and free license-verified badges for California pros.",
};

// Marketing front door for contractors. Every claim here is a real product
// behavior (lead fee shown up front, aging markdowns, pay-per-apply wallet),
// so keep copy in sync with /pro and leadPricing.ts if those change.
export default async function ProsLanding({
  searchParams,
}: {
  searchParams?: { ref?: string };
}) {
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

  // Referral threading: a ?ref=CODE on this page rides the sign-up CTA into
  // /contractor-signup, which carries it on to /pro/onboarding (the page that
  // actually redeems it). Trimmed and URL-encoded; nothing else changes here.
  const ref =
    typeof searchParams?.ref === "string" && searchParams.ref.trim()
      ? searchParams.ref.trim()
      : null;
  const signupHref = ref
    ? `/contractor-signup?ref=${encodeURIComponent(ref)}`
    : "/contractor-signup";

  // Aging discount sentence, built from the real tiers instead of a hardcoded
  // string, so a change to leadPricing.ts can never drift out of sync here.
  const agingCopy = [...AGING_LEAD_TIERS]
    .sort((a, b) => a.days - b.days)
    .map((t) => `${t.days}+ days old, ${t.off}% off`)
    .join("; ");

  const PROMISES = [
    {
      icon: <Tag className="h-5 w-5" />,
      title: "The price is on the job card",
      body: "Every open job shows its fee before you pay a cent. No blind bidding, no mystery invoices.",
    },
    {
      icon: <MousePointerClick className="h-5 w-5" />,
      title: "You only pay when you apply",
      body: "Browse everything for free. Your wallet is only charged for the jobs you choose to go after.",
    },
    {
      icon: <Hourglass className="h-5 w-5" />,
      title: "Older jobs get cheaper",
      body: "Jobs that sit unclaimed are automatically marked down 15-30%, so patient pros get real deals.",
    },
    {
      icon: <Zap className="h-5 w-5" />,
      // COLD START: while COLD_START_FREE_ALERTS is on, every pro gets these
      // alerts free, worded the same as the perk on /pro/plus so the two
      // pages never contradict each other. Title flips with the flag so it
      // can never say "free" while the body says "membership perk".
      title: COLD_START_FREE_ALERTS
        ? "Instant job alerts, free for now"
        : "Instant job alerts",
      body:
        "The moment a job posts in your trades and area, it hits your email and your phone." +
        (COLD_START_FREE_ALERTS
          ? " Free for every pro while Hearth is new. Later, a Pro membership perk."
          : " A Pro membership perk."),
    },
    {
      icon: <Check className="h-5 w-5 text-green-700 dark:text-green-400" />,
      title: "Free license verification",
      body: "We check your CSLB number against the state's public database and show homeowners a verified badge on your profile. Free, no membership needed.",
    },
    {
      icon: <Ban className="h-5 w-5" />,
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
      {/* Warm band wraps header and hero: a single flat fill, hearth-50 in
          light and stone-900 in dark (matching the body), no gradient. */}
      <div className="bg-hearth-50 dark:bg-stone-900">
        <div className="mx-auto max-w-3xl px-6 pt-6">
          <header className="flex items-center justify-between">
            <a
              href="/"
              className="inline-flex items-center gap-2 font-semibold text-stone-900 dark:text-stone-100"
            >
              <Logo className="h-6 w-6 text-hearth-700 dark:text-hearth-400" /> Hearth
            </a>
            {/* Same bordered-button treatment as the landing page's "Hearth
                for Pros" cross-link, so the two doors read as one system. */}
            <a
              href="/"
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:border-hearth-400 hover:text-hearth-700 dark:border-white/10 dark:text-stone-300 dark:hover:border-hearth-400 dark:hover:text-hearth-300"
            >
              For Homeowners
            </a>
          </header>

          {/* Hero */}
          <div className="mt-14 flex flex-col items-center pb-4 text-center">
            <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-stone-900 sm:text-6xl dark:text-stone-100">
              Leads without the games
            </h1>
            <p className="mt-5 max-w-xl text-lg text-stone-600 dark:text-stone-400">
              Tired of lead sites that charge you for shared leads you never
              asked for? On Hearth you see the price first, and you only pay
              when you choose to apply.
            </p>
            <a
              href={signupHref}
              className="btn-primary mt-8 px-6 py-3 text-base shadow-md"
            >
              Create your pro account
            </a>
            <a
              href="/signin"
              className="mt-3 text-sm text-hearth-700 hover:underline dark:text-hearth-300"
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
        <section className="rounded-2xl border border-hearth-200 bg-hearth-50 p-6 text-center shadow-sm dark:border-hearth-900 dark:bg-hearth-900/20">
          <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
            Ghost protection: if the lead is dead, you get your fee back.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-600 dark:text-stone-400">
            If a homeowner doesn&apos;t respond within 7 days, your apply fee
            comes back to your wallet automatically. No request form, no
            support ticket, no arguing.
          </p>
        </section>
        <section className="rounded-2xl border border-hearth-200 bg-hearth-50 p-6 text-center shadow-sm dark:border-hearth-900 dark:bg-hearth-900/20">
          <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
            Your first application is protected.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-600 dark:text-stone-400">
            {FIRST_APPLICATION_GUARANTEE} Licensed pros get this once.
          </p>
        </section>
      </div>

      {/* Who's behind this: founder identity is the trust signal a national
          lead platform can never offer. Details are owner-fillable in
          src/lib/constants.ts; until they're filled in, this stays honest and
          generic instead of showing a placeholder name. */}
      <section className="mt-6 rounded-2xl bg-stone-900 px-6 py-8 text-center dark:bg-stone-950 dark:border dark:border-white/10">
        <h2 className="text-xl font-semibold text-white">
          Who&apos;s behind this
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-stone-300">
          {FOUNDER_CREDIT
            ? `Hearth is built by ${FOUNDER_CREDIT}. Real people, real answers: email us and we'll reply ourselves.`
            : "Hearth is built by homeowners in Orange County. Real people, real answers."}
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
            <h2 className="mt-3 font-semibold text-stone-900 dark:text-stone-100">{p.title}</h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{p.body}</p>
          </div>
        ))}
      </section>

      {/* Pricing, in writing: the real per-category fees and the real aging
          markdown, both read straight from src/lib/constants.ts and
          src/lib/leadPricing.ts so this section can never drift from what
          checkout actually charges. */}
      <section className="card mt-16 p-6 text-center">
        <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
          The price, in writing
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-stone-600 dark:text-stone-400">
          ${LEAD_TIER_FEES.light} light work (handyman, cleaning, painting).
          ${LEAD_TIER_FEES.skilled} skilled trades (plumbing, electrical,
          HVAC). ${LEAD_TIER_FEES.major} big-ticket jobs (roofing,
          remodeling). The fee is printed on every job card before you pay.
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-stone-600 dark:text-stone-400">
          Jobs that sit unclaimed get cheaper: {agingCopy}.
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-stone-600 dark:text-stone-400">
          Wallet deposits can&apos;t be cashed back out: they can only be
          spent on applications, and they never expire. Refunds from ghost
          protection go back into that same wallet.
        </p>
      </section>

      {/* Single-player value: worth having even before the first job comes
          in. Every item here is verified against the shipped feature, and
          the AI back office is labeled honestly as a Pro membership perk
          rather than lumped in as free. */}
      <section className="mt-16">
        <h2 className="text-center text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Worth it even before your first job
        </h2>
        <div className="mx-auto mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
          <div className="card">
            <div className="icon-chip" aria-hidden>
              <Globe className="h-5 w-5" />
            </div>
            <h3 className="mt-3 font-semibold text-stone-900 dark:text-stone-100">
              A free public profile page
            </h3>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Your own shareable page with your services and real Hearth
              reviews, built to rank on Google. Every pro gets one, free, no
              membership required.
            </p>
          </div>
          <div className="card">
            <div className="icon-chip" aria-hidden>
              <Check className="h-5 w-5 text-green-700 dark:text-green-400" />
            </div>
            <h3 className="mt-3 font-semibold text-stone-900 dark:text-stone-100">
              A free CSLB-verified badge
            </h3>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              We check your license number against the state database and
              show a verified badge on your public profile page. Free, not a
              membership perk.
            </p>
          </div>
          <div className="card">
            <div className="icon-chip" aria-hidden>
              <CalendarDays className="h-5 w-5" />
            </div>
            <h3 className="mt-3 font-semibold text-stone-900 dark:text-stone-100">
              A compliance calendar
            </h3>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Upload your license and insurance once and get a heads-up
              before either one expires. Free for every pro.
            </p>
          </div>
          <div className="card">
            <div className="icon-chip" aria-hidden>
              <Contact className="h-5 w-5" />
            </div>
            <h3 className="mt-3 font-semibold text-stone-900 dark:text-stone-100">
              A simple CRM
            </h3>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Track every lead through quoted, won, and lost, with notes and
              a follow-up date. Free for every pro.
            </p>
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-md text-center text-sm text-stone-500 dark:text-stone-400">
          A Pro membership adds an AI back office on top: draft estimates,
          invoices, follow-up messages, review replies, and overdue-invoice
          reminders in seconds.{" "}
          <a href="/pro/plus" className="text-hearth-700 hover:underline dark:text-hearth-300">
            See what&apos;s included
          </a>
          .
        </p>
      </section>

      {/* How it works */}
      <section className="mt-16">
        <h2 className="text-center text-2xl font-semibold text-stone-900 dark:text-stone-100">
          How it works
        </h2>
        <ol className="mx-auto mt-6 max-w-md space-y-4">
          {STEPS.map((s) => (
            <li key={s.n} className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hearth-600 text-sm font-semibold text-white">
                {s.n}
              </span>
              <p className="pt-0.5 text-stone-600 dark:text-stone-400">{s.text}</p>
            </li>
          ))}
        </ol>
        {/* The honest deal: every line here is a real, shipped product rule
            (3-spot cap, ghost refunds, first-apply guarantee, aging tiers,
            pay-per-apply). Restyled from claims elsewhere on this page; add
            nothing here that isn't true in code. */}
        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-stone-200 bg-stone-50 p-5 dark:border-white/10 dark:bg-stone-800">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            The honest deal
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-stone-600 dark:text-stone-400">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-700 dark:text-green-400" />
              <span>
                Max 3 pros per job, so you never race a crowd. If the
                homeowner picks another pro, that fee is spent, like any bid
                you don&apos;t win.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-700 dark:text-green-400" />
              <span>
                Ghost protection: if the homeowner doesn&apos;t respond
                within 7 days, your fee comes back automatically.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-700 dark:text-green-400" />
              <span>
                {FIRST_APPLICATION_GUARANTEE} Licensed pros get this once.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-700 dark:text-green-400" />
              <span>Jobs that sit unclaimed get marked down 15-30%.</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-700 dark:text-green-400" />
              <span>No subscription required. You pay per application.</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Honesty line: this matches the wallet's actual bonus terms */}
      <p className="mx-auto mt-12 max-w-md text-center text-xs text-stone-500 dark:text-stone-400">
        Deposits of $200 or more earn bonus credit on top. Bonus credit
        expires 60 days after you get it. The money you deposited never
        expires.
      </p>

      <footer className="mt-16 border-t border-stone-200 pt-6 text-center dark:border-white/10">
        <a href="/" className="text-sm text-stone-500 hover:text-hearth-700 dark:text-stone-400 dark:hover:text-hearth-300">
          Looking after your own home instead? Hearth for Homeowners →
        </a>
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          <a href="/privacy" className="hover:text-hearth-700 hover:underline dark:hover:text-hearth-300">
            Privacy
          </a>{" "}
          ·{" "}
          <a href="/terms" className="hover:text-hearth-700 hover:underline dark:hover:text-hearth-300">
            Terms
          </a>
        </p>
      </footer>
      </div>
    </main>
  );
}
