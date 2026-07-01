import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Captions, List } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { MeetingListView } from "@/components/MeetingListView";
import { listMeetingsFromS3Range, getMeetingParticipantsBatch } from "@/lib/notetaker-s3-calendar-functions";
import {
  loadCachedParticipantsForPrefixes,
  saveMeetingParticipantsCacheBatch,
} from "@/lib/meeting-list-participants-cache";
import {
  addMonths,
  endOfMonth,
  isoDay,
  monthLabel,
  startOfMonth,
  type MeetingListParticipant,
  type NotetakerMeetingRow,
} from "@/lib/notetaker-meeting-ui";

export const Route = createFileRoute("/alyson-notetaker/meeting-list")({
  head: () => ({ meta: [{ title: "Meeting List — Alyson Notetaker" }] }),
  component: MeetingListPage,
});

function MeetingListPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const range = useMemo(() => {
    const s = startOfMonth(month);
    const e = endOfMonth(month);
    return { start: isoDay(s), end: isoDay(e) };
  }, [month]);

  const q = useQuery({
    queryKey: ["notetaker-meeting-list", range.start, range.end],
    queryFn: () => listMeetingsFromS3Range({ data: range }),
    staleTime: 60_000,
  });

  const meetings = (q.data?.meetings ?? []) as NotetakerMeetingRow[];

  const meetingFingerPrint = meetings.map((m) => m.prefix).join("|");

  const participantsQ = useQuery({
    queryKey: ["notetaker-meeting-list-participants", range.start, range.end, meetingFingerPrint],
    queryFn: async () => {
      const result = await getMeetingParticipantsBatch({
        data: {
          meetings: meetings.map((m) => ({
            prefix: m.prefix,
            transcriptKey: m.transcriptKey,
            botId: m.botId,
            hasTranscript: m.hasTranscript,
          })),
        },
      });
      saveMeetingParticipantsCacheBatch(
        result.participantsByPrefix as Record<string, MeetingListParticipant[]>,
      );
      return result.participantsByPrefix as Record<string, MeetingListParticipant[]>;
    },
    enabled: meetings.length > 0 && !q.isLoading,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    placeholderData: () => {
      const cached = loadCachedParticipantsForPrefixes(meetings.map((m) => m.prefix));
      return Object.keys(cached).length > 0 ? cached : undefined;
    },
  });

  const participantsByPrefix = participantsQ.data ?? {};

  return (
    <div className="ops-dense">
      <PageHeader
        eyebrow="Operations"
        title="Meeting list"
        description="Browse meetings as a list — open participants, notes, transcripts, and per-person tasks."
        dense
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/alyson-notetaker/calendar"
              className="h-7 px-2.5 rounded-md border border-border bg-background text-[11.5px] font-medium inline-flex items-center gap-1.5"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Meeting calendar
            </Link>
            <Link
              to="/alyson-notetaker"
              className="h-7 px-2.5 rounded-md border border-border bg-background text-[11.5px] font-medium inline-flex items-center gap-1.5"
            >
              <Captions className="h-3.5 w-3.5" />
              Alyson Notetaker
            </Link>
          </div>
        }
      />

      <div className="px-5 md:px-8 py-4 space-y-3">
        <div className="surface-card p-2.5 sm:p-3 flex flex-wrap items-center gap-2 font-sans">
          <List className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="text-[13px] font-medium text-foreground">{monthLabel(month)}</div>
          <div className="text-[12px] text-muted-foreground">
            {q.isLoading ? "Loading…" : `${meetings.length} meeting${meetings.length === 1 ? "" : "s"}`}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, -1))}
              className="h-7 px-2.5 rounded-md border border-border text-[11.5px] font-medium hover:bg-muted"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              className="h-7 px-2.5 rounded-md border border-border text-[11.5px] font-medium hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>

        {q.isError && (
          <div className="surface-card p-4 text-[13px] text-destructive whitespace-pre-wrap font-sans leading-relaxed">
            {q.error instanceof Error ? q.error.message : "Failed to load meetings."}
          </div>
        )}

        {q.isLoading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="surface-card h-20 animate-pulse" />
            ))}
          </div>
        ) : (
          <MeetingListView
            meetings={meetings}
            participantsByPrefix={participantsByPrefix}
            participantsBatchLoading={participantsQ.isFetching}
          />
        )}
      </div>
    </div>
  );
}
