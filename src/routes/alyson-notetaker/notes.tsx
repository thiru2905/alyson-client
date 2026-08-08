import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { MeetingDocPage } from "@/components/MeetingDocPage";

const notesSearchSchema = z.object({
  notesKey: z.string().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  title: z.string().min(1).optional(),
  botId: z.string().min(1).optional(),
  prefix: z.string().min(1).optional(),
});

export const Route = createFileRoute("/alyson-notetaker/notes")({
  head: () => ({ meta: [{ title: "Meeting Notes — Alyson Notetaker" }] }),
  validateSearch: (search) => notesSearchSchema.parse(search),
  component: NotesRoutePage,
});

function NotesRoutePage() {
  const search = Route.useSearch();
  return (
    <MeetingDocPage
      kind="notes"
      docKey={search.notesKey}
      day={search.day}
      title={search.title}
      botId={search.botId}
      prefix={search.prefix}
    />
  );
}
