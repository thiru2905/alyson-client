import { Drawer } from "@/components/Drawer";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Field, TextInput, Select, PrimaryBtn, GhostBtn, FormFooter } from "@/components/forms/FormField";

export function UploadDocumentDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("policy");
  const [visibility, setVisibility] = useState("private");
  const [tags, setTags] = useState("");
  const [fileUrl, setFileUrl] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("documents").insert({
        title,
        doc_type: docType,
        visibility,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        file_url: fileUrl || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Document added");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Drawer open={open} onClose={onClose} title="Upload document" eyebrow="Documents" width="md">
      <form
        className="flex flex-col h-full"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return toast.error("Title required");
          create.mutate();
        }}
      >
        <div className="p-5 space-y-4 flex-1">
          <Field label="Title">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="policy">Policy</option>
                <option value="contract">Contract</option>
                <option value="template">Template</option>
                <option value="handbook">Handbook</option>
                <option value="report">Report</option>
              </Select>
            </Field>
            <Field label="Visibility">
              <Select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                <option value="private">Private</option>
                <option value="org">Organization</option>
                <option value="public">Public</option>
              </Select>
            </Field>
          </div>
          <Field label="Tags" hint="Comma-separated.">
            <TextInput value={tags} onChange={(e) => setTags(e.target.value)} placeholder="hr, 2025, onboarding" />
          </Field>
          <Field label="File URL" hint="Link to the file. (Direct uploads coming next iteration.)">
            <TextInput value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…" />
          </Field>
        </div>
        <FormFooter>
          <GhostBtn type="button" onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn type="submit" disabled={create.isPending}>Add document</PrimaryBtn>
        </FormFooter>
      </form>
    </Drawer>
  );
}
