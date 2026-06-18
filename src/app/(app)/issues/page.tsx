import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { labelFor, iconFor, ISSUE_CATEGORIES, SEVERITIES } from "@/lib/constants";
import IssueForm from "./IssueForm";
import { resolveIssueAction } from "./actions";

const SEVERITY_STYLE: Record<string, string> = {
  low: "border-stone-200 bg-stone-50 text-stone-600",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  urgent: "border-red-200 bg-red-50 text-red-700",
};

export default async function IssuesPage() {
  const property = (await getActiveProperty())!;
  const supabase = createClient();

  const [{ data: issues }, { data: systems }] = await Promise.all([
    supabase
      .from("issues")
      .select("*")
      .eq("property_id", property.id)
      .order("created_at", { ascending: false }),
    supabase.from("home_systems").select("*").eq("property_id", property.id),
  ]);

  const open = (issues ?? []).filter((i) => i.status === "open");
  const resolved = (issues ?? []).filter((i) => i.status === "resolved");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Issues</h1>
          <p className="mt-1 text-sm text-stone-500">
            Log a problem and get connected with a vetted pro.
          </p>
        </div>
      </div>

      <IssueForm propertyId={property.id} systems={systems ?? []} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900">Open</h2>
        {open.length ? (
          <ul className="space-y-2">
            {open.map((i) => (
              <li key={i.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-stone-900">
                        {iconFor(ISSUE_CATEGORIES, i.category)}{" "}
                        {labelFor(ISSUE_CATEGORIES, i.category)}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${SEVERITY_STYLE[i.severity]}`}
                      >
                        {labelFor(SEVERITIES, i.severity)}
                      </span>
                      {i.converted_to_lead && (
                        <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">
                          pro requested
                        </span>
                      )}
                    </div>
                    {i.description && (
                      <p className="mt-1 text-sm text-stone-600">{i.description}</p>
                    )}
                  </div>
                  <form action={resolveIssueAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <button className="text-xs text-stone-400 hover:text-green-700">
                      Mark resolved
                    </button>
                  </form>
                </div>
                {!i.converted_to_lead && (
                  <Link
                    href={`/contractors?issue=${i.id}&category=${i.category}`}
                    className="inline-block text-sm font-medium text-hearth-700 hover:underline"
                  >
                    Connect me with a vetted pro →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No open issues. 🎉
          </p>
        )}
      </section>

      {resolved.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-stone-900">Resolved</h2>
          <ul className="space-y-2">
            {resolved.map((i) => (
              <li
                key={i.id}
                className="card flex items-center justify-between text-stone-500"
              >
                <span>{labelFor(ISSUE_CATEGORIES, i.category)}</span>
                {i.description && (
                  <span className="text-sm">{i.description}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
