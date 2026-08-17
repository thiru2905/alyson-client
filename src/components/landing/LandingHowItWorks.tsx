import { motion } from "framer-motion";
import { BarChart3, Brain, Link2, Zap } from "lucide-react";
import { BentoCard, BentoGrid } from "@/components/aceternity/BentoGrid";

const STEPS = [
  {
    icon: Link2,
    eyebrow: "01",
    title: "Connect your tools",
    body: "Calendar, Time Doctor, roster, and payroll boards sync into one workspace.",
  },
  {
    icon: Brain,
    eyebrow: "02",
    title: "Alyson tracks & analyzes",
    body: "Pacing, meetings, and comp data stay linked to the people and teams they belong to.",
  },
  {
    icon: BarChart3,
    eyebrow: "03",
    title: "Real-time insights",
    body: "Dashboards and module copilots surface what changed, by team or person.",
  },
  {
    icon: Zap,
    eyebrow: "04",
    title: "Reports auto-generate",
    body: "Meeting Hours emails, review drafts, and workflow approvals, all RBAC gated.",
  },
] as const;

export function LandingHowItWorks() {
  return (
    <section id="how" className="border-y border-border bg-muted/15">
      <div className="mx-auto max-w-6xl px-5 md:px-8 py-16 md:py-20">
        <motion.div
          className="mx-auto max-w-2xl text-center mb-12"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
        >
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            How it works
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1.5">
            Four steps to one HR workspace
          </h2>
        </motion.div>

        <BentoGrid className="grid-cols-1 md:grid-cols-2">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
              >
                <BentoCard
                  eyebrow={step.eyebrow}
                  title={step.title}
                  description={step.body}
                  icon={<Icon className="h-4 w-4" />}
                />
              </motion.div>
            );
          })}
        </BentoGrid>
      </div>
    </section>
  );
}
