import { useEffect, useMemo, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Loader2, Trash2 } from "lucide-react";
import { Drawer } from "@/components/Drawer";
import { Field, FormFooter, GhostBtn, PrimaryBtn, TextArea, TextInput } from "@/components/forms/FormField";
import type { EmployeeLeaveLedger, LeaveRecordEvent, LeaveType } from "@/lib/leave-schema";
import {
  LEAVE_TYPE_OPTIONS,
  LIFETIME_LEAVE_DAYS_LIMIT,
  leaveDaysInclusive,
  leaveTypeLabel,
  remainingLifetimeLeaveDays,
  sumLeaveDays,
  validateLifetimeLeaveLimit,
} from "@/lib/leave-schema";
import { isLeaveEventOverLimit } from "@/lib/leave-calendar";
import { fmtDate } from "@/lib/format";

type Props = {
  open: boolean;
  ledger: EmployeeLeaveLedger | null;
  canEdit: boolean;
  saving?: boolean;
  onClose: () => void;
  onRecordLeave: (payload: {
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    note?: string;
  }) => void;
  onVoidLeave?: (eventId: string) => void;
};

export function LeaveEmployeeLedgerDrawer({
  open,
  ledger,
  canEdit,
  saving,
  onClose,
  onRecordLeave,
  onVoidLeave,
}: Props) {
  const [tab, setTab] = useState<"history" | "record">("history");
  const [voidTarget, setVoidTarget] = useState<LeaveRecordEvent | null>(null);
  const [voidConfirmTyped, setVoidConfirmTyped] = useState("");
  const [leaveType, setLeaveType] = useState<LeaveType>("annual");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) {
      setTab("history");
      setNote("");
      setVoidTarget(null);
      setVoidConfirmTyped("");
    }
  }, [open]);

  useEffect(() => {
    if (!voidTarget) setVoidConfirmTyped("");
  }, [voidTarget]);

  const totalDays = useMemo(() => (ledger ? sumLeaveDays(ledger.leaveEvents) : 0), [ledger]);
  const remainingDays = useMemo(
    () => (ledger ? remainingLifetimeLeaveDays(ledger.leaveEvents) : LIFETIME_LEAVE_DAYS_LIMIT),
    [ledger],
  );

  const sorted = useMemo(
    () =>
      ledger
        ? [...ledger.leaveEvents].sort(
            (a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt.localeCompare(a.createdAt),
          )
        : [],
    [ledger],
  );

  const previewDays = useMemo(
    () => (startDate && endDate ? leaveDaysInclusive(startDate, endDate) : 0),
    [startDate, endDate],
  );

  const limitError = useMemo(() => {
    if (!ledger || previewDays <= 0) return null;
    const check = validateLifetimeLeaveLimit(ledger.leaveEvents, previewDays);
    return check.ok ? null : check.message;
  }, [ledger, previewDays]);

  const canSubmit =
    !saving && endDate >= startDate && previewDays > 0 && remainingDays > 0 && !limitError;

  if (!open || !ledger) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={ledger.employeeName}
      eyebrow="Leave ledger"
      width="xl"
    >
      <div className="flex flex-col flex-1 min-h-0">
        <div className="px-5 py-4 border-b border-border space-y-3">
          <div className="flex flex-wrap gap-2 text-[12px] text-muted-foreground">
            {ledger.jobTitle && <span>{ledger.jobTitle}</span>}
            {ledger.team && <span>· {ledger.team}</span>}
            {ledger.location && <span>· {ledger.location}</span>}
            {ledger.officialEmail && <span>· {ledger.officialEmail}</span>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Lifetime used" value={`${totalDays} / ${LIFETIME_LEAVE_DAYS_LIMIT}`} />
            <StatCard label="Remaining" value={`${remainingDays} day${remainingDays === 1 ? "" : "s"}`} />
          </div>
          <div className="flex gap-2">
            <TabBtn active={tab === "history"} onClick={() => setTab("history")}>
              History
            </TabBtn>
            {canEdit && (
              <TabBtn active={tab === "record"} onClick={() => setTab("record")}>
                Record leave
              </TabBtn>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "history" && (
            <div className="space-y-2">
              {sorted.length === 0 ? (
                <EmptyState>No leave recorded yet for this employee.</EmptyState>
              ) : (
                sorted.map((e) => {
                  const overLimit = isLeaveEventOverLimit(ledger.leaveEvents, e.id);
                  return (
                  <div
                    key={e.id}
                    className={`rounded-lg border px-3 py-2.5 ${
                      overLimit
                        ? "border-red-500/40 bg-red-500/10"
                        : "border-border bg-muted/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-[13px] flex items-center gap-2 flex-wrap">
                          <span>
                            {leaveTypeLabel(e.leaveType)} · {e.days} day{e.days === 1 ? "" : "s"}
                          </span>
                          {overLimit ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                              Over limit
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[12px] text-muted-foreground mt-0.5">
                          {fmtDate(e.startDate)} – {fmtDate(e.endDate)}
                        </div>
                        {e.note ? <div className="text-[12px] text-muted-foreground mt-1">{e.note}</div> : null}
                        <div className="text-[11px] text-muted-foreground mt-1 font-mono">
                          Recorded {new Date(e.createdAt).toLocaleString()}
                          {e.createdBy ? ` · ${e.createdBy}` : ""}
                        </div>
                      </div>
                      {canEdit && onVoidLeave ? (
                        <button
                          type="button"
                          onClick={() => setVoidTarget(e)}
                          className="h-8 w-8 shrink-0 grid place-items-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40"
                          title="Remove leave record"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          )}

          {tab === "record" && canEdit && (
            <form
              className="space-y-4 max-w-md"
              onSubmit={(e) => {
                e.preventDefault();
                if (!canSubmit) return;
                onRecordLeave({ leaveType, startDate, endDate, note: note.trim() || undefined });
              }}
            >
              {remainingDays === 0 ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                  Lifetime limit reached ({LIFETIME_LEAVE_DAYS_LIMIT} days). Remove a record to free days.
                </div>
              ) : null}
              <Field label="Leave type">
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-[13px]"
                >
                  {LEAVE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Start date">
                <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </Field>
              <Field label="End date">
                <TextInput
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </Field>
              <div className="text-[12px] text-muted-foreground">
                Duration: <span className="font-medium text-foreground">{previewDays} workday(s)</span>
                {previewDays > 0 ? " · weekends excluded" : endDate >= startDate ? " · no weekdays in range" : ""}
                {previewDays > 0 ? (
                  <>
                    {" · "}
                    <span className="font-medium text-foreground">{remainingDays}</span> remaining of{" "}
                    {LIFETIME_LEAVE_DAYS_LIMIT}
                  </>
                ) : null}
              </div>
              {limitError ? (
                <div className="text-[12px] text-destructive">{limitError}</div>
              ) : null}
              <Field label="Note" hint="Optional">
                <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </Field>
              <FormFooter>
                <GhostBtn type="button" onClick={() => setTab("history")}>
                  Cancel
                </GhostBtn>
                <PrimaryBtn type="submit" disabled={!canSubmit}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </PrimaryBtn>
              </FormFooter>
            </form>
          )}
        </div>
      </div>

      <AlertDialog.Root open={!!voidTarget} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/40 z-[90]" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] w-[92vw] max-w-md surface-card p-4">
            <AlertDialog.Title className="font-medium text-[14px]">Remove leave record?</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-[12px] text-muted-foreground leading-relaxed">
              This removes the leave from the ledger. A snapshot is kept in the audit log. Type{" "}
              <strong>DELETE</strong> to confirm.
            </AlertDialog.Description>
            <input
              value={voidConfirmTyped}
              onChange={(e) => setVoidConfirmTyped(e.target.value)}
              className="mt-3 w-full h-9 rounded-md border border-border bg-background px-3 text-[13px] font-mono"
              placeholder="DELETE"
            />
            <div className="mt-4 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <button type="button" className="h-8 px-3 rounded-md border border-border text-[12px] font-medium">
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  disabled={voidConfirmTyped !== "DELETE" || saving}
                  onClick={() => {
                    if (!voidTarget || !onVoidLeave) return;
                    onVoidLeave(voidTarget.id);
                    setVoidTarget(null);
                  }}
                  className="h-8 px-3 rounded-md bg-destructive text-destructive-foreground text-[12px] font-medium disabled:opacity-50"
                >
                  Remove
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Drawer>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "h-8 px-3 rounded-md text-[12px] font-medium border transition-colors " +
        (active ? "bg-muted border-border text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/60")
      }
    >
      {children}
    </button>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] text-muted-foreground py-6 text-center">{children}</div>;
}
