import { motion } from "framer-motion";
import { BarChart3, Brain, Link2, Zap } from "lucide-react";

const STEPS = [
  {
    icon: Link2,
    title: "Connect your tools",
    body: "Calendar, Time Doctor, roster, and payroll boards sync into one workspace.",
  },
  {
    icon: Brain,
    title: "Alyson tracks & analyzes",
    body: "Pacing, meetings, and comp data stay linked to the people and teams they belong to.",
  },
  {
    icon: BarChart3,
    title: "Real-time insights",
    body: "Dashboards and module copilots surface what changed, by team or person.",
  },
  {
    icon: Zap,
    title: "Reports auto-generate",
    body: "Meeting Hours emails, review drafts, and workflow approvals, all RBAC gated.",
  },
] as const;

export function LandingHowItWorks() {
  return (
    <section id="how" className="border-y border-border bg-muted/15">
      <div className="mx-auto max-w-6xl px-5 md:px-8 py-16 md:py-20">
        <div className="max-w-xl mb-10">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            How it works
          </div>
          <h2 className="font-display text-3xl font-semibold tracking-tight mt-1.5">Four steps to one HR workspace</h2>
        </div>

        <div className="relative">
          <div
            className="absolute left-5 top-2 bottom-2 w-px bg-border hidden md:block"
            aria-hidden
          />
          <ol className="space-y-6">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.li
                  key={step.title}
                  className="relative flex gap-4 md:gap-6"
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: i * 0.06, duration: 0.4 }}
                >
                  <div className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-paper text-foreground shadow-[var(--shadow-soft)]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="surface-card flex-1 rounded-xl p-4 md:p-5">
                    <div className="text-[11px] font-mono text-muted-foreground">0{i + 1}</div>
                    <h3 className="font-display text-lg font-semibold mt-1">{step.title}</h3>
                    <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">{step.body}</p>
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
