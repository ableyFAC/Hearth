import { cookies } from "next/headers";

// Lightweight "flash" toast that survives a server action + revalidate/redirect.
// setFlash() drops a short-lived, non-httpOnly cookie (so the client FlashBridge
// can clear it); readFlash() is called once in the root layout each render.
export const FLASH_COOKIE = "hearth_flash";

export type FlashType = "success" | "error" | "info" | "warning";
export interface Flash {
  message: string;
  type: FlashType;
  id: string;
}

// Call from inside a Server Action, before redirect()/revalidatePath().
// Both helpers are async since Next 15, where cookies() returns a Promise.
export async function setFlash(message: string, type: FlashType = "success") {
  const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  (await cookies()).set(FLASH_COOKIE, JSON.stringify({ message, type, id }), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 30,
  });
}

export async function readFlash(): Promise<Flash | null> {
  const raw = (await cookies()).get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Flash;
  } catch {
    return null;
  }
}
