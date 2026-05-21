import { useState } from "react";
import { Clock } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

/** Shown until the user enters the Time Dashboard access code (all roles, including super admin). */
export function TimeDashboardGate() {
  const { tryUnlockTimeDashboard } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="ops-dense">
      <PageHeader
        eyebrow="People"
        title="Time Dashboard"
        description="Enter the Time Dashboard access code to continue (required for every role)."
        dense
      />
      <div className="px-5 md:px-8 py-6 max-w-md">
        <div className="surface-card p-6">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div className="font-medium text-[14px]">Time Dashboard code</div>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed mb-4">
            Super Admin and all other roles use the same code here. Access lasts for this browser session until you sign
            out.
          </p>
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const ok = tryUnlockTimeDashboard(code);
                if (!ok) setError("Invalid code");
                else toast.success("Time Dashboard unlocked");
              }
            }}
            inputMode="numeric"
            autoFocus
            placeholder="6-digit code"
            className="w-full h-10 rounded-md border border-border bg-background px-3 font-mono text-[16px] tracking-[0.25em]"
          />
          {error && <div className="mt-2 text-[12px] text-destructive">{error}</div>}
          <button
            type="button"
            onClick={() => {
              const ok = tryUnlockTimeDashboard(code);
              if (!ok) {
                setError("Invalid code");
                return;
              }
              toast.success("Time Dashboard unlocked");
            }}
            className="mt-4 h-9 w-full rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90"
          >
            Unlock Time Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
