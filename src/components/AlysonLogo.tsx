import { cn } from "@/lib/utils";

const LOGO_SRC = "/images/alyson-mini.svg";

export function AlysonLogo({
  size = 32,
  showWordmark = true,
  wordmarkClassName,
  className,
}: {
  size?: number;
  showWordmark?: boolean;
  wordmarkClassName?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 min-w-0", className)}>
      <img
        src={LOGO_SRC}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full"
        draggable={false}
      />
      {showWordmark ? (
        <span className={cn("font-display font-semibold tracking-tight leading-tight truncate", wordmarkClassName)}>
          Alyson HR
        </span>
      ) : null}
    </span>
  );
}
