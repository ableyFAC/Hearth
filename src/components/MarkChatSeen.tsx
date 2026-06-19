"use client";

import { useEffect } from "react";

// Fires the "mark this conversation as read" server action whenever the open
// thread changes, so the unread badge/dots clear once you've looked at it.
export default function MarkChatSeen({
  leadId,
  action,
}: {
  leadId: string;
  action: (leadId: string) => Promise<void>;
}) {
  useEffect(() => {
    action(leadId);
  }, [leadId, action]);
  return null;
}
