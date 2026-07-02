"use client";

import SubmitButton from "@/components/SubmitButton";
import { saveSupportMessageAction } from "./actions";

// The in-app contact form. Name, email, and phone are prefilled from the
// account so the homeowner rarely has to type them, and they tell us how they
// would prefer to be reached.
export default function SupportForm({
  name,
  email,
  phone,
}: {
  name: string;
  email: string;
  phone: string;
}) {
  return (
    <form
      action={saveSupportMessageAction}
      className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-base font-semibold text-stone-900">Contact us</h2>
      <p className="mt-1 text-sm text-stone-600">
        Send us a message and we will get back to you.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input name="name" defaultValue={name} className="input" />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={email}
            className="input"
          />
        </div>
        <div>
          <label className="label">Phone</label>
          <input name="phone" defaultValue={phone} className="input" />
        </div>
      </div>

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
        <SubmitButton>Send message</SubmitButton>
      </div>
    </form>
  );
}
