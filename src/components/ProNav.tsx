import Link from "next/link";
import Logo from "@/components/Logo";
import NavLinks from "@/components/NavLinks";
import ProfileMenu from "@/components/ProfileMenu";
import NotificationBell from "@/components/NotificationBell";

export default function ProNav({ company }: { company: string | null }) {
  // Primary nav stays to the four or five destinations a pro checks daily.
  // Playbook, Tools, and Membership moved into the profile menu's "Grow"
  // group below: useful, but not a daily-use tab.
  const LINKS = [
    { href: "/pro", label: "Leads" },
    { href: "/pro/chats", label: "Messages", liveBadge: "contractor" as const },
    { href: "/pro/crm", label: "Clients" },
    { href: "/pro/business", label: "My Business" },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-stone-900/80">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link
            href="/pro"
            className="flex items-center gap-2 text-lg font-semibold text-stone-900 dark:text-stone-100"
          >
            <Logo className="h-6 w-6 text-hearth-700 dark:text-hearth-400" />
            <span>
              Hearth{" "}
              <span className="font-normal text-stone-500 dark:text-stone-400">
                for Pros
              </span>
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <nav className="-mx-1 flex items-center gap-1 overflow-x-auto px-1">
            <NavLinks links={LINKS} />
          </nav>
          <NotificationBell />
          <ProfileMenu
            name={company}
            linksLabel="Grow"
            themeToggle
            links={[
              // Company profile is the pro's storefront: top-level, never
              // buried under "More". "Edit business" says what you DO here.
              { href: "/pro/profile", label: "Edit business profile" },
              { href: "/pro/playbook", label: "Playbook" },
              { href: "/pro/tools", label: "AI back office" },
              { href: "/pro/plus", label: "Membership" },
            ]}
            moreLinks={[
              { href: "/pro/billing", label: "Billing" },
              { href: "/pro/help", label: "Help" },
            ]}
          />
        </div>
      </div>
    </header>
  );
}
