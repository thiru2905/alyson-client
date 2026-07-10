import { motion } from "framer-motion";
import { AlysonLogo } from "@/components/AlysonLogo";

export function LandingAgentPill() {
  return (
    <motion.div
      className="flex justify-center mb-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.08 }}
    >
      <div className="inline-flex items-center gap-2.5 rounded-full border border-border bg-paper/85 px-3 py-1.5 shadow-[var(--shadow-soft)] backdrop-blur-sm">
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500/35 landing-agent-dot" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <AlysonLogo size={16} showWordmark={false} />
        <span className="text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">Alyson HR</span>
          <span className="mx-1.5 text-border">·</span>
          agent workspace
        </span>
      </div>
    </motion.div>
  );
}
