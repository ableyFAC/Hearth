// Typed result for server actions that client components invoke
// programmatically (const res = await someAction(...)) rather than via a
// plain <form action>. Returning this lets the caller keep its panel open on
// failure and show the error inline, instead of closing optimistically and
// losing the user's input. Form-posted actions that end in redirect() should
// keep using await setFlash() and are not expected to return this.
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export function ok<T = undefined>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

export function err(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
