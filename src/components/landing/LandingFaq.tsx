import { LandingAccordion } from "@/components/ui/landing-accordion";
import { LANDING_FAQ } from "@/lib/landing-content";
import { Link } from "@tanstack/react-router";

export function LandingFaq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 md:px-8 py-16 md:py-20">
      <div className="text-center mb-8">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
          FAQ
        </div>
        <h2 className="font-display text-3xl font-semibold tracking-tight mt-1.5">Quick answers</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          <Link to="/faq" className="text-foreground underline underline-offset-2 hover:opacity-80">
            View all questions
          </Link>
        </p>
      </div>
      <LandingAccordion items={LANDING_FAQ.slice(0, 4)} />
    </section>
  );
}
