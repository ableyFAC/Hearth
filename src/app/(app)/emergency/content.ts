import type { PanicFlow, PrepKey } from "./PanicCard";

// Five panic flows for the /emergency page. Short sentences, imperative, most
// important action first. Each maps to an existing SERVICE_CATEGORIES value so
// the "Get a pro on it" button lands in the normal post-a-job flow
// (/contractors?category=...) with the category already picked.
export const FLOWS: PanicFlow[] = [
  {
    key: "burst_pipe",
    emoji: "\u{1F4A7}",
    title: "Burst pipe or water everywhere",
    subtitle: "Stop the water first, then deal with the mess.",
    category: "plumbing",
    desc: "Emergency: burst pipe, water everywhere. Need someone today.",
    prepKey: "water_shutoff",
    steps: [
      "Turn off your water main right now. That stops the flooding.",
      "If water is near outlets or your breaker panel, turn off power to that area, but only if you can reach the panel without stepping in water. If you'd have to stand in water, don't, leave it for an electrician.",
      "Move anything valuable or electrical away from the water.",
      "Soak up standing water with towels, a mop, or a wet vac if you have one.",
      "Once the water's off, call a plumber. This isn't a 911 situation unless someone is hurt or trapped.",
    ],
  },
  {
    key: "gas_smell",
    emoji: "\u{1F32C}️",
    title: "You smell gas",
    subtitle: "Leave first. Everything else can wait.",
    category: "plumbing",
    desc: "Emergency: gas smell in the home. Needs inspection and repair after the utility company clears it.",
    prepKey: "gas_shutoff",
    steps: [
      "Leave the house right now. Don't stop to pack anything.",
      "Don't flip any light switches, don't unplug anything, don't light a match, and don't use your phone until you're outside and away from the building.",
      "Once you're outside and at a safe distance, call your gas company's emergency line. If the smell is strong or you hear hissing, call 911 instead.",
      "Only touch your gas shutoff yourself if you already know how and can do it in a few seconds on your way out. If you're not sure, skip it and just leave.",
      "Don't go back inside until the gas company or fire department says it's safe.",
    ],
  },
  {
    key: "no_heat",
    emoji: "\u{1F976}",
    title: "No heat in winter",
    subtitle: "Check the easy stuff first.",
    category: "hvac",
    desc: "Emergency: no heat in winter. Need a pro today.",
    prepKey: "breaker_panel",
    steps: [
      "Check the breaker for your furnace or heat pump at your panel. If it's tripped, switch it fully off, then back on.",
      "Check your furnace filter. A clogged filter can shut the whole system down. Swap it if it looks dirty.",
      "Check your thermostat: batteries, and that it's set to heat, above room temperature.",
      "If it's below freezing outside and heat won't come back within a couple hours, protect your pipes: open cabinet doors under sinks and let faucets drip slightly.",
      "If anyone in the home is very young, elderly, or has a medical condition, or the indoor temperature is dropping toward 50F, treat this as urgent: get a pro today, or call 911 if someone is in danger from the cold.",
    ],
  },
  {
    key: "power_out",
    emoji: "⚡",
    title: "Power out or breaker keeps tripping",
    subtitle: "Check the panel before you assume the worst.",
    category: "electrical",
    desc: "Emergency: power out or breaker tripping repeatedly. Need an electrician.",
    prepKey: "breaker_panel",
    steps: [
      "Check your main panel. If a breaker is tripped, switch it fully off, then back on.",
      "Press reset on any GFCI outlets. They're often in kitchens, bathrooms, garages, and outdoors.",
      "Check if your neighbors also lost power. If so, it's a utility outage: call your power company to report it, not a pro.",
      "If you see a downed power line, stay far away, don't touch it or anything it's touching, and call 911 and your power company right away.",
      "If the breaker won't stay reset, or you smell burning, or an outlet is warm or scorched, stop resetting it and get an electrician.",
    ],
  },
  {
    key: "sewage_backup",
    emoji: "\u{1F6BD}",
    title: "Sewage backup or overflowing toilet",
    subtitle: "Stop using water, then protect yourself.",
    category: "plumbing",
    desc: "Emergency: sewage backup or toilet overflow. Need a plumber urgently.",
    steps: [
      "Stop using every drain and toilet in the house right now. Adding more water makes it worse.",
      "If you know where your main sewer shutoff or cleanout valve is, close it.",
      "Keep kids and pets away from the area. Sewage is a health hazard: don't touch it with bare hands, and wash up if you do.",
      "Open a window or run a fan for ventilation if you can do it without walking through the mess.",
      "Call a plumber. If it's backing up from more than one drain or spreading fast, treat it as urgent, call now rather than waiting.",
    ],
  },
];

// Metadata for the three "be ready before it happens" prep slots.
export const PREP_ITEMS: Array<{ key: PrepKey; label: string }> = [
  { key: "water_shutoff", label: "Water main shutoff" },
  { key: "gas_shutoff", label: "Gas shutoff" },
  { key: "breaker_panel", label: "Breaker panel" },
];
