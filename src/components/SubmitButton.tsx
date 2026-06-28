"use client";

import { useFormStatus } from "react-dom";

// A form submit button that disables itself and shows a pending label while the
// server action is in flight, so a homeowner can't double-submit (e.g. log the
// same issue twice). Must be rendered INSIDE the <form> it submits.
export default function SubmitButton({
  children,
  pendingLabel,
  className = "btn-primary flex-1",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel ?? "Saving…" : children}
    </button>
  );
}
