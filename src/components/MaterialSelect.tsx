"use client";

import { useState } from "react";
import { materialsForSystem } from "@/lib/constants";

const OTHER = "__other";

// Styled material / model picker: a normal app <select> of the common options
// for this system type, plus an "Other" choice that reveals a text box for a
// custom entry. Submits the chosen (or typed) value as `material_or_model`.
export default function MaterialSelect({
  systemType,
  defaultValue = "",
}: {
  systemType: string;
  defaultValue?: string;
}) {
  const options = materialsForSystem(systemType);
  const known = defaultValue !== "" && options.includes(defaultValue);

  const [choice, setChoice] = useState(
    known ? defaultValue : defaultValue ? OTHER : ""
  );
  const [other, setOther] = useState(known ? "" : defaultValue);

  return (
    <>
      <select
        className="select"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="">Select (optional)</option>
        {options.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
        <option value={OTHER}>Other</option>
      </select>
      {choice === OTHER ? (
        <input
          name="material_or_model"
          className="input mt-2"
          placeholder="Type the material or model"
          value={other}
          onChange={(e) => setOther(e.target.value)}
        />
      ) : (
        <input type="hidden" name="material_or_model" value={choice} />
      )}
    </>
  );
}
