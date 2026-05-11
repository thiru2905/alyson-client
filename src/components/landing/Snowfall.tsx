import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type Flake = {
  left: number; // %
  size: number; // px
  delay: number; // s
  duration: number; // s
  drift: number; // px
  swirl: number; // px
  blur: number; // px
  top: number; // px
  opacity: number;
};

function makeFlakes(count: number): Flake[] {
  // deterministic-ish so SSR/client don't wildly diverge
  return Array.from({ length: count }).map((_, i) => {
    const t = (i * 9301 + 49297) % 233280;
    const r = t / 233280;
    const left = (i * 37) % 100;
    // smaller, more realistic flakes
    const size = 1 + ((i * 11) % 4); // 1..4px
    const duration = 3.2 + (r * 2.6); // 3.2..5.8s
    const delay = -((i * 0.45) % duration);
    const drift = ((i % 2 === 0 ? 1 : -1) * (6 + ((i * 7) % 16))); // slow drift
    const swirl = ((i % 3) - 1) * (4 + ((i * 5) % 10)); // small side-to-side
    const blur = size <= 2 ? 0 : 0.35;
    const top = -8 - ((i * 9) % 26); // start within header area
    const opacity = 0.18 + (r * 0.32);
    return { left, size, delay, duration, drift, swirl, blur, top, opacity };
  });
}

export function Snowfall({
  className,
  active = true,
  intensity = "normal",
}: {
  className?: string;
  active?: boolean;
  intensity?: "low" | "normal" | "high";
}) {
  const reduce = useReducedMotion();
  const flakes = useMemo(() => makeFlakes(intensity === "high" ? 52 : intensity === "low" ? 22 : 36), [intensity]);

  if (reduce) return null;

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {flakes.map((f, idx) => (
        <motion.span
          // eslint-disable-next-line react/no-array-index-key
          key={idx}
          className="absolute rounded-full"
          style={{
            left: `${f.left}%`,
            top: f.top,
            width: f.size,
            height: f.size,
            opacity: active ? f.opacity : 0,
            background: "color-mix(in oklab, var(--foreground) 18%, transparent)",
            filter: `blur(${f.blur}px)`,
          }}
          animate={
            active
              ? {
                  y: [0, 90, 190],
                  // Brownian-ish drift (small random walk feel via keyframes)
                  x: [0, f.swirl, f.drift, f.drift + f.swirl * 0.6, f.drift],
                  rotate: [0, 8, -6, 10, 0],
                }
              : { opacity: 0 }
          }
          transition={
            active
              ? { duration: f.duration, repeat: Infinity, ease: "linear", delay: f.delay }
              : { duration: 0.8, ease: "easeOut" }
          }
        />
      ))}
    </div>
  );
}

