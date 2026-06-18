import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isContractor } from "@/lib/contractor";

// Role chooser. After "Get started" the user tells us whether they're a
// homeowner or a contractor, and we route them to the matching sign-in.
// Already-signed-in users skip straight into their side of the app.
export default async function GetStarted() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect((await isContractor()) ? "/pro" : "/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
        Who are you?
      </h1>
      <p className="mt-3 text-stone-600">
        Choose how you&apos;d like to use Hearth.
      </p>

      <div className="mt-10 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        <a
          href="/login"
          className="flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white px-6 py-12 shadow-sm transition hover:border-hearth-400 hover:shadow-md"
        >
          <div className="text-4xl">🏡</div>
          <div className="mt-4 text-lg font-medium text-stone-900">
            I&apos;m a homeowner
          </div>
          <p className="mt-1 text-sm text-stone-500">
            Track your home and find a pro.
          </p>
        </a>

        <a
          href="/pro/login"
          className="flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white px-6 py-12 shadow-sm transition hover:border-hearth-400 hover:shadow-md"
        >
          <div className="text-4xl">🛠️</div>
          <div className="mt-4 text-lg font-medium text-stone-900">
            I&apos;m a contractor
          </div>
          <p className="mt-1 text-sm text-stone-500">
            Get matched with homeowner leads.
          </p>
        </a>
      </div>

      <a href="/" className="mt-8 text-sm text-stone-400 hover:underline">
        ← Back
      </a>
    </main>
  );
}
