import { cn } from "@/lib/utils";
import { useId, useState } from "react";

export function LandingAccordion({
  items,
}: {
  items: Array<{ q: string; a: string }>;
}) {
  const baseId = useId();
  const [open, setOpen] = useState(0);

  return (
    <div className="surface-card divide-y divide-border overflow-hidden rounded-2xl">
      {items.map((item, i) => {
        const isOpen = open === i;
        const panelId = `${baseId}-panel-${i}`;
        const buttonId = `${baseId}-btn-${i}`;
        return (
          <div key={item.q}>
            <button
              id={buttonId}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpen(isOpen ? -1 : i)}
              className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className="text-[14px] font-medium">{item.q}</span>
              <span
                className={cn(
                  "shrink-0 text-muted-foreground transition-transform duration-200",
                  isOpen && "rotate-45",
                )}
                aria-hidden
              >
                +
              </span>
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-[13px] leading-relaxed text-muted-foreground">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
