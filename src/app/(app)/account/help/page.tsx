import { getUserProfile } from "@/lib/user";
import { getUser } from "@/lib/auth";
import SupportForm from "./SupportForm";

const FAQ = [
  {
    q: "How does Hearth know about my home?",
    a: "When you claim your address, Hearth looks up public property records and builds a starter profile. You can add or edit your systems, their ages, and their condition at any time from the Home page.",
  },
  {
    q: "How do I get quotes from contractors?",
    a: "Post a job from the Post a Job page or ask Hearth to help. Vetted local pros can then message you, and any price they send in chat is captured so you can compare them side by side.",
  },
  {
    q: "What is Ask Hearth?",
    a: "Ask Hearth is your home assistant. It answers questions using your own systems and their ages, reads photos of labels or documents, and can log issues, set reminders, and post jobs for you.",
  },
  {
    q: "Is my data private?",
    a: "Your home data is yours. Every record is protected so that only you can see your home, and you can delete your account and all associated data at any time from Account security.",
  },
];

export default async function HelpPage() {
  const [profile, user] = await Promise.all([getUserProfile(), getUser()]);
  const metaName = (
    user?.user_metadata?.full_name as string | undefined
  )?.trim();
  const name = profile?.full_name || metaName || "";
  const email = profile?.email || user?.email || "";
  const phone = profile?.phone || "";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Help</h1>
        <p className="mt-1 text-sm text-stone-500">
          Answers to common questions, and how to reach us.
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">
          Frequently asked questions
        </h2>
        <div className="mt-3 divide-y divide-stone-100">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-3">
              <summary className="cursor-pointer text-sm font-medium text-stone-900 marker:text-stone-400">
                {f.q}
              </summary>
              <p className="mt-2 text-sm text-stone-600">{f.a}</p>
            </details>
          ))}
        </div>
      </div>

      <SupportForm name={name} email={email} phone={phone} />

      <p className="text-sm text-stone-500">
        You can also ask Hearth directly from the assistant on any page.
      </p>
    </div>
  );
}
