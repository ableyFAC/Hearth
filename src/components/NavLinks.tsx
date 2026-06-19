"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Highlights whichever link matches the current route.
export default function NavLinks({
  links,
}: {
  links: { href: string; label: string; badge?: number }[];
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
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
              active
                ? "bg-hearth-100 text-hearth-800"
                : "text-stone-600 hover:bg-hearth-50 hover:text-hearth-700"
            }`}
          >
            {l.label}
            {l.badge ? (
              <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-hearth-600 px-1.5 text-xs font-semibold text-white">
                {l.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}
