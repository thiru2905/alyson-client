import { Link } from "@tanstack/react-router";
import {
  TestimonialsMarqueeGrid,
} from "@/components/ui/testimonials-marquee-grid";
import { LANDING_TESTIMONIALS } from "@/lib/landing-content";

const ROW_A = LANDING_TESTIMONIALS.slice(0, 4);
const ROW_B = LANDING_TESTIMONIALS.slice(4);

export function LandingTestimonials() {
  return (
    <section id="voices" className="border-y border-border py-14 md:py-18 overflow-hidden bg-background">
      <div className="mx-auto max-w-6xl px-5 md:px-8 mb-8">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
          Voices
        </div>
        <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mt-1.5">
          What teams are saying
        </h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          <Link to="/voices" className="text-foreground underline underline-offset-2 hover:opacity-80">
            Read all stories
          </Link>
        </p>
      </div>
      <TestimonialsMarqueeGrid rowA={ROW_A} rowB={ROW_B} />
    </section>
  );
}
