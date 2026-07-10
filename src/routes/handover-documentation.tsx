import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Link2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { EmptyState, PageHeader, TableScroll } from "@/components/AppShell";
import { downloadCSV } from "@/lib/csv";
import {
  deleteHandoverDoc,
  getHandoverDocs,
  upsertHandoverDoc,
} from "@/lib/handover-docs-functions";

export const Route = createFileRoute("/handover-documentation")({
  head: () => ({ meta: [{ title: "Handover Documentation — Alyson HR" }] }),
  component: HandoverDocumentationPage,
});

function HandoverDocumentationPage() {
  const qc = useQueryClient();
  const [employeeName, setEmployeeName] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState("");
  const [deleteCode, setDeleteCode] = useState("");

  const q = useQuery({
    queryKey: ["handover-documentation"],
    queryFn: () => getHandoverDocs(),
  });

  const upsertM = useMutation({
    mutationFn: async () =>
      upsertHandoverDoc({
        data: {
          employeeName: employeeName.trim(),
          docUrl: docUrl.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Handover documentation saved");
      setEmployeeName("");
      setDocUrl("");
      void qc.invalidateQueries({ queryKey: ["handover-documentation"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  const deleteM = useMutation({
    mutationFn: async () => deleteHandoverDoc({ data: { id: deleteId! } }),
    onSuccess: () => {
      toast.success("Entry deleted");
      setDeleteOpen(false);
      setDeleteId(null);
      setDeleteName("");
      setDeleteCode("");
      void qc.invalidateQueries({ queryKey: ["handover-documentation"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const rows = q.data?.rows ?? [];

  const exportCsv = () => {
    if (!rows.length) {
      toast.error("No entries to export");
      return;
    }
    downloadCSV(
      `handover-documentation-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r) => ({
        employee_name: r.employeeName,
        documentation_link: r.docUrl,
      })),
      ["employee_name", "documentation_link"],
    );
    toast.success("Handover documentation exported");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeName.trim()) return toast.error("Employee name is required");
    if (!docUrl.trim()) return toast.error("Documentation link is required");
    upsertM.mutate();
  };

  const canDelete = deleteCode.trim().toUpperCase() === "DELETE";

  return (
    <div className="ops-dense">
      <PageHeader
        eyebrow="Operations"
        title="Handover Documentation"
        description="Simple mapping of employee name to documentation link. Stored in S3."
      />

      <div className="app-page-gutter py-6 space-y-5">
        <form onSubmit={submit} className="surface-card p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <label className="space-y-1 md:col-span-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Employee name</span>
            <input
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              placeholder="John Doe"
              className="w-full h-8 px-2 rounded-md border border-border bg-background text-sm"
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Documentation link</span>
            <input
              value={docUrl}
              onChange={(e) => setDocUrl(e.target.value)}
              placeholder="https://..."
              className="w-full h-8 px-2 rounded-md border border-border bg-background text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={upsertM.isPending}
            className="h-8 px-3 rounded-md bg-foreground text-background text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {upsertM.isPending ? "Saving..." : "Save"}
          </button>
        </form>

        {q.isError && (
          <div className="surface-card p-4 text-sm text-destructive">
            {q.error instanceof Error ? q.error.message : "Failed to load handover documentation"}
          </div>
        )}

        {!q.isLoading && rows.length === 0 ? (
          <EmptyState
            icon={Link2}
            title="No handover documentation yet"
            description="Add employee name and documentation link above."
          />
        ) : (
          <div className="surface-card p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">
                Entries ({rows.length})
              </div>
              <button
                type="button"
                onClick={exportCsv}
                className="h-7 px-2.5 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            </div>
            <TableScroll>
              <table className="ops-table w-full">
                <thead>
                  <tr>
                    <th align="left">Employee</th>
                    <th align="left">Documentation Link</th>
                    <th align="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/40">
                      <td>{r.employeeName}</td>
                      <td className="max-w-[560px]">
                        <a
                          href={r.docUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={r.docUrl}
                          className="text-primary hover:underline inline-flex items-center gap-1.5"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          View documentation
                        </a>
                      </td>
                      <td align="right">
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteId(r.id);
                            setDeleteName(r.employeeName);
                            setDeleteCode("");
                            setDeleteOpen(true);
                          }}
                          disabled={deleteM.isPending}
                          className="h-7 px-2.5 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>
        )}
      </div>

      <AlertDialog.Root open={deleteOpen} onOpenChange={(open) => !open && setDeleteOpen(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/40 z-[70]" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[92vw] max-w-md surface-card p-4">
            <AlertDialog.Title className="font-medium text-[14px]">Delete handover row?</AlertDialog.Title>
            <AlertDialog.Description className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
              This will permanently remove the row for{" "}
              <span className="font-medium text-foreground">{deleteName || "this employee"}</span>.
            </AlertDialog.Description>
            <div className="mt-3">
              <label className="text-[11px] text-muted-foreground">
                Type <span className="font-mono text-foreground">DELETE</span> to confirm
              </label>
              <input
                value={deleteCode}
                onChange={(e) => setDeleteCode(e.target.value)}
                className="mt-1 w-full h-8 px-2 rounded-md border border-border bg-background text-sm"
                placeholder="DELETE"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  className="h-8 px-3 rounded-md border border-border text-xs hover:bg-muted"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteCode("");
                  }}
                >
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  disabled={!canDelete || deleteM.isPending}
                  onClick={() => deleteM.mutate()}
                  className="h-8 px-3 rounded-md bg-destructive text-destructive-foreground text-xs font-medium disabled:opacity-50"
                >
                  {deleteM.isPending ? "Deleting..." : "Delete row"}
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
