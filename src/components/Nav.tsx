import Link from "next/link";
import HomeSwitcher from "@/components/HomeSwitcher";
import NavLinks from "@/components/NavLinks";
import type { Property } from "@/lib/database.types";

export default function Nav({
  homes,
  activeId,
  unread = 0,
}: {
  homes: Property[];
  activeId: string;
  unread?: number;
}) {
  const LINKS = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/profile", label: "Home Profile" },
    { href: "/issues", label: "Issues" },
    { href: "/contractors", label: "Find a Pro" },
    { href: "/chats", label: "Messages", badge: unread || undefined },
  ];

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-lg font-semibold text-stone-900">
            🏡 Hearth
          </Link>
          <span className="hidden text-stone-300 sm:inline">·</span>
          <HomeSwitcher homes={homes} activeId={activeId} />
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
