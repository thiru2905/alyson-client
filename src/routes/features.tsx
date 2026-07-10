import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  Calendar,
  Clock,
  GitBranch,
  Plug,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { LandingDocPage, LandingProse } from "@/components/landing/LandingDocPage";
import { FEATURE_GUIDE } from "@/lib/landing-content";

const ICONS: Record<string, LucideIcon> = {
  "Time tracking": Clock,
  Performance: TrendingUp,
  Analytics: BarChart3,
  "Workflow automation": GitBranch,
  Integrations: Plug,
  "Meeting intelligence": Calendar,
};

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features | Alyson HR" },
      {
        name: "description",
        content: "Time tracking, performance, payroll, meeting intelligence, and workflow automation in Alyson HR.",
      },
    ],
  }),
  component: FeaturesPage,
});

function FeaturesPage() {
  return (
    <LandingDocPage
      eyebrow="Product"
      title="Features"
      description="HR operations built into one workspace: the same modules your team uses every day, with shared permissions and design."
      wide
    >
      <div className="grid gap-4 md:grid-cols-2">
        {FEATURE_GUIDE.map((f) => {
          const Icon = ICONS[f.title] ?? Clock;
          return (
            <div key={f.title} className="surface-card rounded-xl p-5 md:p-6">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 shrink-0 rounded-xl border border-border bg-muted/30 grid place-items-center">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-semibold text-foreground">{f.title}</h2>
                  <p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">{f.body}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <LandingProse className="mt-10">
        <p>
          See every module in detail on the <Link to="/modules">modules guide</Link>, or learn{" "}
          <Link to="/how-it-works">how Alyson connects your stack</Link>.
        </p>
      </LandingProse>
    </LandingDocPage>
  );
}
