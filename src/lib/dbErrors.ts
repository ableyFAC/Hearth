// One shared answer to "did this write fail because the live DB is missing a
// column/table from a not-yet-run migration?", so every graceful-degradation
// retry site matches the SAME shapes. Postgres itself reports a missing
// column in a SELECT as code 42703 ("column X does not exist"), but PostgREST
// reports a missing column in an INSERT/UPDATE payload as code PGRST204 with
// the message "Could not find the 'X' column of 'Y' in the schema cache",
// and a missing table as PGRST205. Matching only 42703 (as several sites
// once did) turns a should-be-graceful fallback into a hard 500: that is
// exactly how new-contractor onboarding broke on a live DB missing 0046.
// A missing UNIQUE constraint shows up differently again: an upsert whose
// onConflict target has no matching constraint fails with 42P10 ("there is
// no unique or exclusion constraint matching the ON CONFLICT specification"),
// so that shape counts as missing-schema too.
export function isMissingSchemaError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  if (
    error.code === "42703" ||
    error.code === "42P01" ||
    error.code === "42P10" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205"
  ) {
    return true;
  }
  return /(does not exist|schema cache|could not find|matching the ON CONFLICT)/i.test(
    error.message ?? ""
  );
}
