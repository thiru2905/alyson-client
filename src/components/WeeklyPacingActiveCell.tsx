import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { ChevronDown, Pencil } from "lucide-react";
import { formatActiveLabel, type WeeklyPacingRow } from "@/lib/weekly-pacing";

type Props = {
  row: WeeklyPacingRow;
  disabled?: boolean;
  onConfirmChange: (next: boolean) => void;
};

export function WeeklyPacingActiveCell({ row, disabled, onConfirmChange }: Props) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pending, setPending] = useState<boolean | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 2, left: Math.max(8, rect.left - 4) });
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      if (!pinned) setOpen(false);
    }, 280);
  }, [clearCloseTimer, pinned]);

  const showMenu = useCallback(() => {
    if (disabled) return;
    updatePosition();
    setOpen(true);
  }, [disabled, updatePosition]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => updatePosition();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setPinned(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  function pick(next: boolean) {
    setOpen(false);
    setPinned(false);
    if (next === row.active) return;
    setPending(next);
  }

  const badgeClass = row.active
    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 hover:border-emerald-500"
    : "border-border bg-muted/50 text-muted-foreground hover:border-foreground/30";

  return (
    <>
      <div
        className="relative inline-flex flex-col items-start"
        onMouseEnter={() => {
          clearCloseTimer();
          showMenu();
        }}
        onMouseLeave={scheduleClose}
      >
        <button
          ref={anchorRef}
          type="button"
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (disabled) return;
            clearCloseTimer();
            setPinned(true);
            showMenu();
          }}
          title="Click or hover to change Active status"
          className={
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold cursor-pointer " +
            "transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed " +
            badgeClass
          }
        >
          <Pencil className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          {formatActiveLabel(row.active)}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
        </button>
        {row.activeOverridden ? (
          <span className="text-[10px] text-muted-foreground mt-0.5">Manual</span>
        ) : null}
      </div>

      {open && !disabled
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[200] rounded-lg border border-border bg-paper shadow-2xl p-2.5 w-[168px]"
              style={{ top: menuPos.top, left: menuPos.left }}
              onMouseEnter={clearCloseTimer}
              onMouseLeave={scheduleClose}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Invisible bridge so hover from badge → menu does not close */}
              <div className="absolute -top-3 left-0 right-0 h-3" aria-hidden />
              <div className="text-[11px] font-medium text-foreground">Change active status?</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 mb-2">
                {row.name} · now <span className="font-medium text-foreground">{formatActiveLabel(row.active)}</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => pick(true)}
                  className={
                    "flex-1 h-8 rounded-md text-[11px] font-semibold border transition-colors " +
                    (row.active
                      ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-800 dark:text-emerald-200"
                      : "border-border hover:bg-emerald-500/10 hover:border-emerald-500/40")
                  }
                >
                  Yes
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => pick(false)}
                  className={
                    "flex-1 h-8 rounded-md text-[11px] font-semibold border transition-colors " +
                    (!row.active
                      ? "border-foreground/30 bg-muted text-foreground"
                      : "border-border hover:bg-muted")
                  }
                >
                  No
                </button>
              </div>
              <div className="text-[10px] text-muted-foreground mt-2 leading-snug">Saved permanently in S3</div>
            </div>,
            document.body,
          )
        : null}

      <AlertDialog.Root open={pending != null} onOpenChange={(next) => !next && setPending(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/40 z-[210]" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-[92vw] max-w-md surface-card p-4">
            <AlertDialog.Title className="font-medium text-[14px]">Update Active status?</AlertDialog.Title>
            <AlertDialog.Description asChild>
              <div className="mt-2 space-y-2 text-[12px] text-muted-foreground leading-relaxed">
                <p>
                  Set <span className="font-semibold text-foreground">{row.name}</span> to{" "}
                  <span className="font-semibold text-foreground">
                    {pending != null ? formatActiveLabel(pending) : "—"}
                  </span>
                  ?
                </p>
                <p>This is saved permanently in S3 and applies to all future weekly pacing reports.</p>
              </div>
            </AlertDialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  className="h-8 px-3 rounded-md border border-border text-[12px] font-medium hover:bg-muted"
                >
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  onClick={() => {
                    if (pending == null) return;
                    onConfirmChange(pending);
                    setPending(null);
                  }}
                  className="h-8 px-3 rounded-md bg-foreground text-background text-[12px] font-medium"
                >
                  Yes, save to S3
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
