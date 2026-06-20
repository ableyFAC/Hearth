import Link from "next/link";
import NavLinks from "@/components/NavLinks";
import ProMenu from "@/components/ProMenu";

export default function ProNav({ company }: { company: string | null }) {
  // Company / Billing / Sign out now live in the profile menu (ProMenu).
  const LINKS = [
    { href: "/pro", label: "Leads" },
    { href: "/pro/chats", label: "Messages", liveBadge: "contractor" as const },
  ];

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href="/pro" className="text-lg font-semibold text-stone-900">
            🛠️ Hearth for Pros
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <nav className="-mx-1 flex items-center gap-1 overflow-x-auto px-1">
            <NavLinks links={LINKS} />
          </nav>
          <ProMenu company={company} />
        </div>
      </div>
    </header>
  );
}
