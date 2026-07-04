"use client";

import { useState } from "react";
import { postJobAction } from "../contractors/actions";
import { TIMING_OPTIONS } from "@/lib/constants";
import PhoneInput from "@/components/PhoneInput";
import SubmitButton from "@/components/SubmitButton";

const REASON_OPTIONS = [
  { value: "buying", label: "Buying a home" },
  { value: "selling", label: "Selling or pre-listing" },
  { value: "maintenance", label: "Maintenance baseline" },
  { value: "insurance", label: "Insurance requirement" },
];

const REASON_LABEL: Record<string, string> = Object.fromEntries(
  REASON_OPTIONS.map((r) => [r.value, r.label])
);

// Fold the reason + any known concerns into the one description field
// postJobAction reads, so the inspector applying sees useful context.
function composeMessage(reason: string, concerns: string): string {
  const label = REASON_LABEL[reason] ?? "";
  const trimmed = concerns.trim();
  if (label && trimmed) return `Reason: ${label}. Known concerns: ${trimmed}`;
  if (label) return `Reason: ${label}.`;
  return trimmed;
}

// Posts a home_inspection job through the same postJobAction every other
// trade uses (cap checks, dedupe, pro notifications all live there). This
// form only supplies the fields that action reads: category, timing,
// message, and the homeowner contact snapshot.
export default function InspectionRequest({
  defaultName,
  defaultEmail,
  defaultPhone,
}: {
  defaultName: string;
  defaultEmail: string;
  defaultPhone: string;
}) {
  const [reason, setReason] = useState("buying");
  const [concerns, setConcerns] = useState("");

  return (
    <form action={postJobAction} className="space-y-4">
      <input type="hidden" name="category" value="home_inspection" />
      <input
        type="hidden"
        name="message"
        value={composeMessage(reason, concerns)}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Reason for the inspection</label>
          <select
            className="select"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {REASON_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Preferred timing</label>
          <select name="timing" className="select" defaultValue="few_weeks">
            {TIMING_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Known concerns (optional)</label>
        <textarea
          className="textarea"
          rows={3}
          value={concerns}
          onChange={(e) => setConcerns(e.target.value)}
          placeholder="Anything you already know about, such as a leaky roof or an older water heater"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">First and last name</label>
          <input
            name="homeowner_name"
            className="input"
            placeholder="Jane Doe"
            defaultValue={defaultName}
            required
          />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            name="homeowner_email"
            type="email"
            className="input"
            placeholder="you@example.com"
            defaultValue={defaultEmail}
          />
        </div>
        <div>
          <label className="label">Phone</label>
          <PhoneInput name="homeowner_phone" defaultValue={defaultPhone} />
        </div>
      </div>

      <SubmitButton pendingLabel="Requesting…" className="btn-primary w-full">
        Request an inspection
      </SubmitButton>
      <p className="text-xs text-stone-400">
        Your contact stays private. Only the inspector you choose gets your
        name, address, and contact details.
      </p>
    </form>
  );
}
