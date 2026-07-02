// The notification channels a homeowner can toggle. Kept in a plain module (not
// the "use server" actions file, which may only export async functions) so both
// the form and the save action can share one source of truth.
export const NOTIFICATION_CHANNELS = [
  {
    key: "pro_messages",
    label: "Messages from pros",
    desc: "When a contractor replies to one of your jobs.",
  },
  {
    key: "reminders",
    label: "Maintenance reminders",
    desc: "When a task or a seasonal check is due.",
  },
  {
    key: "alerts",
    label: "Weather and safety alerts",
    desc: "Freeze, heat, and product recall warnings for your home.",
  },
  {
    key: "product_updates",
    label: "Product news and tips",
    desc: "Occasional updates about new Hearth features.",
  },
] as const;
