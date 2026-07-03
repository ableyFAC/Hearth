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
      icon: "🔔",
      title: "Know before it breaks",
      body: "Proactive alerts for storms, safety recalls, and aging systems, tailored to your actual home.",
    },
    {
      icon: "📈",
      title: "No surprise repair bills",
      body: "See what is likely to need replacing and roughly what to set aside each month, so a big repair is a plan, not a panic.",
    },
    {
      icon: "💬",
      title: "Answers about your home",
      body: "Ask Hearth anything. It knows your systems, their ages, and your history, not just generic advice.",
    },
    {
      icon: "🧰",
      title: "The right pro, fast",
      body: "Reach a vetted pro the moment something breaks, with your home's details ready to send.",
    },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 text-4xl">🏡</div>
        <h1 className="text-4xl font-semibold tracking-tight text-stone-900">
          Hearth
        </h1>
        <p className="mt-4 max-w-xl text-lg text-stone-600">
          Your home&apos;s living record. Know what needs attention, keep every
          document in one place, and reach a vetted pro the moment something
          breaks.
        </p>
        <a href="/get-started" className="btn-primary mt-8 px-6 py-3 text-base">
          Get started free
        </a>
        <a
          href="/signin"
          className="mt-3 text-sm text-hearth-700 hover:underline"
        >
          Already have an account? Sign in
        </a>
      </div>

      <section className="mt-16 grid gap-4 sm:grid-cols-2">
        {VALUE.map((v) => (
          <div key={v.title} className="card">
            <div className="text-2xl">{v.icon}</div>
            <h2 className="mt-2 font-semibold text-stone-900">{v.title}</h2>
            <p className="mt-1 text-sm text-stone-600">{v.body}</p>
          </div>
        ))}
      </section>

      <p className="mx-auto mt-12 max-w-md text-center text-xs text-stone-400">
        We&apos;re upfront about data: you decide what, if anything, is ever
        shared with an agent. See our privacy commitments before you sign up.
      </p>
    </main>
  );
}
