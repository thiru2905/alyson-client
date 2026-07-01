import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Captions, ChevronDown, Copy, FileText, Loader2, Users } from "lucide-react";
import {
  getMeetingNotesMdFromS3,
  getMeetingParticipantsFromS3,
  getMeetingTranscriptTextFromS3,
} from "@/lib/notetaker-s3-calendar-functions";
import {
  formatMeetingListWhen,
  meetingNotesKey,
  meetingTranscriptKey,
  type MeetingListParticipant,
  type NotetakerMeetingRow,
} from "@/lib/notetaker-meeting-ui";
import { toast } from "sonner";

type PanelKind = "participants" | "notes" | "transcript";

function panelButtonClass(active: boolean) {
  return (
    "h-7 px-2.5 rounded-md text-[11.5px] font-medium inline-flex items-center gap-1 transition font-sans " +
    (active
      ? "bg-foreground text-background"
      : "border border-border bg-background hover:bg-muted")
  );
}

function ParticipantChips({
  participants,
  loading,
}: {
  participants: MeetingListParticipant[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground font-sans">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading participants…
      </div>
    );
  }

  if (participants.length === 0) {
    return <p className="text-[12px] text-muted-foreground font-sans">No participants found yet.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 font-sans">
      <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
      {participants.map((p) => (
        <span
          key={`${p.source}-${p.name}`}
          className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium"
          title={p.source === "calendar" ? "Calendar invitee" : "Spoke in meeting"}
        >
          {p.name}
        </span>
      ))}
    </div>
  );
}

