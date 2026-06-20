"use client";

import { useEffect, useState } from "react";

// Shows its children, then fades out and removes itself after `delay` ms.
export default function FadingBanner({
  children,
  className,
  delay = 5000,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const [show, setShow] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Visible for `delay`, then a long, slow fade.
    const t1 = setTimeout(() => setFading(true), delay);
    const t2 = setTimeout(() => setShow(false), delay + 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [delay]);

  if (!show) return null;

  return (
    <div
      className={`transition-opacity duration-[3000ms] ease-out ${
        fading ? "opacity-0" : "opacity-100"
      } ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
