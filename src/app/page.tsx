import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/contractor";

// Root: route signed-in users into the app, everyone else to the marketing-lite
// landing. Kept server-side so there's no flash of the wrong screen.
export default async function Home({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  // Safety net: if a magic link lands here (e.g. Supabase fell back to the Site
  // URL instead of /auth/callback), forward the code to the handler that
  // exchanges it for a session.
  if (searchParams.code) {
    redirect(`/auth/callback?code=${searchParams.code}&next=/dashboard`);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect((await getRole()) === "contractor" ? "/pro" : "/dashboard");
  }

  const VALUE = [
    {
      icon: "📈",
      title: "No surprise repair bills",
      body: "See what's likely to need replacing and what to set aside each month, so a big repair is a plan, not a panic.",
    },
    {
      icon: "🔔",
      title: "Know before it breaks",
      body: "Alerts for storms, recalls, and aging systems, tailored to your actual home.",
    },
    {
      icon: "💬",
      title: "Answers about your home",
      body: "Ask Hearth anything. It knows your systems, their ages, and your history.",
    },
    {
      icon: "🧰",
      title: "The right pro, fast",
      body: "Reach a vetted pro the moment something breaks, with your home's details ready to send.",
    },
  ];

  const STEPS = [
    { n: "1", text: "Type your address." },
    {
      n: "2",
      text: "We fill in your home's details from public records, so you don't have to type it all in.",
    },
    {
      n: "3",
      text: "Hearth tells you what needs attention and what it should cost.",
    },
  ];

  // Static preview of the dashboard's Home Health Score card. Pure CSS so the
  // landing stays honest and loads with zero assets.
  const PREVIEW_SYSTEMS = [
    {
      icon: "🌡️",
      name: "HVAC",
      chip: "Plan ahead",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
    },
    {
      icon: "💧",
      name: "Water heater",
      chip: "Healthy",
      tone: "border-green-200 bg-green-50 text-green-700",
    },
    {
      icon: "🏠",
      name: "Roof",
      chip: "Healthy",
      tone: "border-green-200 bg-green-50 text-green-700",
    },
  ];

  return (
    <main className="pb-16">
      {/* Warm gradient band wraps header, hero, and the product preview */}
      <div className="bg-gradient-to-b from-hearth-50 via-white to-white">
        <div className="mx-auto max-w-3xl px-6 pt-6">
          {/* Slim header: wordmark left, quiet pro door right */}
          <header className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-semibold text-stone-900">
              <span aria-hidden>🏡</span> Hearth
            </span>
            <a
              href="/pros"
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:border-hearth-400 hover:text-hearth-700"
            >
              🛠️ Hearth for Pros
            </a>
          </header>

          {/* Hero */}
          <div className="mt-14 flex flex-col items-center text-center">
            <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-stone-900 sm:text-6xl">
              Know what your home needs, before it costs you.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-stone-600">
              Hearth watches over your house, tells you what needs attention,
              and finds a trusted pro when something breaks.
            </p>
            <a
              href="/get-started"
              className="btn-primary mt-8 px-6 py-3 text-base shadow-md"
            >
              Get started free
            </a>
            <p className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-stone-500">
              <span>
                <span aria-hidden className="text-hearth-700">
                  ✓
                </span>{" "}
                About 30 seconds
              </span>
              <span>
                <span aria-hidden className="text-hearth-700">
                  ✓
                </span>{" "}
                No card needed
              </span>
            </p>
            <a
              href="/signin"
              className="mt-3 text-sm text-hearth-700 hover:underline"
            >
              Already have an account? Sign in
            </a>
          </div>

          {/* Product preview: the Health Score card owners see on day one */}
          <section className="mt-16 flex flex-col items-center">
            <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-stone-200">
              {/* Faux browser bar */}
              <div
                aria-hidden
                className="flex items-center gap-1.5 border-b border-stone-100 bg-stone-50 px-4 py-2.5"
              >
                <span className="h-2 w-2 rounded-full bg-stone-300" />
                <span className="h-2 w-2 rounded-full bg-stone-300" />
                <span className="h-2 w-2 rounded-full bg-stone-300" />
              </div>
              <div className="p-5">
                <p className="stat-label">Home Health Score</p>
                <p className="stat-number mt-1 text-hearth-700">72</p>
                <p className="text-sm text-hearth-700">Generally healthy</p>
                <ul className="mt-4 space-y-2">
                  {PREVIEW_SYSTEMS.map((s) => (
                    <li
                      key={s.name}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-stone-700">
                        <span aria-hidden>{s.icon}</span> {s.name}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${s.tone}`}
                      >
                        {s.chip}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-3 text-xs text-stone-400">
              Your home&apos;s report card
            </p>
          </section>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6">
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

      {/* Value */}
      <section className="mt-16 grid gap-4 sm:grid-cols-2">
        {VALUE.map((v) => (
          <div key={v.title} className="card">
            <div className="icon-chip" aria-hidden>
              {v.icon}
            </div>
            <h2 className="mt-3 font-semibold text-stone-900">{v.title}</h2>
            <p className="mt-1 text-sm text-stone-600">{v.body}</p>
          </div>
        ))}
      </section>

      {/* Trust: real commitments only, no invented numbers */}
      <section className="mx-auto mt-12 max-w-md text-center">
        <p className="text-sm font-medium text-stone-700">
          Free for your first home.
        </p>
        <p className="mt-2 text-xs text-stone-400">
          We&apos;re upfront about data: you decide what, if anything, is ever
          shared with an agent.
        </p>
      </section>

      {/* Pro band: the supply-side door gets its own pitch, not a whisper link */}
      <section className="mt-16 rounded-2xl bg-stone-900 px-6 py-8 text-center">
        <div className="text-3xl">🛠️</div>
        <h2 className="mt-2 text-xl font-semibold text-white">
          You fix homes? Get the leads without the games.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-stone-300">
          The fee is on every job card before you pay, and if a homeowner
          ghosts, it comes back automatically. No subscription, no
          auto-charges.
        </p>
        <a
          href="/pros"
          className="btn-primary mt-5 inline-block px-6 py-2.5"
        >
          Explore Hearth for Pros
        </a>
      </section>

        <footer className="mt-12 border-t border-stone-200 pt-6 text-center">
          <p className="text-xs text-stone-400">
            🏡 Hearth · Your home, looked after
          </p>
        </footer>
      </div>
    </main>
  );
}
