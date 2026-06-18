import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isContractor } from "@/lib/contractor";

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
    redirect((await isContractor()) ? "/pro" : "/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 text-4xl">🏡</div>
      <h1 className="text-4xl font-semibold tracking-tight text-stone-900">
        Hearth
      </h1>
      <p className="mt-4 max-w-xl text-lg text-stone-600">
        Your home&apos;s living record. Know what needs attention, keep your
        documents in one place, and reach a vetted pro the moment something
        breaks.
      </p>
      <a href="/get-started" className="btn-primary mt-8 px-6 py-3 text-base">
        Get started
      </a>
      <p className="mt-6 max-w-md text-xs text-stone-400">
        We&apos;re upfront about data: you decide what, if anything, is ever
        shared with an agent. See our privacy commitments before you sign up.
      </p>
    </main>
  );
}
