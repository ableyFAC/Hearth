"use client";

import { useState } from "react";
import { SERVICE_CATEGORIES, REMODEL_PROJECTS } from "@/lib/constants";

// The "what do you need?" picker for posting a job. Lists every service category
// a contractor can offer, plus common projects that map to one of them, so a
// homeowner's job reaches the right pros. Project options map to the matchable
// contractor category. defaultValue pre-fills it when arriving from a category
// link (e.g. a project chip on Home). When "Other" is chosen we nudge the owner
// to describe the service, since that free text is what matches them to a pro's
// custom services.
export default function CategoryFilter({
  category,
  id,
}: {
  category: string;
  // Lets a surrounding <label htmlFor> point at this select.
  id?: string;
}) {
  const [value, setValue] = useState(category);

  return (
    <>
      <select
        name="category"
        id={id}
        className="select"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
      >
        <option value="" disabled>
          Choose what you need
        </option>
        <optgroup label="Services">
          {SERVICE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Popular projects">
          {REMODEL_PROJECTS.map((p) => (
            <option key={p.label} value={p.category}>
              {p.label}
            </option>
          ))}
        </optgroup>
        <option value="other">Other (describe it)</option>
      </select>
      {value === "other" && (
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          Describe the service in “Details” below so we can match you to a pro who
          offers it.
        </p>
      )}
    </>
  );
}
