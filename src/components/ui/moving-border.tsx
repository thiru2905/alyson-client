import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function MovingBorder({
  children,
  to = "/auth",
  className,
  containerClassName,
}: {
  children: ReactNode;
  to?: string;
  className?: string;
  containerClassName?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "relative inline-flex overflow-hidden rounded-lg p-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        containerClassName,
      )}
    >
      <span
        className="absolute inset-[-100%] landing-moving-border-spin opacity-80 bg-[conic-gradient(from_0deg,transparent_0_300deg,var(--primary)_360deg)]"
        aria-hidden
      />
      <span
        className={cn(
          "relative inline-flex h-11 items-center justify-center gap-2 rounded-[calc(0.5rem-1px)] bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90",
          className,
        )}
      >
        {children}
      </span>
    </Link>
  );
}
