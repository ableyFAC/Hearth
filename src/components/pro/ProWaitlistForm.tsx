"use client";

import { useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import Honeypot from "@/components/Honeypot";
import { JOB_CATEGORIES } from "@/lib/constants";
import { joinProWaitlistAction } from "@/app/pros/actions";
import { PRO_WAITLIST_CONFIRMATION } from "@/lib/previewMode";

// The email capture on ProsComingSoon. The only client component on that page.
//
// CONTROLLED FIELDS, same reason ContactForm.tsx spells out: React 19 resets a
// <form action> after the action resolves, including on the error return, so
// an uncontrolled field would wipe what somebody typed with the very submit
// that produced the error message they are reading.
//
// ONE CONFIRMATION FOR EVERY OUTCOME. The action never says whether the email
// was already on the list (see its NEVER REVEAL comment); this component must
// not undo that by rendering anything different for a repeat signup. It sees
// `{ ok: true }` either way and shows the one sentence.
export default function ProWaitlistForm({ source = "pros" }: { source?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState("");
  const [trade, setTrade] = useState("");
  const [city, setCity] = useState("");

  if (done) {
    return (
      <p
        role="status"
        className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-stone-700 dark:border-white/10 dark:bg-white/5 dark:text-stone-200"
      >
        {PRO_WAITLIST_CONFIRMATION}
      </p>
    );
  }

  return (
    <form
      className="card"
      action={async (fd) => {
        setError(null);
        const res = await joinProWaitlistAction(fd);
        if (res && !res.ok) {
          setError(res.error);
          return;
        }
        setDone(true);
      }}
    >
      {/* Never touched by a real visitor; see src/components/Honeypot.tsx.
          Uncontrolled on purpose - restoring it after React's reset is the
          one thing we would not want. */}
      <Honeypot />
      <input type="hidden" name="source" value={source} />

      <div>
        <label className="label" htmlFor="pro-waitlist-email">
          Email
        </label>
        <input
          id="pro-waitlist-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          maxLength={254}
        />
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="pro-waitlist-trade">
          Trade
        </label>
        <select
          id="pro-waitlist-trade"
          name="trade"
          value={trade}
          onChange={(e) => setTrade(e.target.value)}
          className="select"
        >
          <option value="">Choose a trade</option>
          {JOB_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="pro-waitlist-city">
          City
        </label>
        <input
          id="pro-waitlist-city"
          name="city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="input"
          maxLength={80}
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-6 flex">
        <SubmitButton pendingLabel="Adding you...">Tell me when it opens</SubmitButton>
      </div>
    </form>
  );
}
