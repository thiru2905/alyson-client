import { useEffect, useMemo, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Loader2, Trash2, Users } from "lucide-react";
import { Field, FormFooter, GhostBtn, PrimaryBtn, TextArea, TextInput } from "@/components/forms/FormField";
import type { EmployeeLeaveLedger, LeaveType, TeamLeaveEvent } from "@/lib/leave-schema";
import {
  formatTeamLeaveLabel,
  LEAVE_TYPE_OPTIONS,
  leaveDaysInclusive,
  leaveTypeLabel,
  matchesTeamLocation,
  normLeaveFacet,
  TEAM_LEAVE_ALL_TEAMS,
} from "@/lib/leave-schema";
import { PACING_LEAVE_HOURS_PER_DAY } from "@/lib/weekly-pacing";
import { fmtDate } from "@/lib/format";

type Props = {
  ledgers: EmployeeLeaveLedger[];
  teamLeaves: TeamLeaveEvent[];
  canEdit: boolean;
  saving?: boolean;
  onRecord: (payload: {
    location: string;
    team: string;
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    note?: string;
  }) => void;
  onVoid?: (eventId: string) => void;
};

export function LeaveTeamLeavePanel({
  ledgers,
  teamLeaves,
  canEdit,
  saving,
  onRecord,
  onVoid,
}: Props) {
  const activeLedgers = useMemo(() => ledgers.filter((l) => l.active), [ledgers]);

  const locations = useMemo(() => {
    const set = new Set<string>();
    for (const l of activeLedgers) {
      set.add(normLeaveFacet(l.location, "Unknown"));
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [activeLedgers]);

  const [location, setLocation] = useState("");
  const [team, setTeam] = useState(TEAM_LEAVE_ALL_TEAMS);
  const [leaveType, setLeaveType] = useState<LeaveType>("annual");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [voidTarget, setVoidTarget] = useState<TeamLeaveEvent | null>(null);

  useEffect(() => {
    if (!location && locations.length) setLocation(locations[0]!);
  }, [location, locations]);

  const teamsForLocation = useMemo(() => {
    if (!location) return [];
    const set = new Set<string>();
    for (const l of activeLedgers) {
      if (normLeaveFacet(l.location, "Unknown") === location) {
        set.add(normLeaveFacet(l.team, "Unassigned"));
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [activeLedgers, location]);

  const affectedCount = useMemo(() => {
    if (!location || !team) return 0;
    return activeLedgers.filter((l) => matchesTeamLocation(l.location, l.team, location, team))
      .length;
  }, [activeLedgers, location, team]);

  const previewDays = useMemo(
    () => (startDate && endDate ? leaveDaysInclusive(startDate, endDate) : 0),
    [startDate, endDate],
  );

  const canSubmit =
    canEdit &&
    !saving &&
    location &&
    team &&
    affectedCount > 0 &&
    endDate >= startDate &&
    previewDays > 0;

  const sortedTeamLeaves = useMemo(
    () =>
      [...teamLeaves].sort(
        (a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt.localeCompare(a.createdAt),
      ),
    [teamLeaves],
  );

  return (
    <div className="surface-card p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 grid place-items-center shrink-0">
          <Users className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="font-medium text-[13px]">Team leave by location</div>
          <p className="text-[12px] text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            Record leave once for a <strong>location</strong> — pick a specific team or <strong>All teams</strong> to
            cover everyone there. Weekly Pacing credits <strong>+{PACING_LEAVE_HOURS_PER_DAY}h per workday</strong> per
            affected employee (no per-person entry needed).
          </p>
        </div>
      </div>

      {canEdit ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-border">
          <Field label="Location">
            <select
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setTeam(TEAM_LEAVE_ALL_TEAMS);
              }}
              className="w-full h-9 px-2.5 rounded-md border border-border bg-background text-[13px]"
            >
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Team">
            <select
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              disabled={!location}
              className="w-full h-9 px-2.5 rounded-md border border-border bg-background text-[13px] disabled:opacity-50"
            >
              <option value={TEAM_LEAVE_ALL_TEAMS}>All teams</option>
              {teamsForLocation.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveType)}
              className="w-full h-9 px-2.5 rounded-md border border-border bg-background text-[13px]"
            >
              {LEAVE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Affected employees">
            <div className="h-9 px-2.5 rounded-md border border-border bg-muted/40 text-[13px] flex items-center font-medium tabular-nums">
              {affectedCount}
            </div>
          </Field>
          <Field label="Start date">
            <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date">
            <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field
            label="Workdays"
            hint={previewDays > 0 ? `+${previewDays * PACING_LEAVE_HOURS_PER_DAY}h pacing credit per person` : undefined}
          >
            <div className="h-9 px-2.5 rounded-md border border-border bg-muted/40 text-[13px] flex items-center font-mono tabular-nums">
              {previewDays > 0 ? `${previewDays}d` : "—"}
            </div>
          </Field>
          <Field label="Note (optional)">
            <TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Public holiday — entire team off"
            />
          </Field>
        </div>
      ) : null}

      {canEdit ? (
        <FormFooter>
          <PrimaryBtn
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onRecord({
                location,
                team,
                leaveType,
                startDate,
                endDate,
                note: note.trim() || undefined,
              })
            }
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Record team leave
          </PrimaryBtn>
        </FormFooter>
      ) : null}

      {sortedTeamLeaves.length > 0 ? (
        <div className="border-t border-border pt-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Recent team leave
          </div>
          <div className="space-y-2">
            {sortedTeamLeaves.slice(0, 8).map((ev) => (
              <div
                key={ev.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-md border border-border px-3 py-2 text-[12px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {formatTeamLeaveLabel(ev.team)} · {ev.location}
                  </div>
                  <div className="text-muted-foreground">
                    {leaveTypeLabel(ev.leaveType)} · {fmtDate(ev.startDate)} – {fmtDate(ev.endDate)} · {ev.days} workday
                    {ev.days === 1 ? "" : "s"} (+{ev.days * PACING_LEAVE_HOURS_PER_DAY}h/person)
                  </div>
                  {ev.note ? <div className="text-muted-foreground mt-0.5">{ev.note}</div> : null}
                </div>
                {canEdit && onVoid ? (
                  <button
                    type="button"
                    onClick={() => setVoidTarget(ev)}
                    className="h-7 px-2 rounded border border-border text-[11px] text-destructive hover:bg-destructive/5 flex items-center gap-1 shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <AlertDialog.Root open={!!voidTarget} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-5 shadow-lg">
            <AlertDialog.Title className="font-medium text-[15px]">Remove team leave?</AlertDialog.Title>
            <AlertDialog.Description className="text-[13px] text-muted-foreground mt-2">
              This removes pacing credit for {voidTarget ? formatTeamLeaveLabel(voidTarget.team) : ""} @{" "}
              {voidTarget?.location} (
              {voidTarget ? fmtDate(voidTarget.startDate) : ""} – {voidTarget ? fmtDate(voidTarget.endDate) : ""}).
              Individual employee leave records are not affected.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2 mt-5">
              <AlertDialog.Cancel asChild>
                <GhostBtn type="button">Cancel</GhostBtn>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <PrimaryBtn
                  type="button"
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    if (voidTarget) onVoid?.(voidTarget.id);
                    setVoidTarget(null);
                  }}
                >
                  Remove
                </PrimaryBtn>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
