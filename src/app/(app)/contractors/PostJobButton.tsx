"use client";

import { useFormStatus } from "react-dom";

// Submit button for the post-a-job form. Disables itself while the action is in
// flight so a double-click can't post the same job twice.
export default function PostJobButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" disabled={pending}>
      {pending ? "Posting…" : "Post job"}
    </button>
  );
}
