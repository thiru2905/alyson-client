import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type SensitiveModuleLockProps = {
  eyebrow: string;
  title: string;
  description: string;
  hint?: string;
  icon: LucideIcon;
  codeLength: number;
  numericOnly?: boolean;
  placeholder?: string;
  unlockButtonLabel: string;
  successToast: string;
  onTryUnlock: (code: string) => boolean;
};

export function SensitiveModuleLock({
  eyebrow,
  title,
  description,
  hint,
  icon: Icon,
  codeLength,
  numericOnly = true,
  placeholder,
  unlockButtonLabel,
  successToast,
  onTryUnlock,
}: SensitiveModuleLockProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const slots = useMemo(() => Array.from({ length: codeLength }, (_, i) => code[i] ?? ""), [code, codeLength]);

  const submit = () => {
    if (submitting) return;
    if (code.length < codeLength) {
      setError(`Enter all ${codeLength} digits`);
      setShake(true);
      return;
    }
    setSubmitting(true);
    const ok = onTryUnlock(code);
    if (!ok) {
      setError("Incorrect access code");
      setShake(true);
      setSubmitting(false);
      return;
    }
    toast.success(successToast);
    setError(null);
    setSubmitting(false);
  };

  const onChange = (raw: string) => {
    const next = numericOnly ? raw.replace(/\D/g, "").slice(0, codeLength) : raw.slice(0, codeLength);
    setCode(next);
    setError(null);
    setShake(false);
  };

  return (
    <div className="ops-dense min-h-[calc(100vh-4rem)] flex items-center justify-center px-5 py-10">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.08),transparent_55%)]" />

      <div
        className={
          "w-full max-w-md surface-card border border-border/80 shadow-xl overflow-hidden " +
          (shake ? "animate-[shake_0.45s_ease-in-out]" : "")
        }
        onAnimationEnd={() => setShake(false)}
      >
        <div className="h-1 bg-gradient-to-r from-emerald-500/80 via-emerald-400/40 to-transparent" />

        <div className="p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0 pt-0.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-medium">{eyebrow}</div>
              <h1 className="font-display text-xl font-semibold tracking-tight mt-1">{title}</h1>
            </div>
          </div>

          <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">{description}</p>

          {hint ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5 text-[12px] text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600/80 dark:text-emerald-400/80" />
              <span>{hint}</span>
            </div>
          ) : null}

          <div className="mt-6">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Access code</label>

            <div className="mt-3 flex justify-center gap-2">
              {slots.map((digit, i) => (
                <div
                  key={i}
                  className={
                    "h-11 w-10 rounded-lg border text-center font-mono text-lg leading-[2.65rem] transition-colors " +
                    (digit
                      ? "border-emerald-500/40 bg-emerald-500/5 text-foreground"
                      : "border-border bg-background text-muted-foreground/40")
                  }
                >
                  {digit ? "•" : ""}
                </div>
              ))}
            </div>

            <div className="relative mt-4">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={code}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                inputMode={numericOnly ? "numeric" : "text"}
                autoComplete="off"
                autoFocus
                placeholder={placeholder ?? `${codeLength}-digit code`}
                className="w-full h-11 rounded-lg border border-border bg-background pl-10 pr-3 font-mono text-[15px] tracking-[0.2em] outline-none ring-ring/30 focus:ring-2"
              />
            </div>

            {error ? <p className="mt-2 text-[12px] text-destructive">{error}</p> : null}

            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="mt-5 h-10 w-full rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <Lock className="h-3.5 w-3.5" />
              {unlockButtonLabel}
            </button>

            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              Unlocks for this browser session until you sign out.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}
