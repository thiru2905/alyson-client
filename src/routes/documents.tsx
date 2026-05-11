import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchDocuments } from "@/lib/queries-ext";
import { PageHeader, EmptyState } from "@/components/AppShell";
import { PageSkeleton } from "@/components/Skeleton";
import { FileText, Upload, Search } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { useState, useMemo } from "react";
import { UploadDocumentDrawer } from "@/components/drawers/UploadDocumentDrawer";
import { DocumentDrawer } from "@/components/drawers/DocumentDrawer";

export const Route = createFileRoute("/documents")({
  head: () => ({ meta: [{ title: "Documents — Alyson HR" }] }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["documents"], queryFn: fetchDocuments });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [picked, setPicked] = useState<any | null>(null);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string>("all");

  const rows = data ?? [];
  const allTags = useMemo(() => Array.from(new Set(rows.flatMap((d: any) => d.tags ?? []))).sort(), [rows]);

  if (isLoading) return <PageSkeleton />;

  const filtered = rows.filter((d: any) => {
    if (q && !d.title.toLowerCase().includes(q.toLowerCase())) return false;
    if (tag !== "all" && !d.tags?.includes(tag)) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Documents"
        description="Policies, contracts, and templates — version-tagged and searchable."
        actions={<button onClick={() => setUploadOpen(true)} className="h-8 px-3 rounded-md bg-foreground text-background text-xs flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" />Upload</button>}
      />
      <div className="px-5 md:px-8 py-6 md:py-7 space-y-5">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents…" className="w-full h-8 pl-8 pr-3 rounded-md border border-border bg-background text-[13px]" />
          </div>
          <select value={tag} onChange={(e) => setTag(e.target.value)} className="h-8 px-2 rounded-md border border-border bg-background text-[13px]">
            <option value="all">All tags</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="sm:ml-auto text-xs text-muted-foreground self-center">{filtered.length} of {rows.length}</div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={rows.length === 0 ? "No documents yet" : "No matches"}
            description="Upload your first policy, template, or contract to get started."
            action={rows.length === 0 ? <button onClick={() => setUploadOpen(true)} className="h-8 px-3 rounded-md bg-foreground text-background text-xs flex items-center gap-1.5 mx-auto"><Upload className="h-3.5 w-3.5" />Upload</button> : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((d) => (
              <button key={d.id} onClick={() => setPicked(d)} className="surface-card p-5 hover:shadow-lg transition-shadow text-left">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent text-accent-foreground grid place-items-center shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[14px]">{d.title}</div>
                    <div className="text-[11px] text-muted-foreground uppercase mt-0.5">{d.doc_type} · {d.visibility}</div>
                  </div>
                </div>
                {d.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {d.tags.map((t: string) => <span key={t} className="pill pill-neutral">{t}</span>)}
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-border text-[11px] text-muted-foreground flex justify-between">
                  <span>Added</span><span>{fmtDate(d.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <UploadDocumentDrawer open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <DocumentDrawer doc={picked} onClose={() => setPicked(null)} />
    </div>
  );
}
