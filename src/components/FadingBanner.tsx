"use client";

import { useEffect, useState } from "react";

// Shows its children solid for `delay` ms, then fades out over `fadeMs` and
// removes itself.
export default function FadingBanner({
  children,
  className,
  delay = 5000,
  fadeMs = 3000,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  fadeMs?: number;
}) {
  const [show, setShow] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), delay);
    const t2 = setTimeout(() => setShow(false), delay + fadeMs);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [delay, fadeMs]);

  if (!show) return null;

  return (
    <div
      style={{ transitionDuration: `${fadeMs}ms` }}
      className={`transition-opacity ease-out ${
        fading ? "opacity-0" : "opacity-100"
      } ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
