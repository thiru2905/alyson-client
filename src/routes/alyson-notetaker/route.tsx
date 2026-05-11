import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/alyson-notetaker")({
  head: () => ({ meta: [{ title: "Alyson Notetaker — Alyson HR" }] }),
  component: AlysonNotetakerLayout,
});

function AlysonNotetakerLayout() {
  return <Outlet />;
}

