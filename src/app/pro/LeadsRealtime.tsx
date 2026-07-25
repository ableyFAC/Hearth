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

    // Pending DIRECT requests (contractor_leads rows with contractor_id null,
    // aimed at this pro) are invisible to them under RLS, so their
    // contractor_leads INSERT never reaches this client. But each direct
    // request also writes a public.notifications row for the target pro, and
    // that row IS RLS-visible to its owner, so we subscribe to the pro's own
    // notification inserts to catch them. A short debounce collapses a burst of
    // notifications (a request can fan out more than one) into a single
    // refresh. Needs the signed-in user's id, which is async, so this channel
    // is wired up after getUser() resolves and tracked for cleanup separately.
    let notifChannel: ReturnType<typeof supabase.channel> | null = null;
    let notifTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const debouncedRefresh = () => {
      if (notifTimer) clearTimeout(notifTimer);
      notifTimer = setTimeout(refresh, 500);
    };
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (cancelled || !user) return;
        try {
          const topic =
            `leads-notif-${user.id}-` + Math.random().toString(36).slice(2);
          notifChannel = supabase
            .channel(topic)
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "notifications",
                filter: `user_id=eq.${user.id}`,
              },
              debouncedRefresh
            )
            .subscribe();
        } catch {
          // Same best-effort posture as the leads channel: the poll/focus
          // paths still surface a new direct request on their own.
          console.warn("LeadsRealtime: notifications subscription failed, falling back to polling");
        }
      })
      .catch(() => {
        // getUser can reject (e.g. offline); the poll/focus fallback covers it.
      });

    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 20000);

    return () => {
      cancelled = true;
      if (notifTimer) clearTimeout(notifTimer);
      if (notifChannel) {
        try {
          supabase.removeChannel(notifChannel);
        } catch {
          // Best-effort cleanup, same as the leads channel below.
        }
      }
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
