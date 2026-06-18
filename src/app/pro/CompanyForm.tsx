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
          <label className="label">License #</label>
          <input
            name="license_number"
            className="input"
            defaultValue={contractor?.license_number ?? ""}
            placeholder="CA-PL-000000"
          />
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
