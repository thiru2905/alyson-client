/** Minimal labeled form primitives — match existing surface-card / pill aesthetic. */
import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">
        {label}
      </div>
      {children}
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full h-9 px-3 rounded-md border border-border bg-background text-[13px] focus:outline-none focus:ring-2 focus:ring-ring/30 " +
        (props.className ?? "")
      }
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={
        "w-full h-9 px-2 rounded-md border border-border bg-background text-[13px] focus:outline-none focus:ring-2 focus:ring-ring/30 " +
        (props.className ?? "")
      }
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={
        "w-full px-3 py-2 rounded-md border border-border bg-background text-[13px] focus:outline-none focus:ring-2 focus:ring-ring/30 " +
        (props.className ?? "")
      }
    />
  );
}

export function PrimaryBtn({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        "h-9 px-3.5 rounded-md bg-foreground text-background text-[13px] font-medium flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed " +
        (props.className ?? "")
      }
    >
      {children}
    </button>
  );
}

export function GhostBtn({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        "h-9 px-3.5 rounded-md border border-border bg-background text-[13px] font-medium flex items-center justify-center gap-1.5 hover:bg-muted disabled:opacity-50 " +
        (props.className ?? "")
      }
    >
      {children}
    </button>
  );
}

export function DangerBtn({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        "h-9 px-3.5 rounded-md border border-destructive/40 bg-background text-destructive text-[13px] font-medium flex items-center justify-center gap-1.5 hover:bg-destructive/10 disabled:opacity-50 " +
        (props.className ?? "")
      }
    >
      {children}
    </button>
  );
}

export function FormFooter({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-border p-4 flex items-center justify-end gap-2 bg-muted/20">
      {children}
    </div>
  );
}
