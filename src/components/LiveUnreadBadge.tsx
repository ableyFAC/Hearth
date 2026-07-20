"use client";

import { useUnreadContext, useUnreadPoll, type UnreadRole } from "@/components/UnreadProvider";

// Renders the unread-message count badge. When mounted under an UnreadProvider
// (see Nav.tsx, which wraps both the desktop and mobile nav renderings in a
// single provider) this just reads the shared count from context - no poll,
// no realtime subscription of its own. When there's no provider above it
// (e.g. ProNav, which still renders this component twice with no shared
// provider), it falls back to its own self-contained poll + realtime
// subscription via useUnreadPoll, exactly as this component used to work
// before the provider existed, so that shell keeps working unchanged.
export default function LiveUnreadBadge({ role }: { role: UnreadRole }) {
  const ctx = useUnreadContext();
  const usingProvider = ctx !== null && ctx.role === role;
  const selfCount = useUnreadPoll(role, !usingProvider);
  const count = usingProvider ? ctx!.count : selfCount;

  if (!count) return null;
  return (
    <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
      {count}
    </span>
  );
}
