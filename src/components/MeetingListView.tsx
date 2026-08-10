import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Captions, CheckSquare, ChevronDown, FileText, Loader2, Users } from "lucide-react";
import {
  getMeetingParticipantsFromS3,
  getMeetingTasksFromS3,
} from "@/lib/notetaker-s3-calendar-functions";
import { saveMeetingParticipantsCache } from "@/lib/meeting-list-participants-cache";
import { getCachedMeetingTasks, saveMeetingTasksCache } from "@/lib/meeting-list-tasks-cache";
import { MeetingTasksPanel } from "@/components/MeetingTasksPanel";
import {
  formatMeetingListWhen,
  groupMeetingsByDay,
  meetingNotesKey,
  meetingTasksKey,
  meetingTranscriptKey,
  type MeetingListParticipant,
  type NotetakerMeetingRow,
} from "@/lib/notetaker-meeting-ui";
import { useMeetingVisibilityAuth } from "@/lib/meeting-visibility-hooks";

type PanelKind = "participants" | "tasks";

function panelButtonClass(active: boolean) {
  return (
    "h-7 px-2.5 rounded-md text-[11.5px] font-medium inline-flex items-center gap-1 transition font-sans " +
    (active
      ? "bg-foreground text-background"
      : "border border-border bg-background hover:bg-muted")
  );
}

