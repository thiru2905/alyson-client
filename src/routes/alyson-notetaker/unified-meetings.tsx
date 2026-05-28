import { createFileRoute } from "@tanstack/react-router";
import { UnifiedMeetingsPage } from "./analytics.unified-meetings";

export const Route = createFileRoute("/alyson-notetaker/unified-meetings")({
  head: () => ({ meta: [{ title: "Unified Meetings — Alyson Notetaker" }] }),
  component: UnifiedMeetingsPage,
});
