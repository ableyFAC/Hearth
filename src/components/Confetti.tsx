"use client";

import { useEffect, useRef } from "react";

// Lightweight one-shot confetti burst (no dependencies). Renders a full-screen,
// click-through canvas, animates ~3s, then stops. Mount it when you want it.
export default function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = [
      "#f59e0b",
      "#10b981",
      "#3b82f6",
      "#ef4444",
      "#a855f7",
      "#ec4899",
    ];

    const parts = Array.from({ length: 160 }, () => ({
      x: canvas.width / 2,
      y: canvas.height / 3,
      vx: (Math.random() - 0.5) * 14,
      vy: Math.random() * -14 - 4,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.25,
    }));

    let frame = 0;
    let raf = 0;

    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.vy += 0.3; // gravity
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - frame / 190);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (frame < 190) raf = requestAnimationFrame(tick);
    };
    tick();

    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none fixed inset-0 z-50"
      aria-hidden
    />
  );
}
