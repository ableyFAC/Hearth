"use client";

import { useFormStatus } from "react-dom";

// A form submit button that disables itself and shows a pending label while the
// server action is in flight, so a homeowner can't double-submit (e.g. log the
// same issue twice). Must be rendered INSIDE the <form> it submits.
export default function SubmitButton({
  children,
  pendingLabel,
  className = "btn-primary flex-1",
  disabled = false,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  // Optional caller-driven disable (e.g. "nothing changed to submit"), ORed
  // with the in-flight pending state. Defaults to false, so existing callers
  // are unaffected.
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className={className}>
      {pending ? pendingLabel ?? "Saving…" : children}
    </button>
  );
}
