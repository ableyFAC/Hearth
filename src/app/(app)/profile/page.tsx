import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { assessSystem } from "@/lib/health";
import { labelFor, iconFor, SYSTEM_TYPES } from "@/lib/constants";
import SystemForm from "./SystemForm";
import { deleteSystemAction, quickAddSystemAction } from "./actions";

const STAGE_STYLE: Record<string, string> = {
  healthy: "bg-green-50 text-green-700 border-green-200",
  aging: "bg-amber-50 text-amber-700 border-amber-200",
  due: "bg-red-50 text-red-700 border-red-200",
  unknown: "bg-stone-50 text-stone-500 border-stone-200",
};

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
            {systems.map((s) => {
              const h = assessSystem(s);
              return (
                <li key={s.id} className="card flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-stone-900">
                        {iconFor(SYSTEM_TYPES, s.system_type)}{" "}
                        {labelFor(SYSTEM_TYPES, s.system_type)}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${STAGE_STYLE[h.stage]}`}
                      >
                        {h.stage}
                      </span>
                    </div>
                    {s.material_or_model && (
                      <p className="text-sm text-stone-500">{s.material_or_model}</p>
                    )}
                    <p className="mt-1 text-sm text-stone-600">{h.message}</p>
                    {s.notes && (
                      <p className="mt-1 text-xs text-stone-400">{s.notes}</p>
                    )}
                  </div>
                  <form action={deleteSystemAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="text-xs text-stone-400 hover:text-red-600">
                      Remove
                    </button>
                  </form>
                </li>
              );
            })}
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
