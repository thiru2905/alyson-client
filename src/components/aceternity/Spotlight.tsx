import { useEffect, useRef, type RefObject } from "react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Attach pointer tracking to this container (the hero/CTA section). */
  containerRef: RefObject<HTMLElement | null>;
};

export function Spotlight({ className, containerRef }: Props) {
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const layer = layerRef.current;
    if (!container || !layer) return;

    const move = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      layer.style.setProperty("--spot-x", `${x}px`);
      layer.style.setProperty("--spot-y", `${y}px`);
    };

    const leave = () => {
      layer.style.setProperty("--spot-x", "50%");
      layer.style.setProperty("--spot-y", "22%");
    };

    container.addEventListener("pointermove", move);
    container.addEventListener("pointerleave", leave);
    return () => {
      container.removeEventListener("pointermove", move);
      container.removeEventListener("pointerleave", leave);
    };
  }, [containerRef]);

  return (
    <div
      ref={layerRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 transition-opacity duration-300", className)}
      style={{
        background:
          "radial-gradient(680px circle at var(--spot-x, 50%) var(--spot-y, 22%), var(--landing-spotlight), transparent 62%)",
      }}
    />
  );
}
