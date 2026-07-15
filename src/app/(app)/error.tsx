"use client";

import Link from "next/link";

// Error boundary for signed-in homeowner screens. Renders inside the app
// shell, so the nav stays up and the layout container is already provided.
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="card mx-auto max-w-md text-center">
      <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
        Something went sideways
      </h1>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
        Your data is safe. Trying again usually clears it up.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button onClick={() => reset()} className="btn-primary">
          Try again
        </button>
        <Link href="/dashboard" className="btn-secondary">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
