import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/contractor";

// Role chooser for NEW users. After "Get started" they pick homeowner or
// contractor and we send them to the matching sign-up (which tags the account's
// role). Already-signed-in users skip straight into their side of the app.
export default async function GetStarted() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect((await getRole()) === "contractor" ? "/pro" : "/dashboard");
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
          href="/homeowner-signup"
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
          href="/contractor-signup"
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

      <p className="mt-8 text-sm text-stone-500">
        Already have an account?{" "}
        <a href="/signin" className="font-medium text-hearth-700 hover:underline">
          Sign in
        </a>
      </p>
      <a href="/" className="mt-3 text-sm text-stone-400 hover:underline">
        ← Back
      </a>
    </main>
  );
}
