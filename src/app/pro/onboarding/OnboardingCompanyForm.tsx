"use client";

import { saveCompanyAction } from "../actions";
import CategoryPicker from "../CategoryPicker";
import FieldIcon from "../FieldIcon";

// First-time company setup. Same visual language as the edit-profile form
// (matching fields + category cards) but lean: no tabs, no account-security, no
// cover/logo upload, and the license is an open input since it's set here first.
// Posts to saveCompanyAction, which inserts the new contractor row.
export default function OnboardingCompanyForm({
  defaultEmail,
}: {
  defaultEmail: string;
}) {
  return (
    <form
      action={saveCompanyAction}
      className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
    >
      {/* White header, matching the contractor signup card */}
      <div className="px-6 pt-8 text-center">
        <div className="text-3xl">🛠️</div>
        <h1 className="mt-2 text-2xl font-semibold text-stone-900">
          Set up your company
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Tell us what you do so we can match you with the right homeowner leads.
        </p>
      </div>

      {/* Form body */}
      <div className="px-6 pb-6 pt-6">
        <div className="grid gap-8 md:grid-cols-2">
          {/* Basic information */}
          <div>
            <h2 className="mb-4 text-base font-semibold text-stone-900">
              Basic Information
            </h2>

            <div className="space-y-4">
              <div>
                <label className="label">
                  Company Name{" "}
                  <span className="font-normal text-stone-400">
                    (as it appears on your license)
                  </span>
                </label>
                <div className="relative">
                  <FieldIcon>
                    <path d="M4 21V5l8-2 8 2v16M9 9h.01M9 13h.01M15 9h.01M15 13h.01M10 21v-4h4v4" />
                  </FieldIcon>
                  <input
                    name="name"
                    className="input pl-9"
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
                    defaultValue={defaultEmail}
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
                    placeholder="e.g. San Francisco Bay Area"
                  />
                </div>
                <p className="mt-1 text-xs text-stone-400">
                  Where you are willing to travel for jobs.
                </p>
              </div>

              <div>
                <label className="label">State License Number</label>
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
                <p className="mt-1 text-xs text-stone-400">
                  We verify this before your company goes live. It can&apos;t be
                  changed later.
                </p>
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

            <CategoryPicker defaultSelected={[]} />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex justify-end border-t border-stone-100 pt-5">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-hearth-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-hearth-700"
          >
            Start receiving leads
          </button>
        </div>
      </div>
    </form>
  );
}
