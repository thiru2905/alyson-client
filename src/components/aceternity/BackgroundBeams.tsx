import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function BackgroundBeams({ className }: Props) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {/* soft base grid */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, var(--ink) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* animated beams */}
      <div className="absolute -inset-x-24 -top-24 h-[520px] [mask-image:radial-gradient(60%_60%_at_50%_40%,black,transparent)]">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className="absolute top-0 h-full w-[140px] -translate-x-1/2 alyson-beam"
            style={{
              left: `${8 + i * 9.4}%`,
              animationDelay: `${i * -0.65}s`,
              opacity: 0.35,
              background:
                "linear-gradient(180deg, transparent, color-mix(in oklab, var(--primary) 40%, transparent), transparent)",
              filter: "blur(0.5px)",
            }}
          />
        ))}
      </div>

      {/* glow */}
      <div
        className="absolute -top-24 left-1/2 -translate-x-1/2 h-[420px] w-[760px] rounded-full blur-3xl opacity-25"
        style={{ background: "linear-gradient(90deg, var(--chart-1), var(--chart-2), var(--chart-3))" }}
      />
    </div>
  );
}

