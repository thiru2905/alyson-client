import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/pages/DashboardPage";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Dashboard — Alyson HR" },
      { name: "description", content: "Your role-aware home for people, pay, and equity." },
    ],
  }),
  component: DashboardPage,
});

