"use client";

import { useState } from "react";

// A two-step submit for the Change plan forms: the first tap arms it, then a
// small inline "Are you sure?" with Yes/Cancel actually submits. Keeps a plan
// switch (which bills or reschedules billing) from firing on a stray click,
// without a jarring browser popup. Shared by the homeowner /plus and pro
// /pro/plus billing cards so the two confirm flows can't drift apart.
export default function ConfirmSubmit({
  label,
  note,
  yesLabel,
  subtle,
}: {
  label: string;
  // One short line restating what will happen, shown while armed.
  note: string;
  yesLabel: string;
  // Renders the idle state as quiet text instead of a button, for actions that
  // should be findable but not promoted (e.g. cancel membership).
  subtle?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className={
          subtle
            ? "text-xs text-stone-500 underline-offset-2 hover:text-stone-600 hover:underline"
            : "btn-secondary"
        }
      >
        {label}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-stone-600">{note}</p>
      <div className="flex items-center justify-center gap-2">
        <button type="submit" className="btn-primary">
          {yesLabel}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
