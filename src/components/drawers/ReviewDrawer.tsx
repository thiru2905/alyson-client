import { Drawer } from "@/components/Drawer";
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Field, TextInput, TextArea, Select, PrimaryBtn, GhostBtn, FormFooter } from "@/components/forms/FormField";

type Review = {
  id: string;
  rating: number;
  multiplier: number;
  comments: string | null;
  status: string;
  promotion_ready: boolean;
  bonus_recommendation: number | null;
  employees?: { full_name?: string; role?: string } | null;
  review_cycles?: { name?: string } | null;
};

export function ReviewDrawer({ review, onClose }: { review: Review | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState("3");
  const [multiplier, setMultiplier] = useState("1");
  const [comments, setComments] = useState("");
  const [status, setStatus] = useState("draft");
  const [promo, setPromo] = useState(false);
  const [bonusRec, setBonusRec] = useState("");

  useEffect(() => {
    if (review) {
      setRating(String(review.rating));
      setMultiplier(String(review.multiplier));
      setComments(review.comments ?? "");
      setStatus(review.status);
      setPromo(review.promotion_ready);
      setBonusRec(review.bonus_recommendation ? String(review.bonus_recommendation) : "");
    }
  }, [review]);

  const save = useMutation({
    mutationFn: async (next: string) => {
      const { error } = await supabase
        .from("reviews")
        .update({
          rating: Number(rating),
          multiplier: Number(multiplier),
          comments: comments || null,
          status: next,
          promotion_ready: promo,
          bonus_recommendation: bonusRec ? Number(bonusRec) : null,
        })
        .eq("id", review!.id);
      if (error) throw error;
    },
    onSuccess: (_, next) => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      toast.success(next === "submitted" ? "Review submitted" : next === "calibrated" ? "Calibrated" : "Saved");
      if (next !== "draft") onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Drawer open={!!review} onClose={onClose} title={review?.employees?.full_name ?? ""} eyebrow={`Review · ${review?.review_cycles?.name ?? ""}`} width="lg">
      {review && (
        <form
          className="flex flex-col h-full"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate("submitted");
          }}
        >
          <div className="p-5 space-y-4 flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rating (1-5)">
                <TextInput type="number" min="1" max="5" step="0.1" value={rating} onChange={(e) => setRating(e.target.value)} />
              </Field>
              <Field label="Multiplier">
                <TextInput type="number" step="0.05" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} />
              </Field>
            </div>
            <Field label="Bonus recommendation ($)">
              <TextInput type="number" value={bonusRec} onChange={(e) => setBonusRec(e.target.value)} />
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="calibrated">Calibrated</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={promo} onChange={(e) => setPromo(e.target.checked)} />
              Promotion ready
            </label>
            <Field label="Comments">
              <TextArea rows={5} value={comments} onChange={(e) => setComments(e.target.value)} />
            </Field>
          </div>
          <FormFooter>
            <GhostBtn type="button" onClick={() => save.mutate("draft")} disabled={save.isPending}>Save draft</GhostBtn>
            <GhostBtn type="button" onClick={() => save.mutate("calibrated")} disabled={save.isPending}>Calibrate</GhostBtn>
            <PrimaryBtn type="submit" disabled={save.isPending}>Submit</PrimaryBtn>
          </FormFooter>
        </form>
      )}
    </Drawer>
  );
}
