"use client";

import { useState } from "react";
import PublicProfileForm from "./PublicProfileForm";
import PublicPageCard from "./PublicPageCard";
import ProjectsCard, { type ProProject } from "./ProjectsCard";
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
    key: "page" as const,
    label: "Your Public Page",
    title: "Your Public Page",
    subtitle: "Share your Hearth page and manage what appears on it.",
  },
  {
    key: "projects" as const,
    label: "Projects",
    title: "Projects",
    subtitle: "Showcase completed work with photo albums on your public page.",
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
  member,
  projects,
}: {
  contractor: Contractor;
  member: boolean;
  projects: ProProject[];
}) {
  const [tab, setTab] = useState<"public" | "page" | "projects" | "security">(
    "public"
  );
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
      ) : tab === "page" ? (
        <PublicPageCard contractor={contractor} member={member} />
      ) : tab === "projects" ? (
        <ProjectsCard
          contractorId={contractor.id}
          member={member}
          projects={projects}
        />
      ) : (
        <AccountSecurity />
      )}
    </div>
  );
}
