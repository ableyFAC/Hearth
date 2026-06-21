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

    const channel = supabase
      .channel(`leads-${contractorId}`)
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

    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 20000);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      clearInterval(poll);
    };
  }, [contractorId, router]);

  return null;
}
