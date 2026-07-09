export const TIME_DASHBOARD_UNLOCK_KEY = "alyson-time-dashboard-unlocked";
export const TIME_DASHBOARD_CODE = "111111";

export const PAYROLL_UNLOCK_KEY = "alyson-payroll-unlocked";
export const PAYROLL_CODE = "24680";

export function readModuleUnlocked(storageKey: string): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(storageKey) === "1";
}

export function writeModuleUnlocked(storageKey: string, unlocked: boolean) {
  if (typeof window === "undefined") return;
  if (unlocked) sessionStorage.setItem(storageKey, "1");
  else sessionStorage.removeItem(storageKey);
}

export function tryUnlockModuleCode(code: string, expected: string): boolean {
  return code.trim() === expected;
}
