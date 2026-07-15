import Link from "next/link";
import Logo from "@/components/Logo";
import HomeSwitcher from "@/components/HomeSwitcher";
import NavLinks from "@/components/NavLinks";
import ProfileMenu from "@/components/ProfileMenu";
import ToolsMenu from "@/components/ToolsMenu";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationBell from "@/components/NotificationBell";
import type { PropertyWithShared } from "@/lib/property";

export default function Nav({
  homes,
  activeId,
  name,
  hasPlus,
}: {
  homes: PropertyWithShared[];
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
    <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-stone-900/80">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-lg font-semibold text-stone-900 dark:text-stone-100"
          >
            <Logo className="h-6 w-6 text-hearth-700 dark:text-hearth-400" />
            Hearth
          </Link>
          <span className="hidden text-stone-300 sm:inline dark:text-stone-500">·</span>
          <HomeSwitcher homes={homes} activeId={activeId} />
        </div>
        <div className="flex items-center gap-1">
          <div className="relative min-w-0">
            <nav className="-mx-1 flex items-center gap-1 overflow-x-auto px-1">
              <NavLinks links={LINKS} />
            </nav>
            {/* Scroll hint, mobile only: the strip can clip its last tab
                ("Messages" and its badge), so fade the right edge to show
                there's more to swipe. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent sm:hidden dark:from-stone-900"
            />
          </div>
          {/* Home-page destinations + Plus tools. Lives outside the
              overflow-x-auto nav strip so its dropdown isn't clipped. */}
          <ToolsMenu hasPlus={hasPlus} />
          <div className="hidden sm:block">
            <GlobalSearch />
          </div>
          {/* Mobile-only entry to /search; the inline GlobalSearch box is
              hidden below sm and the page had no other way in. */}
          <Link
            href="/search"
            aria-label="Search"
            className="flex h-11 w-11 items-center justify-center rounded-full text-stone-500 hover:bg-hearth-50 hover:text-hearth-700 sm:hidden dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-hearth-300"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </Link>
          <NotificationBell />
          {/* Account-only menu (profile, household, notifications, security,
              help, log out). Navigation destinations live in ToolsMenu -
              including Emergency, which used to be duplicated here too. */}
          <ProfileMenu
            name={name}
            hasPlus={hasPlus}
            themeToggle
            links={[
              { href: "/account", label: "Edit profile" },
              { href: "/account/household", label: "Household" },
              { href: "/account/notifications", label: "Notifications" },
              { href: "/account/security", label: "Account security" },
              { href: "/account/help", label: "Help" },
            ]}
          />
        </div>
      </div>
    </header>
  );
}
