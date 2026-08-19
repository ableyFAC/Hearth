"use client";

import { useState } from "react";
import { LAUNCH_CITIES } from "./launchCities";

// The service-area question: exactly the two cities Hearth serves, checkboxes
// because a pro can serve both. Replaces the free-text city combobox that used
// to live here, in signup AND in the profile editor
// (src/app/pro/profile/PublicProfileForm.tsx), which posts the identical field
// names to the identical action. See ./launchCities.ts for why one answer
// writes service_area, serves_orange_county, and launch_cities.
//
// AT LEAST ONE REQUIRED, natively: `required` sits on BOTH boxes while zero
// are checked, so the browser refuses the submit and points at the field;
// checking either one drops `required` from both, so the other box is free to
// stay unchecked. No custom validation layer, and saveCompanyAction still
// enforces the same rule server-side for anything that isn't a browser.
//
// The hidden marker is what tells saveCompanyAction this form actually asked
// the question, matching the missing-field-safe discipline the rest of that
// action uses: a form without the marker must never have its stored service
// area rewritten from an absent answer.
// `defaultCities` is what the profile editor passes so a returning pro sees
// their stored pick already checked (signup passes nothing and starts empty).
// Anything that isn't a launch city is ignored here, and selectLaunchCities
// drops it server-side too, so a stale or hand-edited value can never
// pre-check a city Hearth doesn't serve.
export default function LaunchCityCheckboxes({
  defaultCities = [],
}: {
  defaultCities?: readonly string[];
}) {
  const initial = LAUNCH_CITIES.filter((city) =>
    defaultCities.some((c) => String(c).trim().toLowerCase() === city.toLowerCase())
  );
  const [checked, setChecked] = useState<readonly string[]>(initial);
  const noneChecked = checked.length === 0;

  return (
    <div className="space-y-2">
      <input type="hidden" name="service_cities_present" value="1" />
      {LAUNCH_CITIES.map((city) => (
        <label
          key={city}
          className="flex items-start gap-2 text-sm text-stone-700 dark:text-stone-300"
        >
          <input
            type="checkbox"
            name="service_cities"
            value={city}
            defaultChecked={initial.includes(city)}
            required={noneChecked}
            onChange={(e) =>
              setChecked((prev) =>
                e.target.checked
                  ? [...prev, city]
                  : prev.filter((c) => c !== city)
              )
            }
            className="mt-0.5 h-4 w-4 rounded border-stone-300 text-bark-600 focus:ring-bark-500 dark:border-white/20"
          />
          <span>{city}</span>
        </label>
      ))}
    </div>
  );
}
