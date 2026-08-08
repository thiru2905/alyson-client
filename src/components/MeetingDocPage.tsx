import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Captions, Copy, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { MeetingNotesEmailControl } from "@/components/MeetingNotesEmailControl";
import { MeetingNotesMarkdown } from "@/components/MeetingNotesMarkdown";
import { MeetingTranscriptView } from "@/components/MeetingTranscriptView";
import {
  ensureMeetingNotesInS3Fn,
  getMeetingNotesMdFromS3,
  getMeetingTranscriptTextFromS3,
} from "@/lib/notetaker-s3-calendar-functions";
import { useMeetingVisibilityAuth } from "@/lib/meeting-visibility-hooks";
import { downloadTextFile, meetingExportFilenameStem } from "@/lib/download-text-file";

export type MeetingDocKind = "notes" | "transcript";

type MeetingDocPageProps = {
  kind: MeetingDocKind;
  docKey: string;
  day?: string;
  title?: string;
  botId?: string | null;
  prefix?: string;
};

export function MeetingDocPage({
  kind,
  docKey,
  day = "",
  title,
  botId = null,
  prefix,
}: MeetingDocPageProps) {
  const meetingAuth = useMeetingVisibilityAuth();
  const qc = useQueryClient();
  const isNotes = kind === "notes";
  const meetingTitle =
    title?.trim() || (isNotes ? "Meeting notes" : "Meeting transcript");
  const label = isNotes ? "Notes" : "Transcript";
  const Icon = isNotes ? FileText : Captions;

  const docQ = useQuery({
    queryKey: ["notetaker-doc-page", kind, docKey],
    queryFn: async () => {
      const auth = await meetingAuth();
      if (isNotes) {
        const r = await getMeetingNotesMdFromS3({ data: { notesKey: docKey, ...auth } });
        return { text: r.notesMd ?? "" };
      }
      const r = await getMeetingTranscriptTextFromS3({
        data: { transcriptKey: docKey, ...auth },
      });
      return { text: r.transcriptText ?? "" };
    },
    staleTime: 10 * 60_000,
    retry: false,
  });

  const generateNotesM = useMutation({
    mutationFn: async () => {
      const auth = await meetingAuth();
      return ensureMeetingNotesInS3Fn({
        data: {
          botId: botId ?? undefined,
          prefix: prefix || undefined,
          ...auth,
        },
      });
    },
    onSuccess: (res) => {
      if (res.ok && res.notesMd) {
        toast.success("Notes saved to S3");
        qc.setQueryData(["notetaker-doc-page", "notes", docKey], { text: res.notesMd });
        void qc.invalidateQueries({ queryKey: ["notetaker-calendar"] });
        void docQ.refetch();
        return;
      }
      if (res.ok) {
        toast.success("Notes saved to S3");
        void docQ.refetch();
        return;
      }
      toast.error(String(res.skipped || "Could not generate notes"));
      void docQ.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to generate notes"),
  });

  const text = docQ.data?.text ?? "";
  const actionsDisabled =
    docQ.isLoading || generateNotesM.isPending || docQ.isError || !text.trim();
  const canGenerateNotes =
    isNotes &&
    Boolean(botId || prefix) &&
    !(docQ.error instanceof Error && /forbidden/i.test(docQ.error.message));

  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as any).__ALYSON_MINI_CONTEXT__ = {
      module: isNotes ? "notetaker-notes" : "notetaker-transcript",
      title: meetingTitle,
      day,
      docKey,
      botId,
      prefix: prefix ?? null,
      chars: text.length,
    };
  }, [isNotes, meetingTitle, day, docKey, botId, prefix, text.length]);

  const exportDoc = () => {
    if (!text.trim()) return toast.error("Nothing to export");
    const stem = meetingExportFilenameStem(meetingTitle);
    const dayPrefix = day ? `${day}-` : "";
    if (isNotes) {
      downloadTextFile(`${dayPrefix}${stem}-notes.md`, text, "text/markdown;charset=utf-8");
      toast.success("Notes exported");
      return;
    }
    downloadTextFile(`${dayPrefix}${stem}-transcript.txt`, text, "text/plain;charset=utf-8");
    toast.success("Transcript exported");
  };

  const copyDoc = async () => {
    if (!text.trim()) return toast.error("Nothing to copy");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(isNotes ? "Notes copied" : "Transcript copied");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to copy");
    }
  };

  const loadingLabel = generateNotesM.isPending
    ? "Generating notes from transcript and saving to S3…"
    : isNotes
      ? "Reading notes from S3…"
      : "Reading transcript from S3…";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          eyebrow="Operations"
          title={meetingTitle}
          description={
            day
              ? `${label} for ${day}. Export, copy, or email from the toolbar.`
              : `Meeting ${label.toLowerCase()}. Export, copy, or email from the toolbar.`
          }
          dense
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/alyson-notetaker/calendar"
                search={day ? { day } : {}}
                className="h-8 px-3 rounded-md border border-border bg-background text-xs hover:bg-muted inline-flex items-center"
              >
                ← Calendar
              </Link>
              <button
                type="button"
                onClick={exportDoc}
                disabled={actionsDisabled}
                className="h-8 px-2.5 rounded-md border border-border bg-background text-[11.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-50 inline-flex items-center gap-1.5"
                title="Export"
                aria-label={`Export ${label.toLowerCase()}`}
              >
                <Download className="h-4 w-4" />
                Export
              </button>
              <button
                type="button"
                onClick={() => void copyDoc()}
                disabled={actionsDisabled}
                className="h-8 w-8 grid place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-50"
                title="Copy"
                aria-label={`Copy ${label.toLowerCase()}`}
              >
                <Copy className="h-4 w-4" />
              </button>
              <MeetingNotesEmailControl
                botId={botId}
                notesMd={text}
                title={meetingTitle}
                size="md"
              />
            </div>
          }
        />
      </div>

      <div className="app-page-gutter flex min-h-0 flex-1 flex-col pb-4 pt-4">
        <section className="surface-card flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {isNotes ? "Meeting notes" : "Transcript"}
            </div>
            {day ? (
              <div className="ml-auto text-[11px] tabular-nums text-muted-foreground">{day}</div>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {(docQ.isLoading || generateNotesM.isPending) && (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 w-full rounded bg-muted" />
                <div className="h-3 w-5/6 rounded bg-muted" />
                <div className="h-3 w-4/5 rounded bg-muted" />
                <p className="pt-2 text-sm text-muted-foreground">{loadingLabel}</p>
              </div>
            )}
            {docQ.isError && !generateNotesM.isPending && (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  {docQ.error instanceof Error && /forbidden/i.test(docQ.error.message)
                    ? docQ.error.message
                    : isNotes
                      ? "Notes are not in S3 yet for this meeting."
                      : docQ.error instanceof Error
                        ? docQ.error.message
                        : "Could not load this document."}
                </p>
                {canGenerateNotes && (
                  <button
                    type="button"
                    onClick={() => generateNotesM.mutate()}
                    disabled={generateNotesM.isPending}
                    className="h-8 px-3 rounded-md bg-foreground text-background text-xs font-medium disabled:opacity-50"
                  >
                    Generate notes from transcript
                  </button>
                )}
              </div>
            )}
            {!docQ.isLoading &&
              !generateNotesM.isPending &&
              !docQ.isError &&
              text.trim() &&
              (isNotes ? (
                <MeetingNotesMarkdown markdown={text} />
              ) : (
                <MeetingTranscriptView text={text} />
              ))}
            {!docQ.isLoading &&
              !generateNotesM.isPending &&
              !docQ.isError &&
              !text.trim() && (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>No {label.toLowerCase()} in S3 for this meeting yet.</p>
                  {canGenerateNotes && (
                    <button
                      type="button"
                      onClick={() => generateNotesM.mutate()}
                      disabled={generateNotesM.isPending}
                      className="h-8 px-3 rounded-md bg-foreground text-background text-xs font-medium disabled:opacity-50"
                    >
                      Generate notes from transcript
                    </button>
                  )}
                </div>
              )}
          </div>
        </section>
      </div>
    </div>
  );
}
