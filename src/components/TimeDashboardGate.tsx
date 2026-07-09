import { Clock } from "lucide-react";
import { SensitiveModuleLock } from "@/components/SensitiveModuleLock";
import { useAuth } from "@/lib/auth";

/** Shown until the user enters the Time Dashboard access code (all roles, including super admin). */
export function TimeDashboardGate() {
  const { tryUnlockTimeDashboard } = useAuth();

  return (
    <SensitiveModuleLock
      eyebrow="People"
      title="Time Dashboard"
      description="This area contains sensitive hours and productivity data. Enter the team access code to continue."
      hint="Required for every role, including Super Admin. The code is shared with authorized leads only."
      icon={Clock}
      codeLength={6}
      placeholder="6-digit code"
      unlockButtonLabel="Unlock Time Dashboard"
      successToast="Time Dashboard unlocked"
      onTryUnlock={tryUnlockTimeDashboard}
    />
  );
}
