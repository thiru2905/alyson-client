import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { BackgroundBeams } from "@/components/aceternity/BackgroundBeams";
import { Spotlight } from "@/components/aceternity/Spotlight";
import { AlysonLogo } from "@/components/AlysonLogo";
import { LandingCtaButton } from "@/components/ui/landing-cta-button";

export function LandingFinalCta() {
  const sectionRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden border-t border-border landing-mesh"
    >
      <BackgroundBeams />
      <Spotlight containerRef={sectionRef} />
      <div className="relative mx-auto max-w-3xl px-5 py-16 md:py-20 text-center md:px-8">
        <AlysonLogo size={40} showWordmark={false} className="justify-center" />
        <h2 className="font-display mt-4 text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
          Open your Alyson workspace
        </h2>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Clerk sign-in · explore every module
        </p>
        <div className="mt-8 flex justify-center">
          <LandingCtaButton>
            Open app
            <ArrowRight className="h-4 w-4" />
          </LandingCtaButton>
        </div>
      </div>
    </section>
  );
}
