import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/contractor";

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
      icon: "🚫",
      title: "No subscription required",
      body: "Load your wallet with deposits from $5 and pay per application. An optional Pro membership adds perks like bonus credit and instant alerts, but it never changes which jobs you can see or apply to.",
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
      {/* Ghost protection gets top billing: it is the promise no competitor
          keeps, so it stands alone above the grid. */}
      <section className="mt-14 rounded-2xl border border-hearth-200 bg-hearth-50 p-6 text-center shadow-sm">
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
      <p className="mx-auto mt-12 max-w-md text-center text-xs text-stone-400">
        Deposits of $200+ earn bonus credit. Bonus credit expires 60 days after
        each grant, so plan to use it.
      </p>

      <footer className="mt-16 border-t border-stone-200 pt-6 text-center">
        <a href="/" className="text-sm text-stone-500 hover:text-hearth-700">
          Looking after your own home instead? Hearth for homeowners →
        </a>
      </footer>
      </div>
    </main>
  );
}
