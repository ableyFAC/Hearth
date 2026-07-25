"use client";

import Link from "next/link";

// Header + segmented switcher shared by /account (Edit profile) and
// /account/security, mirroring the pro side's ProfileTabs so both account
// areas look the same. Unlike ProfileTabs, these tabs are *routed* (real
// <Link> hrefs) rather than client useState: /account/security must stay a
// standalone URL because ../actions.ts redirect("/account/security") in many
// places and the global search entry both deep-link straight to it. Client
// state would break those. The `active` prop just picks which tab is
// highlighted for the page currently rendering.

const TABS = [
  {
    key: "profile" as const,
    label: "Profile",
    href: "/account",
    title: "Edit profile",
    subtitle: "Your personal details. To edit your home, use Home Profile.",
  },
  {
    key: "security" as const,
    label: "Account security",
    href: "/account/security",
    title: "Account security",
    subtitle: "Your sign-in email, password, sessions, and account deletion.",
  },
];

export default function AccountTabs({
  active,
}: {
  active: "profile" | "security";
}) {
  const meta = TABS.find((t) => t.key === active)!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">{meta.title}</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{meta.subtitle}</p>
      </div>

      {/* Segmented tab switcher */}
      <div
        role="tablist"
        className="inline-flex rounded-xl border border-stone-200 bg-stone-100 p-1 dark:border-white/10 dark:bg-stone-800"
      >
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={active === t.key}
            className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-1.5 text-sm font-medium transition-colors sm:inline-block sm:min-h-0 ${
              active === t.key
                ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100"
                : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
