import type { LucideIcon } from "lucide-react";
import { iconFor } from "@/lib/constants";

// Renders the lucide icon for a category value drawn from one of the shared
// lists in constants.ts (SYSTEM_TYPES, ISSUE_CATEGORIES, SERVICE_CATEGORIES,
// JOB_CATEGORIES, REMODEL_PROJECTS). Centralizes the iconFor() lookup +
// currentColor sizing so every render site stays a one-liner. Renders nothing
// when the value has no match, same as the old empty-string fallback did.
export default function CategoryIcon({
  list,
  value,
  className = "h-5 w-5",
}: {
  list: readonly { value: string; icon?: LucideIcon }[];
  value: string | null | undefined;
  className?: string;
}) {
  const Icon = iconFor(list, value);
  if (!Icon) return null;
  return <Icon className={className} aria-hidden="true" />;
}
