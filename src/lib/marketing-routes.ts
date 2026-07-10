/** Paths reachable without signing in (marketing + auth). */
export const MARKETING_PUBLIC_PATHS = [
  "/",
  "/auth",
  "/features",
  "/modules",
  "/how-it-works",
  "/about",
  "/careers",
  "/contact",
  "/faq",
  "/voices",
  "/terms",
  "/privacy",
  "/cookies",
] as const;

export type MarketingPublicPath = (typeof MARKETING_PUBLIC_PATHS)[number];

export function isMarketingPublicPath(path: string): path is MarketingPublicPath {
  return (MARKETING_PUBLIC_PATHS as readonly string[]).includes(path);
}

/** Home and auth redirect signed-in users to the app; other marketing pages stay readable. */
export function isSignedInLandingRedirectPath(path: string) {
  return path === "/" || path === "/auth";
}
