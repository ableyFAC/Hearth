"use client";

import { useState } from "react";
import { removeHomeAction } from "@/lib/homeActions";

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
        className="ml-1 flex min-h-[44px] items-center px-2 text-xs font-medium text-stone-500 hover:text-red-600"
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
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-stone-900">
              Delete this home?
            </h3>
            <p className="mt-2 text-sm text-stone-600">
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
                <button className="btn bg-red-600 text-white hover:bg-red-700">
                  Delete home
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