function MeetingListCard({
  meeting,
  prefetchedParticipants,
  participantsBatchLoading,
  openPanel,
  onTogglePanel,
}: {
  meeting: NotetakerMeetingRow;
  prefetchedParticipants: MeetingListParticipant[] | undefined;
  participantsBatchLoading: boolean;
  openPanel: PanelKind | null;
  onTogglePanel: (kind: PanelKind) => void;
}) {
  const navigate = useNavigate();
  const meetingAuth = useMeetingVisibilityAuth();
  const notesKey = meetingNotesKey(meeting);
  const transcriptKey = meetingTranscriptKey(meeting);
  const tasksKey = meetingTasksKey(meeting);
  const hasPrefetched = prefetchedParticipants !== undefined;
  const cachedTasks = getCachedMeetingTasks(meeting.prefix);

  const participantsQ = useQuery({
    queryKey: ["meeting-list-participants", meeting.prefix, transcriptKey, meeting.botId],
    queryFn: async () => {
      const result = await getMeetingParticipantsFromS3({
        data: {
          transcriptKey,
          botId: meeting.botId,
          hasTranscript: meeting.hasTranscript,
          ...(await meetingAuth()),
        },
      });
      saveMeetingParticipantsCache(meeting.prefix, result.participants as MeetingListParticipant[]);
      return result;
    },
    enabled:
      openPanel === "participants" && !hasPrefetched && !participantsBatchLoading,
    initialData: hasPrefetched ? { participants: prefetchedParticipants } : undefined,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
  });

  const tasksQ = useQuery({
    queryKey: ["meeting-list-tasks", meeting.prefix, notesKey, transcriptKey, tasksKey],
    queryFn: async () => {
      const payload = await getMeetingTasksFromS3({
        data: {
          prefix: meeting.prefix,
          title: meeting.title,
          day: meeting.day,
          notesKey,
          transcriptKey,
          botId: meeting.botId,
          hasNotes: meeting.hasNotes,
          hasTranscript: meeting.hasTranscript,
          ...(await meetingAuth()),
        },
      });
      saveMeetingTasksCache(meeting.prefix, payload);
      return payload;
    },
    enabled: openPanel === "tasks",
    placeholderData: cachedTasks ?? undefined,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
  });

  const participants = (participantsQ.data?.participants ?? []) as MeetingListParticipant[];
  const canExtractTasks = meeting.hasNotes !== false || meeting.hasTranscript !== false;
  const tasksPayload = tasksQ.data;

  const panelLoading =
    (openPanel === "participants" &&
      !hasPrefetched &&
      (participantsBatchLoading || participantsQ.isLoading)) ||
    (openPanel === "tasks" && tasksQ.isLoading && !tasksPayload && !meeting.hasTasks);

  const panelError =
    (openPanel === "participants" && participantsQ.isError) ||
    (openPanel === "tasks" && tasksQ.isError);

  function openNotesPage() {
    void navigate({
      to: "/alyson-notetaker/notes",
      search: {
        notesKey,
        day: meeting.day,
        title: meeting.title,
        ...(meeting.botId ? { botId: meeting.botId } : {}),
        ...(meeting.prefix ? { prefix: meeting.prefix } : {}),
      },
    });
  }

  function openTranscriptPage() {
    void navigate({
      to: "/alyson-notetaker/transcript",
      search: {
        transcriptKey,
        day: meeting.day,
        title: meeting.title,
        ...(meeting.botId ? { botId: meeting.botId } : {}),
        ...(meeting.prefix ? { prefix: meeting.prefix } : {}),
      },
    });
  }

  return (
    <article className="surface-card flex flex-col overflow-hidden font-sans text-[12px]">
      <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
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
            onClick={() => openNotesPage()}
            disabled={meeting.hasNotes === false}
            className={
              "h-7 px-2.5 rounded-md text-[11.5px] font-medium inline-flex items-center gap-1 transition font-sans border border-border bg-background hover:bg-muted" +
              (meeting.hasNotes === false ? " opacity-40" : "")
            }
          >
            <FileText className="h-3 w-3" />
            Notes
          </button>
          <button
            type="button"
            onClick={() => openTranscriptPage()}
            disabled={meeting.hasTranscript === false}
            className={
              "h-7 px-2.5 rounded-md text-[11.5px] font-medium inline-flex items-center gap-1 transition font-sans border border-border bg-background hover:bg-muted" +
              (meeting.hasTranscript === false ? " opacity-40" : "")
            }
          >
            <Captions className="h-3 w-3" />
            Transcript
          </button>
          <button
            type="button"
            onClick={() => onTogglePanel("tasks")}
            disabled={!canExtractTasks}
            className={panelButtonClass(openPanel === "tasks") + (!canExtractTasks ? " opacity-40" : "")}
          >
            <CheckSquare className="h-3 w-3" />
            Tasks
            <ChevronDown className={"h-3 w-3 transition " + (openPanel === "tasks" ? "rotate-180" : "")} />
          </button>
        </div>
      </div>

      {openPanel && (
        <div className="flex flex-col border-t border-border/60 bg-muted/20 px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {openPanel === "participants" && "Participants"}
              {openPanel === "tasks" && "Tasks by participant"}
            </div>
          </div>

          {panelLoading && (
            <div className="flex flex-col items-center gap-2 py-6 text-[12px] text-muted-foreground font-sans">
              <Loader2 className="h-4 w-4 animate-spin" />
              {openPanel === "tasks"
                ? meeting.hasTasks
                  ? "Loading tasks from S3…"
                  : "Extracting tasks with DeepSeek and saving to S3…"
                : "Loading…"}
            </div>
          )}

          {panelError && !panelLoading && (
            <p className="py-4 text-[12px] text-muted-foreground leading-relaxed font-sans">
              {openPanel === "participants"
                ? "Could not load participants for this meeting."
                : tasksQ.error instanceof Error
                  ? tasksQ.error.message
                  : "Could not extract tasks for this meeting."}
            </p>
          )}

          {!panelLoading && !panelError && openPanel === "participants" && (
            <div className="flex flex-col gap-1.5">
              {participants.length === 0 ? (
                <p className="text-[12px] text-muted-foreground leading-relaxed font-sans">
                  No participants yet — they appear from the transcript or calendar invite list.
                </p>
              ) : (
                participants.map((p) => (
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

          {!panelLoading && !panelError && openPanel === "tasks" && tasksPayload && (
            <MeetingTasksPanel
              people={tasksPayload.people}
              model={tasksPayload.model}
              fromS3={tasksPayload.fromS3 ?? meeting.hasTasks}
            />
          )}
        </div>
      )}
    </article>
  );
}

export function MeetingListView({
  meetings,
  participantsByPrefix,
  participantsBatchLoading = false,
}: {
  meetings: NotetakerMeetingRow[];
  participantsByPrefix: Record<string, MeetingListParticipant[]>;
  participantsBatchLoading?: boolean;
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

  const grouped = groupMeetingsByDay(meetings);

  return (
    <div className="flex flex-col gap-4 font-sans">
      {grouped.map((group) => (
        <section key={group.day} className="flex flex-col gap-2">
          <div className="px-1 text-[12px] font-medium text-foreground">
            {group.label}
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">
              · {group.meetings.length} meeting{group.meetings.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {group.meetings.map((m) => (
              <MeetingListCard
                key={m.prefix}
                meeting={m}
                prefetchedParticipants={participantsByPrefix[m.prefix]}
                participantsBatchLoading={participantsBatchLoading}
                openPanel={openByPrefix[m.prefix] ?? null}
                onTogglePanel={(kind) => togglePanel(m.prefix, kind)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
