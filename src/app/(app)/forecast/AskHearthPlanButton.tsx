"use client";

// Fires a prefilled question into the app-wide Ask Hearth dock, same pattern
// the Learn tab uses (see LearnGuide.tsx). Lets the forecast page hand off
// straight into a conversation about the owner's actual upcoming costs,
// which is the thing a generic Google search can never do.
export default function AskHearthPlanButton({ question }: { question: string }) {
  function ask() {
    window.dispatchEvent(new CustomEvent("hearth:ask-question", { detail: question }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <button type="button" onClick={ask} className="btn-secondary text-sm">
      Ask Hearth to help me plan
    </button>
  );
}
