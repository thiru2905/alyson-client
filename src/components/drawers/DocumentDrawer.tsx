import { Drawer } from "@/components/Drawer";
import { fmtDate } from "@/lib/format";
import { ExternalLink } from "lucide-react";
import { GhostBtn } from "@/components/forms/FormField";

type Doc = {
  id: string;
  title: string;
  doc_type: string;
  visibility: string;
  tags: string[];
  file_url: string | null;
  created_at: string;
  expires_at: string | null;
};

export function DocumentDrawer({ doc, onClose }: { doc: Doc | null; onClose: () => void }) {
  return (
    <Drawer open={!!doc} onClose={onClose} title={doc?.title ?? ""} eyebrow={doc ? `${doc.doc_type} · ${doc.visibility}` : undefined} width="md">
      {doc && (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Type" value={doc.doc_type} />
            <Stat label="Visibility" value={doc.visibility} />
            <Stat label="Added" value={fmtDate(doc.created_at)} />
            <Stat label="Expires" value={doc.expires_at ? fmtDate(doc.expires_at) : "—"} />
          </div>

          {doc.tags.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {doc.tags.map((t) => <span key={t} className="pill pill-neutral">{t}</span>)}
              </div>
            </div>
          )}

          {doc.file_url ? (
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
              <GhostBtn type="button" className="w-full">
                <ExternalLink className="h-3.5 w-3.5" />Open file
              </GhostBtn>
            </a>
          ) : (
            <div className="text-[12px] text-muted-foreground italic text-center py-4">No file attached.</div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium text-[13px] mt-0.5 capitalize">{value}</div>
    </div>
  );
}
