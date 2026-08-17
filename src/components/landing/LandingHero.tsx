import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { BackgroundBeams } from "@/components/aceternity/BackgroundBeams";
import { Spotlight } from "@/components/aceternity/Spotlight";
import { ContainerScroll } from "@/components/ui/container-scroll";
import { LandingCtaButton } from "@/components/ui/landing-cta-button";
import { LandingAgentPill } from "@/components/landing/LandingAgentPill";
import { LandingAppFrame } from "@/components/landing/LandingAppFrame";

export function LandingHero() {
  const sectionRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden border-b border-border landing-mesh"
    >
      <BackgroundBeams />
      <Spotlight containerRef={sectionRef} />

      <div className="relative mx-auto max-w-6xl px-5 md:px-8 pt-10 pb-6 md:pt-14 md:pb-10">
        <motion.div
          className="mx-auto max-w-3xl text-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="font-display text-4xl font-semibold tracking-tight leading-[1.1] md:text-5xl lg:text-[3.25rem] text-foreground">
            Your HR workspace,{" "}
            <span className="text-muted-foreground">always on the clock</span>
          </h1>
          <p className="mt-5 text-[14px] md:text-[15px] text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Time tracking, performance, payroll, and meeting intelligence. The same Alyson HR
            your team uses every day.
          </p>
          <LandingAgentPill />
          <div className="mt-8 flex justify-center">
            <LandingCtaButton>
              Open workspace
              <ArrowRight className="h-4 w-4" />
            </LandingCtaButton>
          </div>
        </motion.div>

        <motion.div
          className="mt-12 md:mt-14"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.65, delay: 0.1 }}
        >
          <ContainerScroll>
            <LandingAppFrame />
          </ContainerScroll>
        </motion.div>
      </div>
    </section>
  );
}
