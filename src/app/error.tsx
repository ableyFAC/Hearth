"use client";

import Link from "next/link";
import Logo from "@/components/Logo";

// Root error boundary. Renders outside the app shells, so it centers itself.
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="card w-full max-w-md text-center">
        <Logo className="mx-auto h-10 w-10 text-hearth-600 dark:text-hearth-400" />
        <h1 className="mt-4 text-xl font-semibold text-stone-900 dark:text-stone-100">
          Something went sideways
        </h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          Your data is safe. Trying again usually clears it up; if it keeps
          happening, give it a minute and come back.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => reset()} className="btn-primary">
            Try again
          </button>
          <Link href="/" className="btn-secondary">
            Go home
          </Link>
          <Link href="/dashboard" className="btn-secondary">
            Your dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
