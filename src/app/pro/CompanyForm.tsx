"use client";

import { saveCompanyAction } from "./actions";
import { ISSUE_CATEGORIES } from "@/lib/constants";
import type { Contractor } from "@/lib/database.types";

// Used for both first-time onboarding and later profile edits.
export default function CompanyForm({
  contractor,
  submitLabel,
}: {
  contractor: Contractor | null;
  submitLabel: string;
}) {
  const cats = contractor?.categories ?? [];

  // Once a license number is on file it's locked - it's a legal identifier we
  // verify, so it can't be edited from the profile. During onboarding (no
  // contractor yet) the field is open so they can enter it the first time.
  const licenseLocked = Boolean(contractor?.license_number);

  return (
    <form action={saveCompanyAction} className="card space-y-4">
      <div>
        <label className="label">Company name</label>
        <input
          name="name"
          className="input"
          defaultValue={contractor?.name ?? ""}
          placeholder="e.g. Delta Plumbing & Drain"
          required
        />
      </div>

      <div>
        <label className="label">
          Categories you serve (these decide which leads you get)
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ISSUE_CATEGORIES.map((c) => (
            <label
              key={c.value}
              className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                name="categories"
                value={c.value}
                defaultChecked={cats.includes(c.value)}
                className="accent-hearth-600"
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Service area</label>
          <input
            name="service_area"
            className="input"
            defaultValue={contractor?.service_area ?? ""}
            placeholder="e.g. Bay Area, CA"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label">License #</label>
            {licenseLocked &&
              (contractor?.vetted ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  Verified ✓
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Pending review
                </span>
              ))}
          </div>
          {licenseLocked ? (
            <>
              {/* Read-only display. Locked so the license can't be edited here. */}
              <div className="input cursor-not-allowed bg-stone-100 text-stone-400 select-none">
                {contractor?.license_number}
              </div>
              <p className="mt-1 text-xs text-stone-400">
                Your license is verified and can&apos;t be edited. Contact
                support to make a correction.
              </p>
            </>
          ) : (
            <input
              name="license_number"
              className="input"
              defaultValue={contractor?.license_number ?? ""}
              placeholder="CA-PL-000000"
            />
          )}
        </div>
        <div>
          <label className="label">Contact phone</label>
          <input
            name="contact_phone"
            className="input"
            type="tel"
            defaultValue={contractor?.contact_phone ?? ""}
            placeholder="+1 415 555 0123"
          />
        </div>
        <div>
          <label className="label">Contact email</label>
          <input
            name="contact_email"
            className="input"
            type="email"
            defaultValue={contractor?.contact_email ?? ""}
            placeholder="leads@yourcompany.com"
          />
        </div>
      </div>

      <button className="btn-primary w-full">{submitLabel}</button>
    </form>
  );
}
