import Link from "next/link";
import { Inbox, MessageCircle, Users, Building2 } from "lucide-react";
import Logo from "@/components/Logo";
import NavLinks from "@/components/NavLinks";
import ProfileMenu from "@/components/ProfileMenu";
import NotificationBell from "@/components/NotificationBell";

export default function ProNav({ company }: { company: string | null }) {
  // Primary nav stays to the four or five destinations a pro checks daily.
  // Playbook, Tools, and Membership moved into the profile menu's "Grow"
  // group below: useful, but not a daily-use tab.
  const LINKS = [
    { href: "/pro", label: "Leads", icon: Inbox },
    {
      href: "/pro/chats",
      label: "Messages",
      liveBadge: "contractor" as const,
      icon: MessageCircle,
    },
    { href: "/pro/crm", label: "Clients", icon: Users },
    {
      href: "/pro/business",
      label: "My Business",
      shortLabel: "Business",
      icon: Building2,
    },
  ];

  return (
    <>
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
          {/* Primary destinations. Desktop/tablet (sm and up) keep this exact
              top strip, unchanged. Below sm it is hidden and the same links
              render as the fixed bottom tab bar further down. */}
          <nav className="-mx-1 hidden items-center gap-1 overflow-x-auto px-1 sm:flex">
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
              { href: "/pro/privacy", label: "Your privacy rights" },
              { href: "/pro/help", label: "Help" },
            ]}
          />
        </div>
      </div>
    </header>
    {/* Phone-only bottom tab bar, mirroring the homeowner Nav (see
        Nav.tsx for the full rationale). Kept to <=48px tall so it fits
        inside the pb-24 bottom padding pro/layout.tsx's <main> already
        reserves below sm for the floating Ask Hearth dock; globals.css
        nudges that dock and the toast notifier above this bar on the same
        breakpoint. */}
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-stone-200/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden dark:border-white/10 dark:bg-stone-900/95"
    >
      <NavLinks links={LINKS} variant="bottom" />
    </nav>
    </>
  );
}
