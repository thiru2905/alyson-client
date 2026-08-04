import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  previewMeetingNotesEmailFn,
  sendMeetingNotesEmailFn,
} from "@/lib/notetaker-meeting-notes-email-functions";
import { buildMeetingNotesEmailSubject } from "@/lib/meeting-notes-email-subject";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function notesEmailSentStorageKey(id: string) {
  return `alyson-notes-email-sent:${id}`;
}

type RecipientRow = { id: string; name: string; email: string };

type MeetingNotesEmailControlProps = {
  botId: string | null | undefined;
  notesMd: string;
  title?: string;
  /** Trigger button size — calendar modal uses md, live session uses sm */
  size?: "sm" | "md";
  onOpenChange?: (open: boolean) => void;
};

export function MeetingNotesEmailControl({
  botId,
  notesMd,
  title,
  size = "sm",
  onOpenChange,
}: MeetingNotesEmailControlProps) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailPreview, setEmailPreview] = useState<Awaited<
    ReturnType<typeof previewMeetingNotesEmailFn>
  > | null>(null);
  const [emailRecipients, setEmailRecipients] = useState<RecipientRow[]>([]);
  const [editingRecipientId, setEditingRecipientId] = useState<string | null>(null);
  const [addingRecipient, setAddingRecipient] = useState(false);
  const [editDraft, setEditDraft] = useState({ name: "", email: "" });
  const [emailSubject, setEmailSubject] = useState("");
  const [emailHeading, setEmailHeading] = useState("");
  const [emailMeetingStartAt, setEmailMeetingStartAt] = useState<string | null>(null);
  const emailSubjectManuallyEditedRef = useRef(false);
  const [notesEmailSent, setNotesEmailSent] = useState(false);

  const plainNotes = notesMd.trim();
  const btn =
    size === "md"
      ? "h-8 w-8 grid place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-50"
      : "h-7 w-7 grid place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-50";
  const iconCls = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  const sentBadgeCls =
    size === "md"
      ? "h-8 px-2.5 inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
      : "h-7 px-2 inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-[11px] font-medium text-emerald-700 dark:text-emerald-400";

  useEffect(() => {
    setNotesEmailSent(false);
    if (!botId) return;
    try {
      setNotesEmailSent(sessionStorage.getItem(notesEmailSentStorageKey(botId)) === "1");
    } catch {
      // ignore
    }
  }, [botId]);

  useEffect(() => {
    onOpenChange?.(emailOpen);
  }, [emailOpen, onOpenChange]);

  const emailPreviewM = useMutation({
    mutationFn: async () => {
      if (!botId) throw new Error("Missing bot id");
      return previewMeetingNotesEmailFn({
        data: {
          botId,
          notesMd: plainNotes || undefined,
          title: title || undefined,
        },
      });
    },
    onSuccess: (preview) => {
      setEmailPreview(preview);
      setEmailSubject(preview.subject);
      setEmailHeading(preview.heading);
      setEmailMeetingStartAt(preview.meetingStartAt ?? null);
      emailSubjectManuallyEditedRef.current = false;
      setEmailRecipients(
        preview.recipients.map((r, i) => ({
          id: `recipient-${i}-${r.email}`,
          name: r.name,
          email: r.email,
        })),
      );
      setEditingRecipientId(null);
      setAddingRecipient(preview.recipients.length === 0);
      setEditDraft({ name: "", email: "" });
      setEmailOpen(true);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not prepare email"),
  });

  const emailSendM = useMutation({
    mutationFn: async () => {
      if (!botId) throw new Error("Missing bot id");
      const recipients = emailRecipients
        .map((r) => ({
          name: r.name.trim() || r.email.trim().split("@")[0] || "Recipient",
          email: r.email.trim().toLowerCase(),
        }))
        .filter((r) => EMAIL_RE.test(r.email));
      return sendMeetingNotesEmailFn({
        data: {
          botId,
          notesMd: plainNotes || undefined,
          title: title || undefined,
          subject: emailSubject.trim(),
          heading: emailHeading.trim(),
          recipients,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(
        `Notes emailed to ${res.recipients.length} participant${res.recipients.length === 1 ? "" : "s"}`,
      );
      setNotesEmailSent(true);
      if (botId) {
        try {
          sessionStorage.setItem(notesEmailSentStorageKey(botId), "1");
        } catch {
          // ignore
        }
      }
      setEmailOpen(false);
      setEmailPreview(null);
      setEmailRecipients([]);
      setEmailSubject("");
      setEmailHeading("");
      setEmailMeetingStartAt(null);
      emailSubjectManuallyEditedRef.current = false;
      setEditingRecipientId(null);
      setAddingRecipient(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to send email"),
  });

  const closeEmailDialog = () => {
    if (emailSendM.isPending) return;
    setEmailOpen(false);
    setEmailPreview(null);
    setEmailRecipients([]);
    setEmailSubject("");
    setEmailHeading("");
    setEmailMeetingStartAt(null);
    emailSubjectManuallyEditedRef.current = false;
    setEditingRecipientId(null);
    setAddingRecipient(false);
  };

  useEffect(() => {
    if (!emailOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (emailSendM.isPending) return;
      setEmailOpen(false);
      setEmailPreview(null);
      setEmailRecipients([]);
      setEmailSubject("");
      setEmailHeading("");
      setEmailMeetingStartAt(null);
      emailSubjectManuallyEditedRef.current = false;
      setEditingRecipientId(null);
      setAddingRecipient(false);
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [emailOpen, emailSendM.isPending]);

  const validEmailRecipients = emailRecipients.filter((r) => EMAIL_RE.test(r.email.trim()));
  const editDraftEmailValid = EMAIL_RE.test(editDraft.email.trim());
  const editDraftValid = editDraftEmailValid;
  const emailFormBusy = editingRecipientId !== null || addingRecipient;

  const commitNewRecipient = () => {
    const email = editDraft.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return;
    if (emailRecipients.some((r) => r.email.trim().toLowerCase() === email)) {
      toast.error("That email is already in the list");
      return;
    }
    setEmailRecipients((rows) => [
      ...rows,
      {
        id: `recipient-manual-${Date.now()}`,
        name: editDraft.name.trim() || email.split("@")[0] || "Recipient",
        email,
      },
    ]);
    setAddingRecipient(false);
    setEditDraft({ name: "", email: "" });
  };

  const startAddingRecipient = () => {
    setAddingRecipient(true);
    setEditingRecipientId(null);
    setEditDraft({ name: "", email: "" });
  };

  const canSendEmail =
    Boolean(emailPreview?.configured) &&
    validEmailRecipients.length > 0 &&
    emailSubject.trim().length > 0 &&
    emailHeading.trim().length > 0 &&
    !emailFormBusy &&
    !emailPreview?.warnings.some((w) => w.includes("Notes are empty") || w.includes("No meeting notes"));

  return (
    <>
      {notesEmailSent ? (
        <span className={sentBadgeCls} title="Meeting notes were emailed to participants">
          <Check className={`${iconCls} shrink-0`} />
          Notes sent
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (!plainNotes || !botId || emailPreviewM.isPending) return;
            emailPreviewM.mutate();
          }}
          disabled={!plainNotes || !botId || emailPreviewM.isPending || emailSendM.isPending}
          className={btn}
          title={
            !botId
              ? "Email requires a linked bot session"
              : emailPreviewM.isPending
                ? "Preparing email…"
                : "Email formatted notes to meeting participants"
          }
          aria-label="Email notes to participants"
        >
          <Send className={iconCls} />
        </button>
      )}

      {emailOpen && emailPreview && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/50 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEmailDialog();
          }}
        >
          <div className="w-full max-w-lg rounded-lg border border-border bg-background shadow-xl p-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-[14px]">Email meeting notes</div>
                <div className="mt-1 text-[12px] text-muted-foreground">
                  Formatted email via AWS SES from {emailPreview.fromAddress}
                </div>
              </div>
              <button
                type="button"
                onClick={closeEmailDialog}
                className="h-8 w-8 grid place-items-center rounded-md hover:bg-muted text-muted-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <label className="block text-[12px]">
                <span className="font-medium text-[11px] uppercase tracking-wide text-muted-foreground">
                  Meeting title
                </span>
                <input
                  value={emailHeading}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEmailHeading(next);
                    if (!emailSubjectManuallyEditedRef.current) {
                      setEmailSubject(buildMeetingNotesEmailSubject(next, emailMeetingStartAt));
                    }
                  }}
                  disabled={emailSendM.isPending}
                  className="mt-1 w-full h-9 rounded-md border border-border bg-background px-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring/40"
                  placeholder="e.g. 03072026 Live meeting"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Shown as the heading inside the email.
                </span>
              </label>
              <label className="block text-[12px]">
                <span className="font-medium text-[11px] uppercase tracking-wide text-muted-foreground">
                  Email subject
                </span>
                <input
                  value={emailSubject}
                  onChange={(e) => {
                    emailSubjectManuallyEditedRef.current = true;
                    setEmailSubject(e.target.value);
                  }}
                  disabled={emailSendM.isPending}
                  className="mt-1 w-full h-9 rounded-md border border-border bg-background px-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring/40"
                  placeholder="Subject line in the recipient's inbox"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Editable — updates automatically when you change the meeting title unless you edit this
                  field.
                </span>
              </label>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12px] font-medium">Recipients ({validEmailRecipients.length})</div>
                {!addingRecipient && (
                  <button
                    type="button"
                    onClick={startAddingRecipient}
                    disabled={emailSendM.isPending || editingRecipientId !== null}
                    className="h-8 px-2.5 rounded-md border border-border text-[11px] font-medium hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add recipient
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Include anyone — add emails beyond meeting participants.
              </p>
              {addingRecipient && (
                <div className="mt-2 rounded-md border border-dashed border-primary/40 bg-muted/20 px-2.5 py-2.5 space-y-2">
                  <div className="text-[11px] font-medium text-foreground">New recipient</div>
                  <input
                    value={editDraft.email}
                    onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editDraftValid) {
                        e.preventDefault();
                        commitNewRecipient();
                      }
                    }}
                    placeholder="email@example.com"
                    className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
                    autoFocus
                  />
                  <input
                    value={editDraft.name}
                    onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editDraftValid) {
                        e.preventDefault();
                        commitNewRecipient();
                      }
                    }}
                    placeholder="Name (optional)"
                    className="w-full h-8 rounded-md border border-border bg-background px-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setAddingRecipient(false);
                        setEditDraft({ name: "", email: "" });
                      }}
                      className="h-7 px-2 rounded-md border border-border text-[11px] hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!editDraftValid}
                      onClick={commitNewRecipient}
                      className="h-7 px-2.5 rounded-md bg-foreground text-background text-[11px] hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <Check className="h-3 w-3" />
                      Add to list
                    </button>
                  </div>
                </div>
              )}
              {emailRecipients.length ? (
                <ul className="mt-2 space-y-1.5 text-[12px]">
                  {emailRecipients.map((r) => {
                    const editing = editingRecipientId === r.id;
                    const emailValid = EMAIL_RE.test(r.email.trim());
                    return (
                      <li key={r.id} className="rounded-md border border-border px-2.5 py-1.5">
                        {editing ? (
                          <div className="space-y-2">
                            <input
                              value={editDraft.name}
                              onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                              placeholder="Name"
                              className="w-full h-8 rounded-md border border-border bg-background px-2 text-[12px]"
                              autoFocus
                            />
                            <input
                              value={editDraft.email}
                              onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                              placeholder="email@example.com"
                              className="w-full h-8 rounded-md border border-border bg-background px-2 text-[12px] font-mono"
                            />
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRecipientId(null);
                                  setEditDraft({ name: "", email: "" });
                                }}
                                className="h-7 px-2 rounded-md border border-border text-[11px] hover:bg-muted"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={!EMAIL_RE.test(editDraft.email.trim())}
                                onClick={() => {
                                  const email = editDraft.email.trim().toLowerCase();
                                  if (
                                    emailRecipients.some(
                                      (row) => row.id !== r.id && row.email.trim().toLowerCase() === email,
                                    )
                                  ) {
                                    toast.error("That email is already in the list");
                                    return;
                                  }
                                  setEmailRecipients((rows) =>
                                    rows.map((row) =>
                                      row.id === r.id
                                        ? {
                                            ...row,
                                            name:
                                              editDraft.name.trim() ||
                                              email.split("@")[0] ||
                                              "Recipient",
                                            email,
                                          }
                                        : row,
                                    ),
                                  );
                                  setEditingRecipientId(null);
                                  setEditDraft({ name: "", email: "" });
                                }}
                                className="h-7 px-2 rounded-md bg-foreground text-background text-[11px] hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
                              >
                                <Check className="h-3 w-3" />
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{r.name}</div>
                              <div
                                className={`truncate font-mono text-[11px] ${
                                  emailValid ? "text-muted-foreground" : "text-destructive"
                                }`}
                              >
                                {r.email}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRecipientId(r.id);
                                setAddingRecipient(false);
                                setEditDraft({ name: r.name, email: r.email });
                              }}
                              disabled={emailSendM.isPending}
                              className="shrink-0 h-7 w-7 grid place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-50"
                              title="Edit recipient"
                              aria-label={`Edit ${r.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEmailRecipients((rows) => rows.filter((row) => row.id !== r.id));
                                if (editingRecipientId === r.id) {
                                  setEditingRecipientId(null);
                                  setEditDraft({ name: "", email: "" });
                                }
                              }}
                              disabled={emailSendM.isPending}
                              className="shrink-0 h-7 w-7 grid place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-destructive hover:bg-muted/40 disabled:opacity-50"
                              title="Remove recipient"
                              aria-label={`Remove ${r.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : !addingRecipient ? (
                <button
                  type="button"
                  onClick={startAddingRecipient}
                  disabled={emailSendM.isPending}
                  className="mt-2 w-full h-10 rounded-md border border-dashed border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/30 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add an email address
                </button>
              ) : null}
              {emailRecipients.length > 0 && !addingRecipient && (
                <button
                  type="button"
                  onClick={startAddingRecipient}
                  disabled={emailSendM.isPending || editingRecipientId !== null}
                  className="mt-2 w-full h-9 rounded-md border border-dashed border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/30 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-3 w-3" />
                  Add another recipient
                </button>
              )}
            </div>

            {emailPreview.unmapped.length > 0 && (
              <div className="mt-3 text-[11px] text-amber-700 dark:text-amber-400">
                Not mapped: {emailPreview.unmapped.map((u) => u.name).join(", ")}
              </div>
            )}

            {emailPreview.warnings.length > 0 && (
              <div className="mt-3 text-[11px] text-muted-foreground space-y-1">
                {emailPreview.warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeEmailDialog}
                className="h-9 px-3 rounded-md border border-border text-[12px] hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSendEmail || emailSendM.isPending || notesEmailSent}
                onClick={() => emailSendM.mutate()}
                className="h-9 px-3 rounded-md bg-foreground text-background text-[12px] hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {notesEmailSent ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Notes sent
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    {emailSendM.isPending
                      ? "Sending…"
                      : `Send to ${validEmailRecipients.length || 0}`}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
