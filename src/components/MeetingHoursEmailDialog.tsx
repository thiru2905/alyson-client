import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { MeetingHoursEmailPreview } from "@/lib/meeting-hours-email.server";

type RecipientRow = { id: string; name: string; email: string };

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function formatRangeLabel(start: string, end: string) {
  const fmt = (day: string) => {
    const d = new Date(`${day}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return day;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };
  if (start === end) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

export function MeetingHoursEmailDialog({
  open,
  preview,
  sending,
  onClose,
  onSend,
}: {
  open: boolean;
  preview: MeetingHoursEmailPreview | null;
  sending: boolean;
  onClose: () => void;
  onSend: (args: { subject: string; recipients: Array<{ name: string; email: string }> }) => void;
}) {
  const [emailSubject, setEmailSubject] = useState("");
  const [emailRecipients, setEmailRecipients] = useState<RecipientRow[]>([]);
  const [editingRecipientId, setEditingRecipientId] = useState<string | null>(null);
  const [addingRecipient, setAddingRecipient] = useState(false);
  const [editDraft, setEditDraft] = useState({ name: "", email: "" });

  useEffect(() => {
    if (!open || !preview) return;
    setEmailSubject(preview.subject);
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
  }, [open, preview]);

  if (!open || !preview) return null;

  const validEmailRecipients = emailRecipients.filter((r) => isValidEmail(r.email));
  const editDraftValid = isValidEmail(editDraft.email);
  const emailFormBusy = editingRecipientId !== null || addingRecipient;

  const commitNewRecipient = () => {
    const email = editDraft.email.trim().toLowerCase();
    if (!isValidEmail(email)) return;
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

  const canSend =
    preview.configured &&
    validEmailRecipients.length > 0 &&
    emailSubject.trim().length > 0 &&
    !emailFormBusy;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-background shadow-xl p-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-medium text-[14px]">Email meeting hours report</div>
            <div className="mt-1 text-[12px] text-muted-foreground">
              Full employee table via AWS SES from {preview.fromAddress}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (sending) return;
              onClose();
            }}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-muted text-muted-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-2.5 text-[12px] space-y-1">
          <div>
            <span className="text-muted-foreground">Report period: </span>
            <span className="font-medium">
              {formatRangeLabel(preview.range.start, preview.range.end)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Employees: </span>
            <span className="font-medium">
              {preview.employeeCount != null
                ? `${preview.employeeCount} people in table`
                : "All employees (generated on send)"}
            </span>
          </div>
        </div>

        <label className="mt-3 block text-[12px]">
          <span className="font-medium text-[11px] uppercase tracking-wide text-muted-foreground">
            Email subject
          </span>
          <input
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            disabled={sending}
            className="mt-1 w-full h-9 rounded-md border border-border bg-background px-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring/40"
            placeholder="Subject line in the recipient's inbox"
          />
        </label>

        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-medium">Recipients ({validEmailRecipients.length})</div>
            {!addingRecipient && (
              <button
                type="button"
                onClick={startAddingRecipient}
                disabled={sending || editingRecipientId !== null}
                className="h-8 px-2.5 rounded-md border border-border text-[11px] font-medium hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add recipient
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Stakeholders who will receive the full meeting-hours table for every employee.
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
                const emailValid = isValidEmail(r.email);
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
                            disabled={!isValidEmail(editDraft.email.trim())}
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
                                          editDraft.name.trim() || email.split("@")[0] || "Recipient",
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
                            className={`truncate font-mono text-[11px] ${emailValid ? "text-muted-foreground" : "text-destructive"}`}
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
                          disabled={sending}
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
                          disabled={sending}
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
              disabled={sending}
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
              disabled={sending || editingRecipientId !== null}
              className="mt-2 w-full h-9 rounded-md border border-dashed border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/30 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="h-3 w-3" />
              Add another recipient
            </button>
          )}
        </div>

        {preview.warnings.length > 0 && (
          <div className="mt-3 text-[11px] text-amber-700 dark:text-amber-400 space-y-1">
            {preview.warnings.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (sending) return;
              onClose();
            }}
            className="h-9 px-3 rounded-md border border-border text-[12px] hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSend || sending}
            onClick={() =>
              onSend({
                subject: emailSubject.trim(),
                recipients: validEmailRecipients.map((r) => ({
                  name: r.name.trim() || r.email.trim().split("@")[0] || "Recipient",
                  email: r.email.trim().toLowerCase(),
                })),
              })
            }
            className="h-9 px-3 rounded-md bg-foreground text-background text-[12px] hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            {sending ? "Sending…" : `Send to ${validEmailRecipients.length || 0}`}
          </button>
        </div>
      </div>
    </div>
  );
}
