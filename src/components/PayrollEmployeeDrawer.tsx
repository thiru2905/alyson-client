import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Drawer } from "@/components/Drawer";
import { Field, FormFooter, GhostBtn, PrimaryBtn, TextArea, TextInput } from "@/components/forms/FormField";
import type { PayrollReportRow } from "@/lib/payroll-schema";
import { payCycleLabel } from "@/lib/payroll-schema";
import { fmtCurrency, fmtDate, fmtPct } from "@/lib/format";

type Props = {
  open: boolean;
  row: PayrollReportRow | null;
  canEdit: boolean;
  saving?: boolean;
  onClose: () => void;
  onSave: (patch: {
    employeeId: string;
    startingDate?: string | null;
    lastSalaryRevisionDate?: string | null;
    nextSalaryReviewDate?: string | null;
    startingBaseSalaryLocal?: number | null;
    incrementLocal?: number | null;
    benefitsLocal?: number | null;
    reimbursementLocal?: number | null;
    meetingCreditsHours?: number | null;
    additionalCreditsHours?: number | null;
  }) => void;
  onMarkPaid?: (payload: { note?: string }) => void;
  onUnmarkPaid?: () => void;
};

export function PayrollEmployeeDrawer({
  open,
  row,
  canEdit,
  saving,
  onClose,
  onSave,
  onMarkPaid,
  onUnmarkPaid,
}: Props) {
  const [startingDate, setStartingDate] = useState("");
  const [lastRev, setLastRev] = useState("");
  const [nextRev, setNextRev] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [increment, setIncrement] = useState("");
  const [benefits, setBenefits] = useState("");
  const [reimbursement, setReimbursement] = useState("");
  const [meetingCredits, setMeetingCredits] = useState("");
  const [additionalCredits, setAdditionalCredits] = useState("");
  const [paidNote, setPaidNote] = useState("");

  useEffect(() => {
    if (!open || !row) return;
    setStartingDate(row.startingDate ?? "");
    setLastRev(row.lastSalaryRevisionDate ?? "");
    setNextRev(row.nextSalaryReviewDate ?? "");
    setBaseSalary(String(row.startingBaseSalaryLocal || ""));
    setIncrement(String(row.incrementLocal || ""));
    setBenefits(String(row.benefitsLocal || ""));
    setReimbursement(String(row.reimbursementLocal || ""));
    setMeetingCredits(String(row.meetingCreditsHours || ""));
    setAdditionalCredits(String(row.additionalCreditsHours || ""));
    setPaidNote("");
  }, [open, row]);

  if (!row) return null;

  const num = (s: string) => {
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  };

  const cur = row.localCurrency;
  const money = (n: number) => fmtCurrency(n, { currency: cur });

  return (
    <Drawer open={open} onClose={onClose} title={row.employeeName} eyebrow="Payroll" width="md">
      <div className="space-y-4 text-[13px] flex-1 overflow-y-auto px-5 py-4">
        <div className="text-muted-foreground">
          {row.team || "—"} · {row.location || "—"} · {payCycleLabel(row.payCycle)}
        </div>
        <div className="text-[12px] text-muted-foreground">
          TD period: {row.periodLabel} · Pay {fmtDate(row.payDate)}
        </div>

        {row.paidAt ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px]">
            <div className="font-medium text-emerald-800 dark:text-emerald-300">Marked paid</div>
            <div className="text-muted-foreground mt-0.5">
              {fmtDate(row.paidAt.slice(0, 10))}
              {row.paidBy ? ` · ${row.paidBy}` : ""}
            </div>
            {canEdit && onUnmarkPaid && (
              <button
                type="button"
                onClick={onUnmarkPaid}
                disabled={saving}
                className="mt-2 text-[11px] underline text-muted-foreground hover:text-foreground"
              >
                Unmark paid
              </button>
            )}
          </div>
        ) : canEdit && onMarkPaid ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <div className="font-medium text-[12px]">Record payment</div>
            <Field label="Note (optional)">
              <TextArea value={paidNote} onChange={(e) => setPaidNote(e.target.value)} rows={2} />
            </Field>
            <button
              type="button"
              onClick={() => onMarkPaid({ note: paidNote.trim() || undefined })}
              disabled={saving}
              className="h-8 px-3 rounded-md bg-foreground text-background text-xs"
            >
              Mark as paid ({money(row.totalLocal)})
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <Stat label="TD logged" value={`${row.effectiveHours}h`} />
          <Stat label="Required" value={`${row.totalRequiredHours}h`} />
          <Stat label="% complete" value={fmtPct(row.percentCompleted)} />
          <Stat label="Salary/TD" value={money(row.salaryAccordingToTdHours)} />
          <Stat label={`Total ${cur}`} value={money(row.totalLocal)} />
          <Stat label="Total USD" value={fmtCurrency(row.totalUsd)} />
        </div>

        <Field label="Starting date">
          <TextInput
            type="date"
            value={startingDate}
            onChange={(e) => setStartingDate(e.target.value)}
            disabled={!canEdit}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Last salary revision">
            <TextInput type="date" value={lastRev} onChange={(e) => setLastRev(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Next salary review">
            <TextInput type="date" value={nextRev} onChange={(e) => setNextRev(e.target.value)} disabled={!canEdit} />
          </Field>
        </div>

        <Field label={`Starting base salary (${cur})`}>
          <TextInput value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} disabled={!canEdit} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Increment (${cur})`}>
            <TextInput value={increment} onChange={(e) => setIncrement(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label={`Benefits (${cur})`}>
            <TextInput value={benefits} onChange={(e) => setBenefits(e.target.value)} disabled={!canEdit} />
          </Field>
        </div>
        <Field label={`Reimbursement (${cur})`}>
          <TextInput value={reimbursement} onChange={(e) => setReimbursement(e.target.value)} disabled={!canEdit} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Meeting credits (h)">
            <TextInput value={meetingCredits} onChange={(e) => setMeetingCredits(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Additional credits (h)">
            <TextInput
              value={additionalCredits}
              onChange={(e) => setAdditionalCredits(e.target.value)}
              disabled={!canEdit}
            />
          </Field>
        </div>
      </div>

      {canEdit && (
        <FormFooter>
          <GhostBtn onClick={onClose}>Close</GhostBtn>
          <PrimaryBtn
            disabled={saving}
            onClick={() =>
              onSave({
                employeeId: row.employeeId,
                startingDate: startingDate || null,
                lastSalaryRevisionDate: lastRev || null,
                nextSalaryReviewDate: nextRev || null,
                startingBaseSalaryLocal: num(baseSalary),
                incrementLocal: num(increment),
                benefitsLocal: num(benefits),
                reimbursementLocal: num(reimbursement),
                meetingCreditsHours: num(meetingCredits),
                additionalCreditsHours: num(additionalCredits),
              })
            }
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </PrimaryBtn>
        </FormFooter>
      )}
    </Drawer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium mt-0.5">{value}</div>
    </div>
  );
}
