"use client";

import { useState } from "react";
import ProfileInfoForm from "./ProfileInfoForm";
import AccountSecurity from "./AccountSecurity";
import type { UserProfile } from "@/lib/database.types";

const TABS = [
  {
    key: "profile" as const,
    label: "Profile",
    title: "Account",
    subtitle: "Your personal details. To edit your home, use Home Profile.",
  },
  {
    key: "security" as const,
    label: "Account Security",
    title: "Account Security",
    subtitle: "Update your password and secure your account.",
  },
];

export default function AccountTabs({
  profile,
  name,
}: {
  profile: UserProfile;
  name: string;
}) {
  const [tab, setTab] = useState<"profile" | "security">("profile");
  const meta = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">{meta.title}</h1>
        <p className="mt-1 text-sm text-stone-500">{meta.subtitle}</p>
      </div>

      {/* Segmented tab switcher */}
      <div
        role="tablist"
        className="inline-flex rounded-xl border border-stone-200 bg-stone-100 p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" ? (
        <ProfileInfoForm profile={profile} name={name} />
      ) : (
        <AccountSecurity />
      )}
    </div>
  );
}
