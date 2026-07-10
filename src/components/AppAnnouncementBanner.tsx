import { useState } from "react";
import { X } from "lucide-react";

/** Bump id when copy changes so users see the new announcement once. */
const ANNOUNCEMENT_ID = "meeting-hours-super-admin-rbac-2026-07";
const STORAGE_KEY = `alyson-announcement-dismissed:${ANNOUNCEMENT_ID}`;

function readDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

export function AppAnnouncementBanner({ visible }: { visible: boolean }) {
  const [dismissed, setDismissed] = useState(readDismissed);

  if (!visible || dismissed) return null;

  return (
    <div
      role="status"
      className="relative z-30 shrink-0 border-b border-violet-500/30 bg-violet-500/10 px-11 py-2.5 text-center text-[12px] leading-snug text-violet-950 dark:text-violet-100"
    >
      <span className="font-semibold">Update —</span> Meeting Hours is now integrated for super admins with RBAC:
      calendar-based reports, email delivery, and access under{" "}
      <span className="font-medium">Ops → Meeting Hours</span>.
      <button
        type="button"
        onClick={() => {
          persistDismissed();
          setDismissed(true);
        }}
        className="absolute right-2 top-2 h-7 w-7 grid place-items-center rounded-md text-violet-800/70 hover:text-violet-950 hover:bg-violet-500/15 dark:text-violet-200/80 dark:hover:text-violet-50 dark:hover:bg-violet-500/20 transition-colors"
        aria-label="Dismiss announcement"
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
