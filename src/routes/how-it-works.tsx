import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { LandingDocPage, LandingProse } from "@/components/landing/LandingDocPage";
import { HOW_IT_WORKS_STEPS } from "@/lib/landing-content";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How it works | Alyson HR" },
      { name: "description", content: "Four steps to connect tools, analyze HR data, and automate reports in Alyson." },
    ],
  }),
  component: HowItWorksPage,
});

function HowItWorksPage() {
  return (
    <LandingDocPage
      eyebrow="Product"
      title="How Alyson works"
      description="From connected tools to automated reports, without ripping out the systems you already run on."
    >
      <ol className="space-y-4">
        {HOW_IT_WORKS_STEPS.map((step, i) => (
          <li key={step.title} className="surface-card rounded-xl p-5 md:p-6 flex gap-4">
            <div className="h-10 w-10 shrink-0 rounded-full border border-border bg-paper grid place-items-center font-mono text-[12px] text-muted-foreground">
              {String(i + 1).padStart(2, "0")}
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold text-foreground">{step.title}</h2>
              <p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <LandingProse className="mt-8">
        <h2>Roles & permissions</h2>
        <p>
          Every step respects RBAC. Managers see their teams; HR and finance see governed boards; employees see
          self-service views. Super-admins configure access to sensitive modules like payroll and Meeting Hours.
        </p>
        <p>
          Browse the <Link to="/modules">module guide</Link> or read <Link to="/faq">FAQ</Link> for access
          questions.
        </p>
      </LandingProse>
    </LandingDocPage>
  );
}
