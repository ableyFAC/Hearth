import type { Metadata } from "next";

// Index for the public guide pages. Kept as a plain list: this section is
// meant to stay small and good rather than grow into thin programmatic pages.
const GUIDES = [
  {
    href: "/guides/water-heater-replacement-cost",
    icon: "💧",
    title: "Water heater replacement cost",
    blurb:
      "Typical national price range, what drives it up or down, and when a repair is the smarter call.",
  },
  {
    href: "/guides/hvac-replacement-cost",
    icon: "🌡️",
    title: "HVAC replacement cost",
    blurb:
      "Typical national price range for a new heating and cooling system, and how to tell if yours can be repaired instead.",
  },
  {
    href: "/guides/slab-leak-signs",
    icon: "🚰",
    title: "Slab leak signs",
    blurb:
      "How to spot a slab leak early, why older Orange County homes are prone to them, and what the repair options look like.",
  },
  {
    href: "/guides/home-maintenance-schedule",
    icon: "🗓️",
    title: "Home maintenance schedule",
    blurb:
      "How often to actually change filters, flush the water heater, service the AC, and clean the gutters.",
  },
  {
    href: "/guides/is-my-contractor-quote-fair",
    icon: "📋",
    title: "Is my contractor's quote fair?",
    blurb:
      "How to read a quote line by line, red flags to watch for, and what a fair bidding process looks like.",
  },
  {
    href: "/guides/socal-home-maintenance-calendar",
    icon: "📅",
    title: "SoCal home maintenance calendar",
    blurb:
      "A month-by-month calendar for coastal Southern California: AC strain, termite swarm season, Santa Ana wind prep, and first-rain checks.",
  },
];

export const metadata: Metadata = {
  title: "Home maintenance guides | Hearth",
  description:
    "Plain-English guides to common home maintenance questions: replacement costs, slab leak warning signs, maintenance schedules, and how to read a contractor's quote.",
};

export default function GuidesIndex() {
  return (
    <main className="mx-auto max-w-2xl px-6 pb-16 pt-10">
      <h1 className="text-2xl font-bold text-stone-900">
        Home maintenance guides
      </h1>
      <p className="mt-2 text-sm text-stone-600">
        Plain-English answers to the questions homeowners search for most,
        with no login required.
      </p>

      <ul className="mt-8 space-y-4">
        {GUIDES.map((g) => (
          <li key={g.href}>
            <a
              href={g.href}
              className="card block transition hover:border-hearth-400 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className="icon-chip" aria-hidden>
                  {g.icon}
                </span>
                <div>
                  <h2 className="font-semibold text-stone-900">{g.title}</h2>
                  <p className="mt-1 text-sm text-stone-600">{g.blurb}</p>
                </div>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
