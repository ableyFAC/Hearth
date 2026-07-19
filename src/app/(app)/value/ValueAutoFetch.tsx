"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchAndSaveMarketValueAction } from "./actions";

// Kicks off the lazy RentCast AVM (market value) lookup the FIRST time someone
// opens /value, off the render path (the server component never writes to the
// DB during render). needsFetch is computed server-side from market_value
// being null plus an address on file.
//
// A per-property flag in localStorage means we attempt this exactly once, ever,
// per browser. This matters for the MISS case: if the address returns no value,
// market_value stays null, so without this guard the fetch would re-fire every
// single time the tab is reopened. We mark "tried" BEFORE firing, so even a
// failed or empty lookup is never retried on reopen. The in-memory ref still
// guards React Strict Mode's dev double-invoke within one mount.
export default function ValueAutoFetch({
  needsFetch,
  propertyId,
}: {
  needsFetch: boolean;
  propertyId: string;
}) {
  const router = useRouter();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!needsFetch || firedRef.current) return;
    firedRef.current = true;

    const flagKey = `hearth_avm_tried_${propertyId}`;
    try {
      // Already attempted once for this property: never run again, hit or miss.
      if (localStorage.getItem(flagKey)) return;
      localStorage.setItem(flagKey, "1");
    } catch {
      // localStorage unavailable (private mode, etc.): fall through and attempt
      // once for this mount anyway; the ref guard still prevents a double-fire.
    }

    fetchAndSaveMarketValueAction()
      .then((result) => {
        if (result?.ok) router.refresh();
      })
      .catch(() => {
        // Fail soft: leave whatever estimate the page already showed.
      });
  }, [needsFetch, propertyId, router]);

  return null;
}
