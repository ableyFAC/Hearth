"use client";

// Triggers the browser print dialog, which also covers "save as PDF" on every
// major browser. Hidden in the printed output itself via print:hidden.
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-primary print:hidden"
    >
      Print or save as PDF
    </button>
  );
}
