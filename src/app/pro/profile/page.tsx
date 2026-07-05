import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContractor } from "@/lib/contractor";
import { hasProPlan } from "@/lib/subscription";
import ProfileTabs from "./ProfileTabs";
import type { ProProject, ProProjectPhoto } from "./ProjectsCard";

export default async function ProProfilePage() {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  // Membership only decides which public-page extras (logo, about, badge) can
  // be edited, plus the project limits. It never touches leads, ratings, or
  // reviews.
  const member = await hasProPlan();

  // The pro's project portfolio (0045) with photos, for the Projects tab.
  // Cast: the 0045 tables aren't in the generated types (database.types.ts is
  // not regenerated here). Degrades to an empty list if the migration hasn't
  // run yet.
  const supabase = createClient();
  const { data: projectRows } = await (supabase.from as any)("pro_projects")
    .select("*, pro_project_photos(*)")
    .eq("contractor_id", contractor.id)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });

  const projects: ProProject[] = (
    Array.isArray(projectRows) ? projectRows : []
  ).map((row: any) => ({
    id: row.id,
    title: row.title,
    category: row.category ?? null,
    description: row.description ?? null,
    months: row.months ?? null,
    sort: row.sort ?? 0,
    created_at: row.created_at,
    photos: (Array.isArray(row.pro_project_photos)
      ? (row.pro_project_photos as ProProjectPhoto[])
      : []
    )
      .slice()
      .sort((a, b) => a.sort - b.sort),
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <ProfileTabs contractor={contractor} member={member} projects={projects} />
    </div>
  );
}
