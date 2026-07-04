// Maintenance plan schedule content, shared between the dashboard page (to
// tell plan-generated tasks apart from manual reminders) and the server action
// that builds the plan. Lives here because "use server" files may only export
// async functions.

// Always scheduled, regardless of the home's systems. dueInDays = when the next
// occurrence lands (small/quick tasks sooner, bigger ones later).
export const ALWAYS_SCHEDULE: Array<{ title: string; dueInDays: number }> = [
  { title: "Test smoke and CO detectors", dueInDays: 10 },
  { title: "Clean gutters and downspouts", dueInDays: 45 },
];

// Extra tasks added only when that system is on the property's inventory.
export const SYSTEM_SCHEDULE: Record<
  string,
  Array<{ title: string; dueInDays: number }>
> = {
  hvac: [
    { title: "Replace HVAC air filter", dueInDays: 14 },
    { title: "Schedule an HVAC tune-up", dueInDays: 60 },
  ],
  water_heater: [{ title: "Flush the water heater", dueInDays: 75 }],
  roof: [{ title: "Inspect roof and flashing", dueInDays: 50 }],
  plumbing: [
    { title: "Check under sinks and around toilets for leaks", dueInDays: 20 },
  ],
  electrical_panel: [
    { title: "Test GFCI outlets and breakers", dueInDays: 30 },
  ],
  appliance: [
    { title: "Clean the dryer vent and refrigerator coils", dueInDays: 40 },
  ],
  windows: [{ title: "Check window caulk and weatherstripping", dueInDays: 55 }],
  foundation: [
    {
      title: "Walk the foundation and grading for cracks or pooling",
      dueInDays: 65,
    },
  ],
  sewer_line: [
    { title: "Watch for slow drains, consider a sewer scope", dueInDays: 70 },
  ],
};

// Every title the plan generator can produce, so callers can tell a
// plan-generated task apart from a manual reminder.
export function planTitles(): Set<string> {
  const titles = new Set<string>();
  for (const t of ALWAYS_SCHEDULE) titles.add(t.title);
  for (const list of Object.values(SYSTEM_SCHEDULE)) {
    for (const t of list) titles.add(t.title);
  }
  return titles;
}
