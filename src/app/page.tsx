import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/contractor";
import { FOUNDER, FOUNDER_CREDIT } from "@/lib/constants";
import Logo from "@/components/Logo";
import HeroDemoPlayer from "@/components/HeroDemoPlayer";
import ThemeToggle from "@/components/ThemeToggle";
import { TrendingUp, Bell, MessageSquare, Wrench } from "lucide-react";

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
      icon: TrendingUp,
      title: "No surprise repair bills",
      body: "See what may need replacing soon and how much to save each month. A big repair becomes a plan, not a panic.",
    },
    {
      icon: Bell,
      title: "Know before it breaks",
      body: "Alerts for storms, product recalls, and big things getting old, like your water heater. All tailored to your actual home.",
    },
    {
      icon: MessageSquare,
      title: "Answers about your home",
      body: "Ask Hearth anything. It knows what's in your home, how old each thing is, and its history.",
    },
    {
      icon: Wrench,
      title: "The right pro, fast",
      body: "Reach a local pro the moment something breaks, with your home's details ready to send.",
    },
  ];

  const STEPS = [
    { n: "1", text: "Type your address." },
    {
      n: "2",
      text: "Add a few home details, or skip them and fill them in later.",
    },
    {
      n: "3",
      text: "Hearth tells you what needs attention and what fixing it should cost.",
    },
  ];

  return (
    <main className="pb-16">
      {/* Warm gradient band wraps header, hero, and the product preview.
          In dark it keeps a faint hearth glow at the top, then settles into
          the body's stone-900. */}
      <div className="bg-gradient-to-b from-hearth-50 via-white to-white dark:from-hearth-900/40 dark:via-stone-900 dark:to-stone-900">
        <div className="mx-auto max-w-3xl px-6 pt-6">
          {/* Slim header: wordmark left, theme switch + quiet pro door right */}
          <header className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 font-semibold text-stone-900 dark:text-stone-100">
              <Logo className="h-6 w-6 text-hearth-700 dark:text-hearth-400" /> Hearth
            </span>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <a
                href="/pros"
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:border-hearth-400 hover:text-hearth-700 dark:border-white/10 dark:text-stone-300 dark:hover:border-hearth-400 dark:hover:text-hearth-300"
              >
                Hearth for Pros
              </a>
            </div>
          </header>

          {/* Hero */}
          <div className="mt-14 flex flex-col items-center text-center sm:mt-20">
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100 sm:text-6xl sm:tracking-[-0.03em] [text-wrap:balance]">
              Know what your home needs before it costs you
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-600 dark:text-stone-400">
              Hearth watches over your house, tells you what needs attention,
              and finds a local pro when something breaks.
            </p>
            {/* Straight to homeowner signup: this page is homeowner-targeted
                and pros have two dedicated doors (header link + pro band), so
                the "Who are you?" fork on /get-started only cost a click. */}
            <a
              href="/homeowner-signup"
              className="btn-primary mt-8 px-6 py-3 text-base shadow-lift"
            >
              Get started free
            </a>
            {/* Reassurance as pills, not fine print: these facts (fast, free,
                no strings) are what get someone to actually click, so they get
                the same visual weight as a real UI element, not a footnote.
                Green is the success tone everywhere else in the app (.chip-ok),
                so it reads as "all clear" here too. This exact trio is the
                founder's pick. */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {["About 30 seconds", "No card needed", "Cancel anytime"].map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3.5 py-1.5 text-sm font-semibold text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-300"
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m4 10.5 4 4 8-9" />
                  </svg>
                  {label}
                </span>
              ))}
            </div>
            <div className="mt-4 flex justify-center text-sm">
              <a href="/signin" className="text-hearth-700 hover:underline dark:text-hearth-300">
                Already have an account? Sign in
              </a>
            </div>
          </div>

          {/* The demo replaces what used to be a static Health Score mockup:
              same content, but now it actually plays. Click to play, inline,
              never a takeover, see HeroDemoPlayer.tsx. */}
          <section className="mt-16 flex flex-col items-center sm:mt-20">
            <div className="w-full max-w-xl">
              <HeroDemoPlayer />
            </div>
          </section>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6">
        {/* How it works */}
      <section className="mt-16 sm:mt-24">
        <h2 className="text-center text-2xl font-semibold text-stone-900 dark:text-stone-100 [text-wrap:balance]">
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
      </section>

      {/* Value */}
      <section className="mt-16 sm:mt-24">
        <h2 className="text-center text-2xl font-semibold text-stone-900 dark:text-stone-100 [text-wrap:balance]">
          What Hearth watches for you
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {VALUE.map((v) => (
            <div key={v.title} className="card">
              <div className="icon-chip" aria-hidden>
                <v.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-3 font-semibold text-stone-900 dark:text-stone-100">{v.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust: who's behind this. Founder identity over corporate polish,
          same as the /pros version; details are owner-fillable in
          src/lib/constants.ts and the copy falls back to an honest generic
          line when they're blank. */}
      <section className="mt-16 rounded-2xl bg-stone-900 px-6 py-8 dark:bg-stone-950 text-center sm:mt-24">
        <h2 className="text-2xl font-semibold text-white [text-wrap:balance]">
          {FOUNDER_CREDIT
            ? `Built by ${FOUNDER_CREDIT}`
            : "Built by homeowners in Orange County"}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-300">
          Real people, real answers: email us and we&apos;ll reply ourselves.
          Pros see only what you choose to share.
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-stone-300">
          Hearth started close to home, in Orange County, with local pages
          for{" "}
          <a
            href="/fountain-valley"
            className="text-hearth-300 hover:underline"
          >
            Fountain Valley
          </a>{" "}
          and{" "}
          <a
            href="/huntington-beach"
            className="text-hearth-300 hover:underline"
          >
            Huntington Beach
          </a>{" "}
          homeowners.
        </p>
        {/* Contact renders only from owner-fillable FOUNDER fields, same
            reasoning as /pros: no link beats a link that bounces. */}
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

      {/* FAQ: the three questions people actually ask, answered from what
          the product really does. No invented stats, no "vetted" claims. */}
      <section className="mt-16 sm:mt-24">
        <h2 className="text-center text-2xl font-semibold text-stone-900 dark:text-stone-100 [text-wrap:balance]">
          Quick questions
        </h2>
        <div className="mx-auto mt-6 max-w-xl space-y-4">
          <div className="card">
            <h3 className="font-semibold text-stone-900 dark:text-stone-100">Is it really free?</h3>
            <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              Yes. Your first home is free, no card needed. Hearth makes money
              two ways: an optional Plus plan, and a fee pros pay when they
              apply to a job. We never sell your data.
            </p>
          </div>
          <div className="card">
            <h3 className="font-semibold text-stone-900 dark:text-stone-100">
              What do you do with my data?
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              Your home details are stored in our database and used to run
              Hearth: reminders, alerts, and answers about your house. We
              don&apos;t sell your personal data, and we don&apos;t let ad
              companies track what you do here. When you post a job, a pro sees only
              what&apos;s needed to quote it. The full details are in the{" "}
              <a
                href="/privacy"
                className="text-hearth-700 hover:underline dark:text-hearth-300"
              >
                privacy policy
              </a>
              .
            </p>
          </div>
          <div className="card">
            <h3 className="font-semibold text-stone-900 dark:text-stone-100">Who are the pros?</h3>
            <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              Local pros who set up their own Hearth profiles. When a pro has
              a California license number on file, we check it with the
              state&apos;s contractor license board (the CSLB) and show the
              result on their profile. You can see exactly what&apos;s been
              verified.
            </p>
          </div>
        </div>
      </section>

      {/* Closing CTA: one more clear door in before the pro band switches
          audience. The only other filled primary button is the hero's. */}
      <section className="mt-16 text-center sm:mt-24">
        <h2 className="mx-auto max-w-xl text-2xl font-semibold text-stone-900 dark:text-stone-100 [text-wrap:balance]">
          Know what your home needs before it costs you
        </h2>
        <a
          href="/homeowner-signup"
          className="btn-primary mt-6 inline-block px-6 py-3 text-base shadow-lift"
        >
          Get started free
        </a>
        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
          Free for your first home. About 30 seconds to sign up. No card
          needed.
        </p>
      </section>

      {/* Pro band: the supply-side door gets its own pitch, not a whisper
          link. Outline button on purpose: the filled primary on this page is
          reserved for the homeowner CTAs. */}
      <section className="mt-16 rounded-2xl bg-stone-900 px-6 py-8 dark:bg-stone-950 text-center sm:mt-24">
        <h3 className="text-xl font-semibold text-white">
          You fix homes? Get the leads without the games.
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-300">
          The fee is on every job before you pay, and if the homeowner never
          responds, it comes back automatically. No subscription. You pay
          only when you apply.
        </p>
        <a
          href="/pros"
          className="mt-5 inline-block rounded-lg border border-stone-500 px-6 py-2.5 font-medium text-white hover:border-white hover:bg-white/10"
        >
          Explore Hearth for Pros
        </a>
      </section>

        <footer className="mt-16 border-t border-stone-200 pt-8 sm:mt-24 dark:border-white/10">
          <div className="grid gap-8 text-left sm:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                Guides
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-stone-600 dark:text-stone-400">
                <li>
                  <a href="/guides" className="hover:text-hearth-700 hover:underline dark:hover:text-hearth-300">
                    All guides
                  </a>
                </li>
                <li>
                  <a
                    href="/guides/water-heater-replacement-cost"
                    className="hover:text-hearth-700 hover:underline dark:hover:text-hearth-300"
                  >
                    Water heater replacement cost
                  </a>
                </li>
                <li>
                  <a
                    href="/guides/hvac-replacement-cost"
                    className="hover:text-hearth-700 hover:underline dark:hover:text-hearth-300"
                  >
                    HVAC replacement cost
                  </a>
                </li>
                <li>
                  <a
                    href="/guides/socal-home-maintenance-calendar"
                    className="hover:text-hearth-700 hover:underline dark:hover:text-hearth-300"
                  >
                    SoCal maintenance calendar
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                Cities
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-stone-600 dark:text-stone-400">
                <li>
                  <a
                    href="/fountain-valley"
                    className="hover:text-hearth-700 hover:underline dark:hover:text-hearth-300"
                  >
                    Fountain Valley
                  </a>
                </li>
                <li>
                  <a
                    href="/huntington-beach"
                    className="hover:text-hearth-700 hover:underline dark:hover:text-hearth-300"
                  >
                    Huntington Beach
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                Hearth
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-stone-600 dark:text-stone-400">
                <li>
                  <a href="/pros" className="hover:text-hearth-700 hover:underline dark:hover:text-hearth-300">
                    For Pros
                  </a>
                </li>
                <li>
                  <a href="/signin" className="hover:text-hearth-700 hover:underline dark:hover:text-hearth-300">
                    Sign in
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                Fine print
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-stone-600 dark:text-stone-400">
                <li>
                  <a href="/privacy" className="hover:text-hearth-700 hover:underline dark:hover:text-hearth-300">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="/terms" className="hover:text-hearth-700 hover:underline dark:hover:text-hearth-300">
                    Terms
                  </a>
                </li>
                <li>
                  <a href="/ai-disclosure" className="hover:text-hearth-700 hover:underline dark:hover:text-hearth-300">
                    How we use AI
                  </a>
                </li>
                {FOUNDER.email && (
                  <li>
                    <a
                      href={`mailto:${FOUNDER.email}`}
                      className="break-all hover:text-hearth-700 hover:underline dark:hover:text-hearth-300"
                    >
                      {FOUNDER.email}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          </div>
          <p className="mt-8 inline-flex w-full items-center justify-center gap-2 pb-2 text-xs text-stone-500 dark:text-stone-400">
            <Logo className="h-6 w-6 text-hearth-700 dark:text-hearth-400" /> Hearth · Your home,
            looked after
          </p>
        </footer>
      </div>
    </main>
  );
}
