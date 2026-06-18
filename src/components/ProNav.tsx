import Link from "next/link";
import NavLinks from "@/components/NavLinks";

const LINKS = [
  { href: "/pro", label: "Leads" },
  { href: "/pro/billing", label: "Billing" },
  { href: "/pro/profile", label: "Company" },
];

export default function ProNav({ company }: { company: string | null }) {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href="/pro" className="text-lg font-semibold text-stone-900">
            🛠️ Hearth for Pros
          </Link>
          {company && (
            <span className="hidden text-sm text-stone-400 sm:inline">
              · {company}
            </span>
          )}
        </div>
        <nav className="-mx-1 flex items-center gap-1 overflow-x-auto px-1">
          <NavLinks links={LINKS} />
          <form action="/auth/signout" method="post">
            <button className="ml-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-stone-400 hover:text-stone-700">
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
