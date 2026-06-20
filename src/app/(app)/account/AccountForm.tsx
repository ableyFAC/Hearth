"use client";

import { saveAccountAction } from "./actions";
import type { UserProfile } from "@/lib/database.types";

// Edit personal account details: name, phone, email, and password.
export default function AccountForm({
  profile,
  name,
}: {
  profile: UserProfile;
  name: string;
}) {
  return (
    <form action={saveAccountAction} className="card space-y-4">
      <div>
        <label className="label">Full name</label>
        <input
          name="full_name"
          className="input"
          defaultValue={name}
          placeholder="e.g. Alex Rivera"
        />
      </div>

      <div>
        <label className="label">Phone</label>
        <input
          name="phone"
          type="tel"
          className="input"
          defaultValue={profile.phone ?? ""}
          placeholder="(555) 123-4567"
        />
      </div>

      <div>
        <label className="label">Email</label>
        <input
          name="email"
          type="email"
          className="input"
          defaultValue={profile.email ?? ""}
          placeholder="you@example.com"
        />
        <p className="mt-1 text-xs text-stone-400">
          Changing this sends a confirmation link to the new address.
        </p>
      </div>

      <div>
        <label className="label">New password</label>
        <input
          name="password"
          type="password"
          className="input"
          autoComplete="new-password"
          placeholder="Leave blank to keep your current password"
        />
      </div>

      <button type="submit" className="btn btn-primary">
        Save changes
      </button>
    </form>
  );
}
