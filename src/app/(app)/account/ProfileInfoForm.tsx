"use client";

import { saveAccountAction } from "./actions";
import PhoneInput from "@/components/PhoneInput";
import type { UserProfile } from "@/lib/database.types";

function FieldIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

// Personal account details (name, phone, email). Password lives on the Account
// Security tab. Posts to saveAccountAction, which writes the users row + mirrors
// the name into auth metadata.
export default function ProfileInfoForm({
  profile,
  name,
}: {
  profile: UserProfile;
  name: string;
}) {
  return (
    <form
      action={saveAccountAction}
      className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
    >
      <h2 className="mb-4 text-base font-semibold text-stone-900">
        Basic Information
      </h2>

      <div className="max-w-md space-y-4">
        <div>
          <label className="label">Full Name</label>
          <div className="relative">
            <FieldIcon>
              <circle cx="12" cy="8" r="4" />
              <path d="M6 21v-1a6 6 0 0112 0v1" />
            </FieldIcon>
            <input
              name="full_name"
              className="input pl-9"
              defaultValue={name}
              placeholder="e.g. Alex Rivera"
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
              name="phone"
              className="input pl-9"
              defaultValue={profile.phone ?? ""}
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
              name="email"
              type="email"
              className="input pl-9"
              defaultValue={profile.email ?? ""}
              placeholder="you@example.com"
            />
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Changing this sends a confirmation link to the new address.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 flex items-center justify-end gap-3 border-t border-stone-100 pt-5">
        <a
          href="/dashboard"
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
    </form>
  );
}
