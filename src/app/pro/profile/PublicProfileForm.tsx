"use client";

import { useState } from "react";
import { saveCompanyAction } from "../actions";
import { ISSUE_CATEGORIES } from "@/lib/constants";
import type { Contractor } from "@/lib/database.types";

// Per-category line icons, mirroring the design (monochrome, turn white when the
// card is selected).
const CATEGORY_ICON: Record<string, JSX.Element> = {
  roof: (
    <path d="M3 11l9-7 9 7M5 10v9h14v-9" />
  ),
  plumbing: (
    <path d="M12 3s5 5.5 5 9a5 5 0 11-10 0c0-3.5 5-9 5-9z" />
  ),
  electrical: (
    <path d="M13 3L5 13h5l-1 8 8-11h-5l1-7z" />
  ),
  hvac: (
    <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
  ),
  structural: (
    <path d="M4 21V5l8-2 8 2v16M9 9h.01M9 13h.01M15 9h.01M15 13h.01M10 21v-4h4v4" />
  ),
  other: (
    <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
  ),
};

function FieldIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </span>
  );
}

// Redesigned contractor profile editor. Posts to the same saveCompanyAction the
// onboarding form uses, so field names must stay: name, contact_email,
// contact_phone, service_area, categories. The license is read-only once set.
export default function PublicProfileForm({
  contractor,
}: {
  contractor: Contractor;
}) {
  const licenseLocked = Boolean(contractor.license_number);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(contractor.categories ?? [])
  );
  function toggleCategory(value: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  return (
    <form action={saveCompanyAction} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      {/* Cover banner + avatar */}
      <div className="relative h-32 bg-gradient-to-r from-blue-600 to-indigo-600 sm:h-40">
        <button
          type="button"
          className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/30"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Change Cover
        </button>
      </div>

      <div className="px-6 pb-6">
        {/* Logo / avatar, overlapping the banner */}
        <div className="-mt-10 mb-6">
          <button
            type="button"
            className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 text-stone-400 shadow-sm hover:bg-stone-100"
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 21V5l8-2 8 2v16M9 9h.01M9 13h.01M15 9h.01M15 13h.01M10 21v-4h4v4" />
            </svg>
            <span className="absolute -bottom-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-sm">
              +
            </span>
          </button>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Basic information */}
          <div>
            <h2 className="mb-4 text-base font-semibold text-stone-900">
              Basic Information
            </h2>

            <div className="space-y-4">
              <div>
                <label className="label">Company Name</label>
                <div className="relative">
                  <FieldIcon>
                    <path d="M4 21V5l8-2 8 2v16M9 9h.01M9 13h.01M15 9h.01M15 13h.01M10 21v-4h4v4" />
                  </FieldIcon>
                  <input
                    name="name"
                    className="input pl-9"
                    defaultValue={contractor.name ?? ""}
                    placeholder="e.g. Acme Home Services"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">Email Address</label>
                <div className="relative">
                  <FieldIcon>
                    <path d="M4 4h16v16H4zM4 6l8 6 8-6" />
                  </FieldIcon>
                  <input
                    name="contact_email"
                    type="email"
                    className="input pl-9"
                    defaultValue={contractor.contact_email ?? ""}
                    placeholder="contact@yourcompany.com"
                  />
                </div>
              </div>

              <div>
                <label className="label">Phone Number</label>
                <div className="relative">
                  <FieldIcon>
                    <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012 4.2 2 2 0 014 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.6a2 2 0 01-.5 2.1L8.1 9.8a16 16 0 006 6l1.4-1.1a2 2 0 012.1-.5c.8.3 1.7.6 2.6.7a2 2 0 011.7 2z" />
                  </FieldIcon>
                  <input
                    name="contact_phone"
                    type="tel"
                    className="input pl-9"
                    defaultValue={contractor.contact_phone ?? ""}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              <div>
                <label className="label">Service Area</label>
                <div className="relative">
                  <FieldIcon>
                    <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0118 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </FieldIcon>
                  <input
                    name="service_area"
                    className="input pl-9"
                    defaultValue={contractor.service_area ?? ""}
                    placeholder="e.g. San Francisco Bay Area"
                  />
                </div>
                <p className="mt-1 text-xs text-stone-400">
                  Where you are willing to travel for jobs.
                </p>
              </div>

              <div>
                <label className="label flex items-center gap-2">
                  State License Number
                  {licenseLocked && (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                      {contractor.vetted ? "Verified" : "Pending"}
                    </span>
                  )}
                </label>
                {licenseLocked ? (
                  <>
                    <div className="relative">
                      <FieldIcon>
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 13h6M9 17h6" />
                      </FieldIcon>
                      <div className="input cursor-not-allowed select-none bg-stone-100 pl-9 text-stone-400">
                        {contractor.license_number}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-stone-400">
                      Contact support to update your verified license.
                    </p>
                  </>
                ) : (
                  <div className="relative">
                    <FieldIcon>
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 13h6M9 17h6" />
                    </FieldIcon>
                    <input
                      name="license_number"
                      className="input pl-9"
                      placeholder="LIC-000000-XX"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Service categories */}
          <div>
            <h2 className="mb-1 text-base font-semibold text-stone-900">
              Service Categories
            </h2>
            <p className="mb-4 text-sm text-stone-500">
              Select the main areas of work your company handles. This helps
              homeowners find you.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {ISSUE_CATEGORIES.map((c) => {
                const on = selected.has(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => toggleCategory(c.value)}
                    aria-pressed={on}
                    className={`relative flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                      on
                        ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                        : "border-stone-200 bg-white hover:bg-stone-50"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        on ? "bg-blue-600 text-white" : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {CATEGORY_ICON[c.value] ?? CATEGORY_ICON.other}
                      </svg>
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        on ? "text-blue-700" : "text-stone-700"
                      }`}
                    >
                      {c.label}
                    </span>
                    {on && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-600">
                        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
              {/* Submit the selected categories with the form. */}
              {[...selected].map((v) => (
                <input key={v} type="hidden" name="categories" value={v} />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-end gap-3 border-t border-stone-100 pt-5">
          <a
            href="/pro"
            className="rounded-lg px-4 py-2 text-sm font-medium text-stone-500 hover:text-stone-700"
          >
            Cancel
          </a>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
              <path d="M17 21v-8H7v8M7 3v5h8" />
            </svg>
            Save Changes
          </button>
        </div>
      </div>
    </form>
  );
}
