"use client";

import { useEffect, useRef } from "react";
// Type-only import - erased at compile time, so this client component never
// pulls flash.ts (and its next/headers dependency) into the browser bundle.
import type { Flash } from "@/lib/flash";
import { useToast } from "@/components/ToastProvider";

const FLASH_COOKIE = "hearth_flash";

// The server half of the toast system. Server Actions write a flash cookie
// (which survives their redirect/revalidate), the root layout reads it and
// passes it here, and this bridge pushes it into the same shared toast queue
// that client components use via useToast(). Then it clears the cookie so a
// refresh can't replay it. Dedupes by flash.id so one flash fires once.
export default function FlashBridge({ flash }: { flash: Flash | null }) {
  const toast = useToast();
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    if (!flash || flash.id === lastId.current) return;
    lastId.current = flash.id;
    toast[flash.type](flash.message);
    document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`;
  }, [flash, toast]);

  return null;
}
