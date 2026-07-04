import Link from "next/link";
import HomeSwitcher from "@/components/HomeSwitcher";
import NavLinks from "@/components/NavLinks";
import ProfileMenu from "@/components/ProfileMenu";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationBell from "@/components/NotificationBell";
import type { Property } from "@/lib/database.types";

export default function Nav({
  homes,
  activeId,
  name,
  hasPlus,
}: {
  homes: Property[];
  activeId: string;
  name: string | null;
  hasPlus: boolean;
}) {
  const LINKS = [
    { href: "/dashboard", label: "Home" },
    { href: "/issues", label: "Issues" },
    { href: "/contractors", label: "Post a Job" },
    { href: "/chats", label: "Messages", liveBadge: "homeowner" as const },
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
        <div className="flex items-center gap-1">
          <nav className="-mx-1 flex items-center gap-1 overflow-x-auto px-1">
            <NavLinks links={LINKS} />
          </nav>
          <div className="hidden sm:block">
            <GlobalSearch />
          </div>
          <NotificationBell />
          {/* Account / Log out - mirrors the contractor profile menu. */}
          <ProfileMenu
          name={name}
          hasPlus={hasPlus}
          plusTools={[
            {
              href: hasPlus ? "/forecast" : "/plus?reason=forecast",
              label: "Cost forecast",
              locked: !hasPlus,
            },
            {
              href: hasPlus ? "/quote-check" : "/plus?reason=quote",
              label: "Quote analyzer",
              locked: !hasPlus,
            },
            {
              href: hasPlus ? "/home-report" : "/plus?reason=report",
              label: "Home report",
              locked: !hasPlus,
            },
          ]}
          links={[{ href: "/documents", label: "Documents" }]}
          moreLinks={[
            { href: "/inspection", label: "Home inspection" },
            { href: "/account", label: "Edit profile" },
            { href: "/account/notifications", label: "Notifications" },
            { href: "/account/security", label: "Account security" },
            { href: "/learn", label: "Learn" },
            { href: "/account/help", label: "Help" },
          ]}
        />
        </div>
      </div>
    </header>
  );
}
