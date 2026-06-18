"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Highlights whichever link matches the current route.
export default function NavLinks({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  const pathname = usePathname();

  return (
    <>
      {links.map((l) => {
        // Exact match, or a nested route under it (but never let an "index"
        // link like /pro swallow its own sub-pages).
        const active =
          pathname === l.href ||
          (l.href !== "/pro" && pathname.startsWith(l.href + "/"));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              active
                ? "bg-hearth-100 text-hearth-800"
                : "text-stone-600 hover:bg-hearth-50 hover:text-hearth-700"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
