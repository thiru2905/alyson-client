import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Lightweight side drawer. Use for drill-downs, row details, KPI explainers.
 * Right-anchored on desktop, bottom sheet on mobile would also work but we
 * keep it simple and right-anchored everywhere for consistency.
 */
export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  width = "lg",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  width?: "md" | "lg" | "xl";
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const w =
    width === "xl"
      ? "sm:w-[640px]"
      : width === "md"
        ? "sm:w-[420px]"
        : "sm:w-[520px]";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 animate-in fade-in"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full ${w} bg-paper border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200`}
        role="dialog"
        aria-modal="true"
      >
        <div className="h-14 px-5 flex items-center gap-3 border-b border-border shrink-0">
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
                {eyebrow}
              </div>
            )}
            <div className="font-display text-[17px] font-semibold tracking-tight truncate">
              {title}
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}
