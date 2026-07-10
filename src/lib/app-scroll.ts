import { useEffect } from "react";

export const APP_MAIN_SCROLL_ID = "app-main-scroll";

/** Reset the app main scroll pane (and document) to the top. */
export function resetAppScroll() {
  if (typeof window === "undefined") return;
  const pane = document.getElementById(APP_MAIN_SCROLL_ID);
  pane?.scrollTo(0, 0);
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  requestAnimationFrame(() => {
    pane?.scrollTo(0, 0);
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
}

/** Pin module content to the top when a layout mounts (e.g. after RBAC / lock gates). */
export function useAppScrollTop() {
  useEffect(() => {
    resetAppScroll();
  }, []);
}
