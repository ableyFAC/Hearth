"use client";

import { useState } from "react";

// A locked MM/YYYY date field: accepts digits only (no letters or symbols) and
// auto-inserts the slash, so the format is always MM/YYYY. Caps at month + a
// 4-digit year. Submits the formatted value under `name`.
function format(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 6); // MM + YYYY
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

export default function MonthYearInput({
  name,
  defaultValue = "",
  placeholder = "MM/YYYY",
  className = "input",
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState(() => format(defaultValue));
  return (
    <input
      name={name}
      type="text"
      inputMode="numeric"
      maxLength={7}
      className={className}
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(format(e.target.value))}
    />
  );
}
