import { motion } from "framer-motion";
import {
  BarChart3,
  Calendar,
  Clock,
  GitBranch,
  Plug,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { GlowingCard } from "@/components/ui/glowing-card";

const FEATURES: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
}> = [
  {
    icon: Clock,
    title: "Time tracking",
    description: "Time Doctor pacing, hourly activity, and manager-scoped dashboards.",
    className: "md:col-span-2",
  },
  {
    icon: TrendingUp,
    title: "Performance",
    description: "Reviews, goals, and scoring with agent-drafted summaries.",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description: "Real-time team insights across people, pay, and meetings.",
    className: "md:col-span-2",
  },
  {
    icon: GitBranch,
    title: "Workflow automation",
    description: "Approvals, onboarding, leave, and reminders, routed by role.",
  },
  {
    icon: Plug,
    title: "Integrations",
    description: "Calendar, workspace, payroll tools, and SES email reports.",
    className: "md:col-span-2 lg:col-span-1",
  },
  {
    icon: Calendar,
    title: "Meeting intelligence",
    description: "Notetaker transcripts, Meeting Hours, and calendar analytics.",
    className: "lg:col-span-2",
  },
];

export function LandingFeatures() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 md:px-8 py-16 md:py-20">
      <motion.div
        className="max-w-2xl"
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.45 }}
      >
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
          Capabilities
        </div>
        <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1.5">
          HR operations, built into Alyson
        </h2>
      </motion.div>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <motion.div
              key={f.title}
              className={f.className}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
            >
              <GlowingCard innerClassName="p-5 md:p-6 h-full">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-semibold tracking-tight">{f.title}</h3>
                    <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">{f.description}</p>
                  </div>
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-muted/40 text-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
              </GlowingCard>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
