"use client";

import SubmitButton from "@/components/SubmitButton";
import { sendProSupportMessageAction } from "./actions";

// The in-app contact form for pros. Just a message: the team already has the
// company's contact details on file, so there is nothing else to fill in.
export default function ProSupportForm({ member }: { member: boolean }) {
  return (
    <form
      action={sendProSupportMessageAction}
      className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-stone-800"
    >
      <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
        Contact support
      </h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
        Send us a message and we will get back to you. We reply using the
        contact details on your company profile.
      </p>

      {member && (
        <p className="mt-3 inline-block rounded-full border border-hearth-200 bg-hearth-50 px-3 py-1 text-xs font-medium text-hearth-800 dark:border-hearth-800 dark:bg-hearth-900/40 dark:text-hearth-200">
          Priority support: Pro members go to the front of the line.
        </p>
      )}

      <div className="mt-4">
        <label className="label">How can we help?</label>
        <textarea
          name="message"
          rows={4}
          required
          className="input"
          placeholder="Tell us what is going on."
        />
      </div>

      <div className="mt-4">
        <SubmitButton pendingLabel="Sending…">Send message</SubmitButton>
      </div>
    </form>
  );
}
