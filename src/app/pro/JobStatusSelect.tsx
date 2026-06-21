"use client";

import { useRef } from "react";
import { updateLeadStatusAction } from "./actions";

// Compact outcome selector for an assigned job. Replaces the Mark won / Mark
// lost buttons with one dropdown that submits as soon as you change it.
const OPTIONS = [
  { value: "new", label: "New lead" },
  { value: "accepted", label: "Active" },
  { value: "closed", label: "Won" },
  { value: "lost", label: "Lost" },
];

export default function JobStatusSelect({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const current = OPTIONS.some((o) => o.value === status) ? status : "accepted";

  return (
    <form ref={formRef} action={updateLeadStatusAction}>
      <input type="hidden" name="id" value={id} />
      <label className="flex items-center gap-2 text-sm text-stone-500">
        Status
        <select
          key={current}
          name="status"
          defaultValue={current}
          onChange={() => formRef.current?.requestSubmit()}
          className="select !w-auto py-1 text-sm"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
