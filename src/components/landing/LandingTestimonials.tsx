import { Link } from "@tanstack/react-router";
import { TestimonialsMasonryGrid } from "@/components/ui/testimonials-masonry";
import { LANDING_TESTIMONIALS } from "@/lib/landing-content";

export function LandingTestimonials() {
  return (
    <section id="voices" className="relative overflow-hidden border-y border-white/10 bg-neutral-950 py-16 md:py-24">
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black to-transparent" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-5 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-white">
            Loved by operators who live in the data
          </h2>
          <p className="mt-3 text-[14px] md:text-[15px] text-neutral-400">
            Here&apos;s what HR, finance, and eng leads say about Alyson.{" "}
            <Link to="/voices" className="text-white underline underline-offset-4 hover:opacity-80">
              Read all stories
            </Link>
          </p>
        </div>
        <div className="mt-12">
          <TestimonialsMasonryGrid items={LANDING_TESTIMONIALS} />
        </div>
      </div>
    </section>
  );
}
