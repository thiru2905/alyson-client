import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { LandingDocPage } from "@/components/landing/LandingDocPage";
import { MODULE_GUIDE } from "@/lib/landing-content";

const GROUPS = ["Workspace", "People", "Money", "Ops"] as const;

export const Route = createFileRoute("/modules")({
  head: () => ({
    meta: [
      { title: "Modules | Alyson HR" },
      { name: "description", content: "Complete guide to every Alyson HR module: workspace, people, money, and ops." },
    ],
  }),
  component: ModulesPage,
});

function ModulesPage() {
  return (
    <LandingDocPage
      eyebrow="Product"
      title="Module guide"
      description="Every screen in Alyson HR, grouped the same way you see it in the sidebar."
      wide
    >
      <div className="space-y-10">
        {GROUPS.map((group) => {
          const items = MODULE_GUIDE.filter((m) => m.group === group);
          return (
            <section key={group}>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-display text-xl font-semibold text-foreground">{group}</h2>
                <div className="h-px flex-1 bg-border" />
                <span className="text-[12px] text-muted-foreground tabular-nums">{items.length}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((mod) => (
                  <div key={mod.name} className="surface-card rounded-xl p-4">
                    <h3 className="text-[15px] font-medium text-foreground">{mod.name}</h3>
                    <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">{mod.summary}</p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <p className="mt-10 text-[14px] text-muted-foreground">
        Want the big picture? See <Link to="/features" className="text-foreground underline underline-offset-2">features</Link>{" "}
        or <Link to="/how-it-works" className="text-foreground underline underline-offset-2">how it works</Link>.
      </p>
    </LandingDocPage>
  );
}
