import { ISSUE_CATEGORIES, REMODEL_PROJECTS } from "@/lib/constants";

// The "what do you need?" picker for posting a job. Lists repair/issue
// categories plus common projects, so a homeowner can post a remodel-type job
// too. Project options map to the matchable contractor category. defaultValue
// pre-fills it when arriving from a category link (e.g. a project chip on Home).
export default function CategoryFilter({ category }: { category: string }) {
  return (
    <select name="category" className="select" defaultValue={category} required>
      <option value="" disabled>
        Choose what you need
      </option>
      <optgroup label="Repairs & issues">
        {ISSUE_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.icon} {c.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Projects">
        {REMODEL_PROJECTS.map((p) => (
          <option key={p.label} value={p.category}>
            {p.icon} {p.label}
          </option>
        ))}
        <option value="other">🔧 Other</option>
      </optgroup>
    </select>
  );
}
