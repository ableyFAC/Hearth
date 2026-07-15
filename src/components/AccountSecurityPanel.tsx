"use client";

import { useState } from "react";

// The one account-security surface, shared by the homeowner page
// (/account/security) and the pro profile's Account Security tab so the two
// sides can't drift apart. Everything security-shaped lives here and only
// here: sign-in email, password, sessions, data export, and deletion.
// Profile identity (name, phone) stays on the Edit profile side.
//
// The server actions are passed in as props because each side has its own
// (they redirect back to their own page after the flash).

type Action = (formData: FormData) => void;
type PlainAction = () => void;

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
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500">
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
const mailIcon = <path d="M4 4h16v16H4zM4 6l8 6 8-6" />;

export default function AccountSecurityPanel({
  email,
  updateEmailAction,
  updatePasswordAction,
  signOutOthersAction,
  deleteAccountAction,
  founderEmail,
}: {
  // The address the person signs in with today, shown so they know what
  // they're changing from.
  email: string | null;
  updateEmailAction: Action;
  updatePasswordAction: Action;
  signOutOthersAction: PlainAction;
  deleteAccountAction: Action;
  // Monitored support inbox for the data-export request. Empty string hides
  // the row entirely rather than showing a dead mailto.
  founderEmail: string;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="space-y-6">
      {/* Sign-in email. Changing it is a security action (it moves where
          recovery links go), so it lives here, not on Edit profile. */}
      <div className="card p-6">
        <div className="flex items-center gap-2 border-b border-stone-100 pb-4">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-stone-800" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {mailIcon}
          </svg>
          <h2 className="text-base font-semibold text-stone-900">
            Sign-in email
          </h2>
        </div>

        <form action={updateEmailAction} className="mt-5 max-w-md space-y-4">
          {email && (
            <p className="text-sm text-stone-600">
              You currently sign in as{" "}
              <span className="font-medium text-stone-900">{email}</span>.
            </p>
          )}
          <div>
            <label className="label">New Email Address</label>
            <div className="relative">
              <FieldIcon>{mailIcon}</FieldIcon>
              <input
                name="email"
                type="email"
                autoComplete="email"
                className="input pl-9"
                placeholder="you@example.com"
                required
              />
            </div>
            <p className="mt-1 text-xs text-stone-500">
              We send a confirmation link to the new address. Nothing changes
              until you click it.
            </p>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-stone-500 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-600"
          >
            Update Email
          </button>
        </form>
      </div>

      {/* Password */}
      <div className="card p-6">
        <div className="flex items-center gap-2 border-b border-stone-100 pb-4">
          <LockIcon className="h-5 w-5 text-stone-800" />
          <h2 className="text-base font-semibold text-stone-900">Password</h2>
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
      </div>

      {/* Sessions. Supabase doesn't give us a per-device session list from
          here, so we offer the action that matters instead of a fake list. */}
      <div className="card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-stone-900">
              Sign out of other devices
            </p>
            <p className="mt-0.5 text-sm text-stone-500">
              Left yourself signed in somewhere, or see activity you don't
              recognize? This ends every session except this one.
            </p>
          </div>
          <form action={signOutOthersAction}>
            <button type="submit" className="btn-secondary whitespace-nowrap">
              Sign out everywhere else
            </button>
          </form>
        </div>
      </div>

      {/* Data export. Honest: there's no automatic export yet, so this is a
          request to a real inbox rather than a button that pretends. */}
      {founderEmail && (
        <div className="card p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-stone-900">
                Export your data
              </p>
              <p className="mt-0.5 text-sm text-stone-500">
                Automatic export isn't built yet. Email us and we'll send you
                a copy of everything we hold for your account.
              </p>
            </div>
            <a
              href={`mailto:${founderEmail}?subject=${encodeURIComponent("Please export my Hearth data")}`}
              className="btn-secondary whitespace-nowrap"
            >
              Request an export
            </a>
          </div>
        </div>
      )}

      {/* Account deletion. No "Danger Zone" caption, per design direction. */}
      <div className="card p-6">
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                Delete your account
              </p>
              <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
                Permanently remove your account and all associated data. This
                action cannot be undone.
              </p>
            </div>
            {!confirmingDelete && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Delete Account
              </button>
            )}
          </div>

          {confirmingDelete && (
            <form
              action={deleteAccountAction}
              className="mt-4 max-w-md space-y-4 border-t border-red-200 pt-4 dark:border-red-900/50"
            >
              <p className="text-sm font-bold text-red-800 dark:text-red-300">
                This permanently deletes your account, your homes, systems,
                documents, and messages. This cannot be undone.
              </p>
              <div>
                <label className="label">Enter your password to confirm</label>
                <div className="relative">
                  <FieldIcon>{keyIcon}</FieldIcon>
                  <input
                    name="current_password"
                    type="password"
                    autoComplete="current-password"
                    className="input pl-9"
                    placeholder="Current password"
                    required
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Permanently delete account
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="btn-secondary whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
