import Link from "next/link";
import Logo from "@/components/Logo";

export const metadata = { title: "Page not found" };

// Root 404. Renders outside the app shells, so it centers itself on the page.
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="card w-full max-w-md text-center">
        <Logo className="mx-auto h-10 w-10 text-hearth-600 dark:text-hearth-400" />
        <h1 className="mt-4 text-xl font-semibold text-stone-900 dark:text-stone-100">
          We can&apos;t find that page
        </h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          The link may be old or mistyped. Nothing is broken on your end, and
          nothing is lost.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="btn-primary">
            Go home
          </Link>
          <Link href="/dashboard" className="btn-secondary">
            Your dashboard
          </Link>
          <Link href="/pros" className="btn-secondary">
            Find a pro
          </Link>
        </div>
      </div>
    </main>
  );
}
