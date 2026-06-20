import { redirect } from "next/navigation";
import { getCurrentContractor } from "@/lib/contractor";
import ProfileTabs from "./ProfileTabs";

export default async function ProProfilePage() {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  return (
    <div className="mx-auto max-w-4xl">
      <ProfileTabs contractor={contractor} />
    </div>
  );
}
