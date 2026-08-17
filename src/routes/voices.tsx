import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck } from "lucide-react";
import { LandingDocPage } from "@/components/landing/LandingDocPage";
import { LANDING_TESTIMONIALS } from "@/lib/landing-content";

export const Route = createFileRoute("/voices")({
  head: () => ({
    meta: [
      { title: "Voices | Alyson HR" },
      { name: "description", content: "What operators, HR leads, and executives say about Alyson HR." },
    ],
  }),
  component: VoicesPage,
});

function VoicesPage() {
  return (
    <LandingDocPage
      eyebrow="Resources"
      title="Voices"
      description="How teams use Alyson for time, meetings, payroll, and performance, in their own words."
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {LANDING_TESTIMONIALS.map((t) => (
          <blockquote key={t.handle} className="surface-card rounded-2xl p-5 md:p-6">
            <p className="text-[14px] leading-relaxed text-foreground/90">&ldquo;{t.quote}&rdquo;</p>
            <footer className="mt-4 flex items-center gap-3 border-t border-border pt-4">
              <div className="h-9 w-9 rounded-full bg-muted grid place-items-center text-[11px] font-medium text-foreground">
                {t.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[13px] font-medium text-foreground">
                  <span className="truncate">{t.name}</span>
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Verified" />
                </div>
                <div className="text-[12px] text-muted-foreground truncate">{t.title}</div>
              </div>
            </footer>
          </blockquote>
        ))}
      </div>
    </LandingDocPage>
  );
}
