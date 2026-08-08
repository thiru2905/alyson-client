import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { MeetingDocPage } from "@/components/MeetingDocPage";

const transcriptSearchSchema = z.object({
  transcriptKey: z.string().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  title: z.string().min(1).optional(),
  botId: z.string().min(1).optional(),
  prefix: z.string().min(1).optional(),
});

export const Route = createFileRoute("/alyson-notetaker/transcript")({
  head: () => ({ meta: [{ title: "Meeting Transcript — Alyson Notetaker" }] }),
  validateSearch: (search) => transcriptSearchSchema.parse(search),
  component: TranscriptRoutePage,
});

function TranscriptRoutePage() {
  const search = Route.useSearch();
  return (
    <MeetingDocPage
      kind="transcript"
      docKey={search.transcriptKey}
      day={search.day}
      title={search.title}
      botId={search.botId}
      prefix={search.prefix}
    />
  );
}