function MeetingListCard({
  meeting,
  participants,
  participantsLoading,
  openPanel,
  onTogglePanel,
}: {
  meeting: NotetakerMeetingRow;
  participants: MeetingListParticipant[];
  participantsLoading: boolean;
  openPanel: PanelKind | null;
  onTogglePanel: (kind: PanelKind) => void;
}) {
  const notesKey = meetingNotesKey(meeting);
  const transcriptKey = meetingTranscriptKey(meeting);

  const participantsQ = useQuery({
    queryKey: ["meeting-list-participants", meeting.prefix, transcriptKey, meeting.botId],
    queryFn: () =>
      getMeetingParticipantsFromS3({
        data: {
          transcriptKey,
          botId: meeting.botId,
          hasTranscript: meeting.hasTranscript,
        },
      }),
    enabled: openPanel === "participants" && participants.length === 0,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const notesQ = useQuery({
    queryKey: ["meeting-list-notes", notesKey],
    queryFn: () => getMeetingNotesMdFromS3({ data: { notesKey } }),
    enabled: openPanel === "notes",
    staleTime: 10 * 60_000,
    retry: false,
  });

  const transcriptQ = useQuery({
    queryKey: ["meeting-list-transcript", transcriptKey],
    queryFn: () => getMeetingTranscriptTextFromS3({ data: { transcriptKey } }),
    enabled: openPanel === "transcript",
    staleTime: 10 * 60_000,
    retry: false,
  });

  const visibleParticipants =
    openPanel === "participants" && participantsQ.data?.participants?.length
      ? participantsQ.data.participants
      : participants;

  const panelLoading =
    (openPanel === "participants" && participantsLoading && visibleParticipants.length === 0) ||
    (openPanel === "participants" && participantsQ.isLoading) ||
    (openPanel === "notes" && notesQ.isLoading) ||
    (openPanel === "transcript" && transcriptQ.isLoading);

  const panelError =
    (openPanel === "notes" && notesQ.isError) || (openPanel === "transcript" && transcriptQ.isError);

  const copyableText =
    openPanel === "notes"
      ? notesQ.data?.notesMd?.trim() ?? ""
      : openPanel === "transcript"
        ? transcriptQ.data?.transcriptText?.trim() ?? ""
        : "";

  async function copyPanelContent() {
    if (!copyableText) {
      toast.error("Nothing to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(copyableText);
      toast.success(openPanel === "notes" ? "Notes copied" : "Transcript copied");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to copy");
    }
  }

  return (
    <article className="surface-card flex flex-col overflow-hidden font-sans text-[12px]">
      <div className="flex flex-col gap-3 px-3 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-medium leading-tight text-foreground">{meeting.title}</div>
            <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
              {formatMeetingListWhen(meeting.startedAt, meeting.day)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onTogglePanel("participants")}
              className={panelButtonClass(openPanel === "participants")}
            >
              <Users className="h-3 w-3" />
              View participants
              <ChevronDown
                className={"h-3 w-3 transition " + (openPanel === "participants" ? "rotate-180" : "")}
              />
            </button>
            <button
              type="button"
              onClick={() => onTogglePanel("notes")}
              disabled={meeting.hasNotes === false}
              className={panelButtonClass(openPanel === "notes") + (meeting.hasNotes === false ? " opacity-40" : "")}
            >
              <FileText className="h-3 w-3" />
              Notes
              <ChevronDown className={"h-3 w-3 transition " + (openPanel === "notes" ? "rotate-180" : "")} />
            </button>
            <button
              type="button"
              onClick={() => onTogglePanel("transcript")}
              disabled={meeting.hasTranscript === false}
              className={
                panelButtonClass(openPanel === "transcript") + (meeting.hasTranscript === false ? " opacity-40" : "")
              }
            >
              <Captions className="h-3 w-3" />
              Transcript
              <ChevronDown
                className={"h-3 w-3 transition " + (openPanel === "transcript" ? "rotate-180" : "")}
              />
            </button>
          </div>
        </div>

        <ParticipantChips participants={visibleParticipants} loading={participantsLoading} />
      </div>

      {openPanel && (
        <div className="flex flex-col border-t border-border/60 bg-muted/20 px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {openPanel === "participants" && "All participants"}
              {openPanel === "notes" && "Meeting notes"}
              {openPanel === "transcript" && "Transcript"}
            </div>
            {(openPanel === "notes" || openPanel === "transcript") && (
              <button
                type="button"
                onClick={() => void copyPanelContent()}
                disabled={panelLoading || panelError || !copyableText}
                className="h-7 w-7 shrink-0 grid place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40"
                title="Copy"
                aria-label={openPanel === "notes" ? "Copy notes" : "Copy transcript"}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {panelLoading && (
            <div className="flex items-center gap-2 py-6 text-[12px] text-muted-foreground font-sans">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}

          {panelError && !panelLoading && (
            <p className="py-4 text-[12px] text-muted-foreground leading-relaxed font-sans">
              {openPanel === "notes"
                ? "Notes are not in S3 yet for this meeting."
                : "Transcript is not in S3 yet for this meeting."}
            </p>
          )}

          {!panelLoading && !panelError && openPanel === "participants" && (
            <div className="flex flex-col gap-1.5">
              {visibleParticipants.length === 0 ? (
                <p className="text-[12px] text-muted-foreground leading-relaxed font-sans">
                  No participants yet — they appear from the transcript or calendar invite list.
                </p>
              ) : (
                visibleParticipants.map((p) => (
                  <div
                    key={`${p.source}-${p.name}`}
                    className="flex items-center justify-between rounded-md border border-border bg-background px-2.5 py-2 font-sans"
                  >
                    <div className="min-w-0">
                      <span className="text-[12px] font-medium text-foreground">{p.name}</span>
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {p.source === "calendar" ? "Calendar invite" : "Spoke in meeting"}
                      </span>
                    </div>
                    {p.source === "transcript" && (
                      <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                        {p.utterances ?? 0} line{(p.utterances ?? 0) === 1 ? "" : "s"} · {p.words ?? 0} words
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {!panelLoading && !panelError && openPanel === "notes" && (
            <div className="max-h-[min(50vh,420px)] overflow-y-auto rounded-md border border-border bg-background p-3">
              {notesQ.data?.notesMd?.trim() ? (
                <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-foreground">
                  {notesQ.data.notesMd}
                </pre>
              ) : (
                <p className="text-[12px] text-muted-foreground font-sans">No notes content.</p>
              )}
            </div>
          )}

          {!panelLoading && !panelError && openPanel === "transcript" && (
            <div className="max-h-[min(50vh,420px)] overflow-y-auto rounded-md border border-border bg-background p-3">
              {transcriptQ.data?.transcriptText?.trim() ? (
                <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-foreground">
                  {transcriptQ.data.transcriptText}
                </pre>
              ) : (
                <p className="text-[12px] text-muted-foreground font-sans">No transcript content.</p>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function MeetingListView({
  meetings,
  participantsByPrefix,
  participantsLoading,
}: {
  meetings: NotetakerMeetingRow[];
  participantsByPrefix: Record<string, MeetingListParticipant[]>;
  participantsLoading: boolean;
}) {
  const [openByPrefix, setOpenByPrefix] = useState<Record<string, PanelKind | null>>({});

  function togglePanel(prefix: string, kind: PanelKind) {
    setOpenByPrefix((prev) => ({
      ...prev,
      [prefix]: prev[prefix] === kind ? null : kind,
    }));
  }

  if (meetings.length === 0) {
    return (
      <div className="surface-card px-4 py-10 text-center text-[13px] text-muted-foreground font-sans leading-relaxed">
        No meetings with notes or transcripts in this period.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 font-sans">
      {meetings.map((m) => (
        <MeetingListCard
          key={m.prefix}
          meeting={m}
          participants={participantsByPrefix[m.prefix] ?? []}
          participantsLoading={participantsLoading}
          openPanel={openByPrefix[m.prefix] ?? null}
          onTogglePanel={(kind) => togglePanel(m.prefix, kind)}
        />
      ))}
    </div>
  );
}
