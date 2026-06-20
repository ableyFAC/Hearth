"use client";

import { useState } from "react";
import PublicProfileForm from "./PublicProfileForm";
import AccountSecurity from "./AccountSecurity";
import type { Contractor } from "@/lib/database.types";

const TABS = [
  {
    key: "public" as const,
    label: "Public Profile",
    title: "Public Profile",
    subtitle: "Manage your public business profile and service offerings.",
  },
  {
    key: "security" as const,
    label: "Account Security",
    title: "Account Security",
    subtitle: "Update your password and secure your account.",
  },
];

export default function ProfileTabs({
  contractor,
}: {
  contractor: Contractor;
}) {
  const [tab, setTab] = useState<"public" | "security">("public");
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

      {tab === "public" ? (
        <PublicProfileForm contractor={contractor} />
      ) : (
        <AccountSecurity />
      )}
    </div>
  );
}
