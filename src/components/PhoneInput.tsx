"use client";

import { useState } from "react";

// Formats a US phone number as the user types into (000) 000-0000 and caps it
// at 10 digits, so extra numbers past a full phone number are ignored. Submits
// the formatted value under `name`.
function format(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export default function PhoneInput({
  name,
  defaultValue = "",
  placeholder = "(555) 123-4567",
  className = "input",
  required = false,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(() => format(defaultValue));
  return (
    <input
      name={name}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      maxLength={14}
      className={className}
      placeholder={placeholder}
      required={required}
      value={value}
      onChange={(e) => setValue(format(e.target.value))}
    />
  );
}
