"use client";

import { updatePasswordAction, deleteAccountAction } from "./actions";

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function FieldIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

const keyIcon = (
  <>
    <circle cx="8" cy="8" r="5" />
    <path d="M11.5 11.5L21 21M16 16l2-2M18 18l2-2" />
  </>
);
const lockSmall = (
  <>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 018 0v3" />
  </>
);

export default function AccountSecurity() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 border-b border-stone-100 pb-4">
          <LockIcon className="h-5 w-5 text-stone-800" />
          <h2 className="text-base font-semibold text-stone-900">
            Security Settings
          </h2>
        </div>

        <form action={updatePasswordAction} className="mt-5 max-w-md space-y-4">
          <div>
            <label className="label">Current Password</label>
            <div className="relative">
              <FieldIcon>{keyIcon}</FieldIcon>
              <input
                name="current_password"
                type="password"
                autoComplete="current-password"
                className="input pl-9"
                placeholder="Enter current password"
                required
              />
            </div>
          </div>

          <div>
            <label className="label">New Password</label>
            <div className="relative">
              <FieldIcon>{lockSmall}</FieldIcon>
              <input
                name="new_password"
                type="password"
                autoComplete="new-password"
                className="input pl-9"
                placeholder="Create new password"
                required
              />
            </div>
          </div>

          <div>
            <label className="label">Confirm New Password</label>
            <div className="relative">
              <FieldIcon>{lockSmall}</FieldIcon>
              <input
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                className="input pl-9"
                placeholder="Confirm new password"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-stone-500 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-600"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
              <path d="M17 21v-8H7v8M7 3v5h8" />
            </svg>
            Update Password
          </button>
        </form>

        {/* Account deletion. No "Danger Zone" caption, per design direction. */}
        <div className="mt-8 border-t border-stone-100 pt-6">
          <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-stone-900">
                Delete your account
              </p>
              <p className="mt-0.5 text-sm text-stone-500">
                Permanently remove your account and all associated data. This
                action cannot be undone.
              </p>
            </div>
            <form
              action={deleteAccountAction}
              onSubmit={(e) => {
                if (
                  !confirm(
                    "Permanently delete your account? This cannot be undone."
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <button
                type="submit"
                className="whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Delete Account
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
