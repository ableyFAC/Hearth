import Link from "next/link";
import { redirect } from "next/navigation";
import { getProperties } from "@/lib/property";
import { isContractor } from "@/lib/contractor";
import OnboardingForm from "./OnboardingForm";

export default async function OnboardingPage() {
  // Contractors belong in /pro — don't let them create a homeowner property.
  if (await isContractor()) redirect("/pro");

  // First home vs. adding another — onboarding stays reachable either way.
  const homes = await getProperties();
  const isFirst = homes.length === 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="mb-6 text-center">
        <div className="text-3xl">🏡</div>
        <h1 className="mt-2 text-2xl font-semibold text-stone-900">
          {isFirst ? "Let's set up your home" : "Add another home"}
        </h1>
        {!isFirst && (
          <p className="mt-1 text-sm text-stone-500">
            Switch between your homes anytime from the top bar.
          </p>
        )}
      </div>

      <OnboardingForm />

      {!isFirst && (
        <Link
          href="/dashboard"
          className="mt-4 text-center text-sm text-stone-400 hover:underline"
        >
          Cancel
        </Link>
      )}
    </main>
  );
}
