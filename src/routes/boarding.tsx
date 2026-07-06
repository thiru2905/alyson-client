/**
 * Boarding module disabled — superseded by /employee-onboarding (S3 roster + org chart).
 * Old checklist UI lived here; kept as redirect for bookmarks.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/boarding")({
  beforeLoad: () => {
    throw redirect({ to: "/employee-onboarding" });
  },
});

/* Previous Boarding page (PDF checklist tables) — see git history / boarding.md

import { createFileRoute, Link } from "@tanstack/react-router";
import { BoardingDataTable } from "@/components/BoardingDataTable";
...

*/
