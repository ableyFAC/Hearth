import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import IssueForm from "./IssueForm";
import IssueRow from "./IssueRow";

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
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Issues</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Log a problem and get connected with a local pro.
          </p>
        </div>
      </div>

      <IssueForm propertyId={property.id} systems={systems ?? []} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Open</h2>
        {open.length ? (
          <ul className="space-y-2">
            {open.map((i) => (
              <IssueRow key={`${i.id}-${i.status}`} issue={i} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
            No open issues. 🎉
          </p>
        )}
      </section>

      {resolved.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Resolved</h2>
          <ul className="space-y-2">
            {resolved.map((i) => (
              <IssueRow key={`${i.id}-${i.status}`} issue={i} initialResolved />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
