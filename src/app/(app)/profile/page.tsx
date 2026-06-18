import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { SYSTEM_TYPES } from "@/lib/constants";
import SystemForm from "./SystemForm";
import SystemRow from "./SystemRow";
import { quickAddSystemAction } from "./actions";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { welcome?: string };
}) {
  const property = (await getActiveProperty())!;
  const supabase = createClient();
  const { data: systems } = await supabase
    .from("home_systems")
    .select("*")
    .eq("property_id", property.id)
    .order("created_at", { ascending: true });

  const existingTypes = new Set((systems ?? []).map((s) => s.system_type));
  const quickAddTypes = SYSTEM_TYPES.filter((t) => !existingTypes.has(t.value));

  return (
    <div className="space-y-8">
      {searchParams.welcome && (
        <div className="rounded-xl border border-hearth-200 bg-hearth-50 p-4 text-sm text-hearth-800">
          🎉 Your home is claimed. Now add your systems — it&apos;s what powers
          maintenance reminders and your Home Health Score.
        </div>
      )}

      <section>
        <h1 className="text-2xl font-semibold text-stone-900">Home Profile</h1>
        <p className="mt-1 text-sm text-stone-500">
          {property.address_line1}
          {property.city ? `, ${property.city}` : ""} · Built{" "}
          {property.year_built ?? "—"} · {property.sqft ?? "—"} sqft ·{" "}
          {property.beds ?? "—"} bd / {property.baths ?? "—"} ba
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-900">
            Systems inventory
          </h2>
        </div>
        <p className="text-sm text-stone-500">
          We auto-filled the systems most homes have and estimated their ages
          from your build year — tap <span className="font-medium">Edit</span> on
          any to correct a date.
        </p>

        {quickAddTypes.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-stone-500">
              Quick add — one tap, fill in details later:
            </p>
            <div className="flex flex-wrap gap-2">
              {quickAddTypes.map((t) => (
                <form key={t.value} action={quickAddSystemAction}>
                  <input type="hidden" name="system_type" value={t.value} />
                  <button className="btn-secondary text-sm">
                    {t.icon} + {t.label}
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}

        {systems && systems.length > 0 ? (
          <ul className="space-y-3">
            {systems.map((s) => (
              <SystemRow key={s.id} system={s} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No systems yet. Add your roof, HVAC, and water heater first — those
            drive the most useful reminders.
          </p>
        )}

        <SystemForm />
      </section>
    </div>
  );
}
