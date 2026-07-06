/** Prefix for server errors the UI can detect without exposing token details. */
export const TIME_DOCTOR_AUTH_ERROR_PREFIX = "TIME_DOCTOR_AUTH_EXPIRED:";

export const TIME_DOCTOR_REAUTH_MESSAGE =
  "Session expired – please update API_ACCESS_TOKEN in environment settings (Time Doctor access token, ~5 day lifetime).";

export function formatTimeDoctorAuthError(cause?: unknown): string {
  const detail =
    cause instanceof Error
      ? cause.message.replace(/^OAuth refresh failed \d+[^:]*:\s*/i, "").slice(0, 240)
      : cause != null
        ? String(cause).slice(0, 240)
        : "";
  return detail
    ? `${TIME_DOCTOR_AUTH_ERROR_PREFIX} ${TIME_DOCTOR_REAUTH_MESSAGE} (${detail})`
    : `${TIME_DOCTOR_AUTH_ERROR_PREFIX} ${TIME_DOCTOR_REAUTH_MESSAGE}`;
}

export function isTimeDoctorReauthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes(TIME_DOCTOR_AUTH_ERROR_PREFIX) ||
    err.message.includes(TIME_DOCTOR_REAUTH_MESSAGE) ||
    err.name === "TimeDoctorAuthError"
  );
}

export function timeDoctorErrorBannerText(err: unknown, fallback: string): string {
  if (isTimeDoctorReauthError(err)) return TIME_DOCTOR_REAUTH_MESSAGE;
  return err instanceof Error ? err.message : fallback;
}
