"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

// The same 20-character floor postJobAction enforces on the server. Catching it
// here first means a too-short post never submits, so the form (and any photos
// already uploaded into its hidden inputs) is never wiped by the server-side
// redirect that drops the POST body.
const MIN_DESCRIPTION = 20;

// Submit button for the post-a-job form. Disables itself while the action is in
// flight so a double-click can't post the same job twice, and blocks submit
// with an inline message when the description is too short (mirroring the
// server), so nothing the homeowner typed or uploaded gets lost.
export default function PostJobButton() {
  const { pending } = useFormStatus();
  const [error, setError] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  function check(e: React.MouseEvent<HTMLButtonElement>) {
    const form = btnRef.current?.closest("form");
    if (!form) return;
    const box = form.elements.namedItem(
      "message"
    ) as HTMLTextAreaElement | null;
    const msg = (box?.value ?? "").trim();
    const issueId =
      (form.elements.namedItem("issue_id") as HTMLInputElement | null)?.value ??
      "";

    // Mirror postJobAction exactly: a standalone post needs 20+ characters; a
    // post linked to an issue can fall back to that issue's own description
    // only when the box is left blank, so a blank-but-linked post is allowed
    // while a short (non-empty) one is not.
    const tooShort =
      msg.length < MIN_DESCRIPTION && !(issueId.length > 0 && msg.length === 0);

    if (tooShort) {
      e.preventDefault();
      setError(
        "Please describe the job in at least 20 characters so pros know what they're applying to."
      );
      box?.focus();
      return;
    }
    setError(null);
  }

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <button
        ref={btnRef}
        onClick={check}
        className="btn-primary w-full"
        disabled={pending}
      >
        {pending ? "Posting…" : "Post job"}
      </button>
    </div>
  );
}
