import { DollarSign } from "lucide-react";
import { SensitiveModuleLock } from "@/components/SensitiveModuleLock";
import { useAuth } from "@/lib/auth";

/** Second layer after S3 payroll RBAC — password required for Mohita, Thiru, and any future allowlisted users. */
export function PayrollGate() {
  const { tryUnlockPayroll } = useAuth();

  return (
    <SensitiveModuleLock
      eyebrow="Money"
      title="Payroll"
      description="Compensation, salary deductions, and payment logs are highly sensitive. Enter the payroll access code to continue."
      hint="Even approved payroll users must enter this code. Access lasts for this browser session only."
      icon={DollarSign}
      codeLength={5}
      placeholder="5-digit code"
      unlockButtonLabel="Unlock Payroll"
      successToast="Payroll unlocked"
      onTryUnlock={tryUnlockPayroll}
    />
  );
}
