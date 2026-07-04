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
      title: "No subscription, no auto-charge",
      body: "Load your wallet with deposits from $5 and spend it on leads. That's the whole model.",
    },
  ];

  const STEPS = [
    { n: "1", text: "Set up your company in about a minute." },
    { n: "2", text: "Browse open jobs with the fee shown on every card." },
    { n: "3", text: "Apply only to the ones you want." },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <a
          href="/"
          className="flex items-center gap-2 font-semibold text-stone-900"
        >
          <span aria-hidden>🏡</span> Hearth
        </a>
        <a href="/" className="text-sm text-stone-500 hover:text-hearth-700">
          For homeowners →
        </a>
      </header>

      {/* Hero */}
      <div className="mt-14 flex flex-col items-center text-center">
        <div className="mb-3 text-4xl">🛠️</div>
        <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-stone-900">
          Leads without the games.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-stone-600">
          Tired of lead sites that charge you for shared leads you never asked
          for? On Hearth you see the price first, and you only pay when you
          choose to apply.
        </p>
        <a
          href="/contractor-signup"
          className="btn-primary mt-8 px-6 py-3 text-base"
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

      {/* Ghost protection gets top billing: it is the promise no competitor
          keeps, so it stands alone above the grid. */}
      <section className="mt-16 rounded-2xl border border-hearth-200 bg-hearth-50 p-6 text-center">
        <div className="text-3xl">👻</div>
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
            <div className="text-2xl">{p.icon}</div>
            <h2 className="mt-2 font-semibold text-stone-900">{p.title}</h2>
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
    </main>
  );
}
