"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Keeps the contractor's Leads page live. A realtime subscription pushes an
// instant refresh when one of their leads is inserted or changes (a new request
// arrives, a status or unlock flips). The focus listener and slow poll are a
// safety net for when the realtime publication is not enabled on the table.
export default function LeadsRealtime({
  contractorId,
}: {
  contractorId: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => router.refresh();

    // The topic is unique per mount, not just per contractor: supabase-js
    // returns the SAME already-subscribed channel instance for a repeated
    // topic, and a second .on() on an already-subscribed channel throws. That
    // collision is reachable via React dev StrictMode's mount-cleanup-remount
    // (the cleanup's removeChannel is async, so the remount can win the
    // race), so a random suffix isolates every instance instead of sharing
    // one topic.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const topic = `leads-${contractorId}-` + Math.random().toString(36).slice(2);
      channel = supabase
        .channel(topic)
        // Changes to the pro's own leads (a job they were chosen for, status moves).
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "contractor_leads",
            filter: `contractor_id=eq.${contractorId}`,
          },
          refresh
        )
        // Any newly posted job (unassigned) so the open-jobs board updates live.
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "contractor_leads" },
          refresh
        )
        // A new application changes the applicant counts on the open-jobs board.
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "lead_applications" },
          refresh
        )
        .subscribe();
    } catch {
      // Realtime is strictly best-effort: the focus/poll paths below keep
      // this list working on their own, so a subscribe failure here must
      // never crash the leads page.
      console.warn("LeadsRealtime: realtime subscription failed, falling back to polling");
    }

    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 20000);

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // Best-effort cleanup: nothing to do if this fails, the channel is
          // going away along with the component either way.
        }
      }
      window.removeEventListener("focus", onFocus);
      clearInterval(poll);
    };
  }, [contractorId, router]);

  return null;
}
