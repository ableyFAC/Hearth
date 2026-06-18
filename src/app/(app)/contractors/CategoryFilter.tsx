"use client";

import { useRouter } from "next/navigation";
import { ISSUE_CATEGORIES } from "@/lib/constants";

// Changing the category re-filters the matched pros by updating the URL, which
// re-runs the server query. Stays inside the request form so its value is still
// submitted when the owner requests quotes.
export default function CategoryFilter({
  category,
  issueId,
}: {
  category: string;
  issueId: string;
}) {
  const router = useRouter();

  return (
    <select
      name="category"
      className="select"
      defaultValue={category}
      onChange={(e) => {
        const params = new URLSearchParams();
        if (e.target.value) params.set("category", e.target.value);
        if (issueId) params.set("issue", issueId);
        router.push(`/contractors?${params.toString()}`);
      }}
      required
    >
      <option value="" disabled>
        Choose a category
      </option>
      {ISSUE_CATEGORIES.map((c) => (
        <option key={c.value} value={c.value}>
          {c.icon} {c.label}
        </option>
      ))}
    </select>
  );
}
