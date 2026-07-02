import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { labelFor, iconFor, SYSTEM_TYPES } from "@/lib/constants";
import DocumentUpload from "@/components/DocumentUpload";
import {
  applyDocumentToTwinAction,
  deleteDocumentAction,
} from "@/lib/document-actions";

const DOC_TYPE_LABEL: Record<string, string> = {
  warranty: "Warranty",
  manual: "Manual",
  receipt: "Receipt",
  inspection_report: "Inspection",
  other: "Document",
};

// Format YYYY-MM-DD as "Mar 2028" without going through Date (timezone-safe,
// and avoids the argless-Date restriction used elsewhere in the app).
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  const mon = MONTHS[Number(m[2]) - 1];
  return mon ? `${mon} ${m[1]}` : d;
}

export default async function DocumentsPage() {
  const property = (await getActiveProperty())!;
  const supabase = createClient();

  const { data: docs } = await supabase
    .from("documents")
    .select(
      "id, title, doc_type, system_type, brand, model, install_year, warranty_expires, summary, file_url, applied_at, uploaded_at"
    )
    .eq("property_id", property.id)
    .order("uploaded_at", { ascending: false });

  const list = docs ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-1">
        <h1 className="text-2xl font-semibold text-stone-900">Documents</h1>
      </header>
      <p className="mb-5 text-sm text-stone-500">
        Your home's paperwork in one place. Warranties, manuals, receipts, and
        model labels all live here. Hearth reads each one and can drop the
        details straight into your home profile, so you never dig for a manual
        or a warranty date again.
      </p>

      <DocumentUpload propertyId={property.id} />

      <div className="mt-6 space-y-3">
        {list.length === 0 && (
          <p className="rounded-xl border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-400">
            No documents yet. Add your first one above.
          </p>
        )}

        {list.map((d) => {
          const facts = [
            d.brand && d.model
              ? `${d.brand} ${d.model}`
              : d.brand || d.model || null,
            d.install_year ? `installed ${d.install_year}` : null,
            d.warranty_expires
              ? `warranty to ${fmtDate(d.warranty_expires)}`
              : null,
          ].filter(Boolean);

          const canApply =
            !d.applied_at && (d.system_type || d.warranty_expires);

          return (
            <div
              key={d.id}
              className="flex gap-3 rounded-xl border border-stone-200 bg-white p-4"
            >
              <div className="text-2xl">
                {d.system_type ? iconFor(SYSTEM_TYPES, d.system_type) : "📄"}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={d.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-medium text-stone-900 hover:text-hearth-700 hover:underline"
                  >
                    {d.title || "Home document"}
                  </a>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                    {DOC_TYPE_LABEL[d.doc_type ?? "other"] ?? "Document"}
                  </span>
                  {d.system_type && (
                    <span className="rounded-full bg-hearth-50 px-2 py-0.5 text-xs text-hearth-700">
                      {labelFor(SYSTEM_TYPES, d.system_type)}
                    </span>
                  )}
                </div>

                {d.summary && (
                  <p className="mt-1 text-sm text-stone-600">{d.summary}</p>
                )}
                {facts.length > 0 && (
                  <p className="mt-1 text-xs text-stone-400">
                    {facts.join(" · ")}
                  </p>
                )}

                <div className="mt-2 flex items-center gap-3">
                  {canApply && (
                    <form action={applyDocumentToTwinAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <button
                        type="submit"
                        className="rounded-md bg-hearth-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-hearth-700"
                      >
                        + Add to my home
                      </button>
                    </form>
                  )}
                  {d.applied_at && (
                    <span className="text-xs font-medium text-green-600">
                      ✓ Added to your home
                    </span>
                  )}
                  <form action={deleteDocumentAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <button
                      type="submit"
                      className="text-xs text-stone-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
