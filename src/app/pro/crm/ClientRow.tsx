import Link from "next/link";

const STAGE_LABEL: Record<string, string> = {
  lead: "Lead",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

const STAGE_STYLE: Record<string, string> = {
  lead: "border-stone-200 bg-stone-50 text-stone-600",
  quoted: "border-hearth-200 bg-hearth-50 text-hearth-700",
  won: "border-green-200 bg-green-50 text-green-700",
  lost: "border-stone-200 bg-stone-100 text-stone-500",
};

export type ProClientRow = {
  id: string;
  lead_id: string | null;
  client_name: string;
  stage: string;
  note: string | null;
  follow_up_on: string | null;
  phone: string | null;
  email: string | null;
  est_value_cents: number | null;
};

function formatValue(cents: number | null): string | null {
  if (cents === null || cents === undefined) return null;
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

// A scannable client card for the stage grouped pipeline list. All the field
// level editing (contact info, value, stage, follow up, the notes timeline)
// now lives on the client detail page, so this card is read only plus quick
// links: call, email, open the linked chat, or open the detail page.
export default function ClientRow({
  client,
  todayStr,
  latestNote,
}: {
  client: ProClientRow;
  todayStr: string;
  latestNote: string | null;
}) {
  const overdue = Boolean(
    client.follow_up_on && client.follow_up_on < todayStr
  );
  const dueToday = Boolean(
    client.follow_up_on && client.follow_up_on === todayStr
  );
  const value = formatValue(client.est_value_cents);
  const notePreview =
    latestNote ?? client.note ?? null;
  const preview =
    notePreview && notePreview.length > 80
      ? `${notePreview.slice(0, 80)}...`
      : notePreview;

  return (
    <li className="card flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-stone-900">
            {client.client_name}
          </span>
          <span className={`chip border ${STAGE_STYLE[client.stage] ?? ""}`}>
            {STAGE_LABEL[client.stage] ?? client.stage}
          </span>
          {value && (
            <span className="stat-number text-sm text-stone-700">
              {value}
            </span>
          )}
        </div>
        {preview && <p className="text-sm text-stone-500">{preview}</p>}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {client.phone && (
            <a
              href={`tel:${client.phone}`}
              className="font-medium text-hearth-700 hover:underline"
            >
              {client.phone}
            </a>
          )}
          {client.email && (
            <a
              href={`mailto:${client.email}`}
              className="font-medium text-hearth-700 hover:underline"
            >
              {client.email}
            </a>
          )}
          {client.follow_up_on && (
            <span
              className={
                overdue
                  ? "font-medium text-red-600"
                  : dueToday
                    ? "font-medium text-amber-700"
                    : "text-stone-400"
              }
            >
              Follow up {client.follow_up_on}
              {overdue ? " (overdue)" : dueToday ? " (today)" : ""}
            </span>
          )}
          {client.lead_id && (
            <Link
              href={`/pro/chats?lead=${client.lead_id}`}
              className="font-medium text-hearth-700 hover:underline"
            >
              Open chat
            </Link>
          )}
        </div>
      </div>
      <Link
        href={`/pro/crm/${client.id}`}
        className="btn-secondary shrink-0 text-sm"
      >
        Open
      </Link>
    </li>
  );
}
