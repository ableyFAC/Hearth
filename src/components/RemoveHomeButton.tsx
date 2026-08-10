"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { removeHomeAction } from "@/lib/homeActions";

// The delete button itself, split out so useFormStatus can read the pending
// state of the <form action={removeHomeAction}> it's rendered inside (the
// hook only sees the nearest enclosing form from within a child component,
// not from RemoveHomeButton's own scope). Disables the button and swaps in a
// pending label so the delete round trip can't be double-tapped.
function ConfirmDeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="btn bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
    >
      {pending ? "Deleting…" : "Delete home"}
    </button>
  );
}

// Styled in-app confirmation modal (replaces the browser confirm() dialog).
export default function RemoveHomeButton({
  id,
  label,
}: {
  id: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-1 flex min-h-[44px] items-center px-2 text-xs font-medium text-stone-500 hover:text-red-600 dark:text-stone-400 dark:hover:text-red-400"
        title="Delete this home"
      >
        Delete
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-pop dark:border dark:border-white/10 dark:bg-stone-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
              Delete this home?
            </h3>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              <span className="font-medium">{label}</span> and all of its
              systems, issues, photos, and contractor leads will be permanently
              removed. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <form action={removeHomeAction}>
                <input type="hidden" name="id" value={id} />
                <ConfirmDeleteButton />
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
