"use client";

import { complianceStatus } from "@/lib/proCompliance";
import ReferralCard from "@/components/pro/ReferralCard";
import ComplianceCard from "@/components/pro/ComplianceCard";

type DocState = {
  expires: string | null;
  docPath: string | null;
};

// Account: referrals and the license/insurance compliance calendar, folded
// into one collapsed-by-default panel so /pro/business doesn't stack two
// more full sections below Insights. Collapsed, the header still surfaces
// whether a document needs attention, so tucking this away never hides
// something urgent.
export default function AccountPanel({
  referralCode,
  license,
  insurance,
}: {
  referralCode: string;
  license: DocState;
  insurance: DocState;
}) {
  const licenseStatus = complianceStatus(license.expires).status;
  const insuranceStatus = complianceStatus(insurance.expires).status;

  // Expired takes priority over merely expiring, and license over insurance
  // when both need attention: one short label is enough for a collapsed row.
  const alert =
    licenseStatus === "expired"
      ? { tone: "bg-red-500", label: "License expired" }
      : insuranceStatus === "expired"
      ? { tone: "bg-red-500", label: "Insurance expired" }
      : licenseStatus === "expiring"
      ? { tone: "bg-amber-500", label: "License expiring soon" }
      : insuranceStatus === "expiring"
      ? { tone: "bg-amber-500", label: "Insurance expiring soon" }
      : null;

  return (
    <details className="group space-y-4">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 text-lg font-semibold text-stone-900 marker:text-stone-400 [&::-webkit-details-marker]:hidden">
        <span className="inline-block transition-transform group-open:rotate-90">
          ▸
        </span>
        Account
        {alert && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
            <span
              className={`inline-block h-2 w-2 rounded-full ${alert.tone}`}
            />
            {alert.label}
          </span>
        )}
      </summary>

      <div className="space-y-4">
        <ReferralCard code={referralCode} />
        <ComplianceCard license={license} insurance={insurance} />
      </div>
    </details>
  );
}
