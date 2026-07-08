"use client";

import { saveCompanyAction, verifyLicenseNowAction } from "../actions";
import CategoryPicker from "../CategoryPicker";
import FieldIcon from "../FieldIcon";
import PhoneInput from "@/components/PhoneInput";
import { STATE_NAMES } from "@/lib/forecast";
import type { Contractor } from "@/lib/database.types";

// Redesigned contractor profile editor. Posts to the same saveCompanyAction the
// onboarding form uses, so field names must stay: name, contact_email,
// contact_phone, service_area, categories. The license is read-only once set.
//
// License verification (0055): license_verified_status (0037) drives the
// badge and copy below. 'unverified'/'pending' show the same honest "we're
// checking" copy as before real CSLB verification existed; 'verified' shows
// a real, dated confirmation; 'failed' shows why (from license_verify_detail)
// with a way to reverify after fixing it with the state. The "Verify now" /
// "Reverify" button is a formAction on a button inside this SAME form
// (not a nested form, which HTML disallows) so it can post to
// verifyLicenseNowAction instead of saveCompanyAction for that one click.
function formatVerifiedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function PublicProfileForm({
  contractor,
}: {
  contractor: Contractor;
}) {
  const licenseLocked = Boolean(contractor.license_number);
  const verifyStatus = contractor.license_verified_status ?? "unverified";
  const verifiedAt = contractor.license_verified_at ?? null;
  const verifyDetail = contractor.license_verify_detail ?? null;

  return (
    <form action={saveCompanyAction} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      {/* Cover banner + avatar */}
      <div className="relative h-32 bg-gradient-to-br from-stone-100 to-stone-200 sm:h-40">
        <button
          type="button"
          className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 shadow-sm hover:bg-stone-50"
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
            className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 text-stone-500 shadow-sm hover:bg-stone-100"
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
                <label className="label">
                  Company Name{" "}
                  <span className="font-normal text-stone-500">
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
                  <PhoneInput
                    name="contact_phone"
                    className="input pl-9"
                    defaultValue={contractor.contact_phone ?? ""}
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
                <p className="mt-1 text-xs text-stone-500">
                  Where you are willing to travel for jobs.
                </p>
              </div>

              <div>
                <label className="label">State You Serve</label>
                <div className="relative">
                  <FieldIcon>
                    <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15" />
                  </FieldIcon>
                  <select
                    name="service_state"
                    className="input pl-9"
                    defaultValue={(contractor as any).service_state ?? ""}
                  >
                    <option value="">All states</option>
                    {Object.entries(STATE_NAMES).map(([code, name]) => (
                      <option key={code} value={code}>
                        {name.replace(/^the /, "")} ({code})
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  Jobs from homeowners in this state show first; leave blank to
                  see everything.
                </p>
              </div>

              <div>
                <label className="label flex items-center gap-2">
                  State License Number
                  {/* license_verified_status (0037/0055): a real CSLB check now
                      backs 'verified' and 'failed'. Never claim "Verified"
                      beyond what was actually confirmed. */}
                  {licenseLocked && verifyStatus === "verified" && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      License verified
                    </span>
                  )}
                  {licenseLocked && verifyStatus === "failed" && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                      Not confirmed
                    </span>
                  )}
                  {licenseLocked &&
                    (verifyStatus === "pending" || verifyStatus === "unverified") && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        Verification pending
                      </span>
                    )}
                </label>
                {licenseLocked ? (
                  <>
                    <div className="relative">
                      <FieldIcon>
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 13h6M9 17h6" />
                      </FieldIcon>
                      <div className="input cursor-not-allowed select-none bg-stone-100 pl-9 text-stone-500">
                        {contractor.license_number}
                      </div>
                    </div>
                    {verifyStatus === "verified" ? (
                      <p className="mt-1 text-xs text-emerald-600">
                        Checked against the CSLB public database
                        {verifiedAt ? ` on ${formatVerifiedDate(verifiedAt)}` : ""}.
                      </p>
                    ) : verifyStatus === "failed" ? (
                      <>
                        <p className="mt-1 text-xs text-red-500">
                          {verifyDetail?.statusText
                            ? `CSLB says: ${verifyDetail.statusText}`
                            : "The CSLB public database did not confirm this license."}{" "}
                          If this is out of date, update it with the state, then
                          reverify below.
                        </p>
                        <button
                          type="submit"
                          formAction={verifyLicenseNowAction}
                          className="mt-2 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
                        >
                          Reverify
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 text-xs text-stone-500">
                          We&apos;re checking your license against the CSLB
                          public database. You can keep applying to jobs
                          meanwhile.
                        </p>
                        <button
                          type="submit"
                          formAction={verifyLicenseNowAction}
                          className="mt-2 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
                        >
                          Verify now
                        </button>
                      </>
                    )}
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

            <CategoryPicker defaultSelected={contractor.categories ?? []} />
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
            className="inline-flex items-center gap-2 rounded-lg bg-hearth-600 px-4 py-2 text-sm font-semibold text-white hover:bg-hearth-700"
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
