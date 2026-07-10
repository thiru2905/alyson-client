import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { LandingCompare } from "@/components/landing/LandingCompare";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { LandingFinalCta } from "@/components/landing/LandingFinalCta";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingHowItWorks } from "@/components/landing/LandingHowItWorks";
import { LandingLogoCloud } from "@/components/landing/LandingLogoCloud";
import { LandingNavbar } from "@/components/landing/LandingNavbar";

const LandingModuleSnapshots = lazy(() =>
  import("@/components/landing/LandingModuleSnapshots").then((m) => ({
    default: m.LandingModuleSnapshots,
  })),
);
const LandingTestimonials = lazy(() =>
  import("@/components/landing/LandingTestimonials").then((m) => ({
    default: m.LandingTestimonials,
  })),
);
const LandingFaq = lazy(() =>
  import("@/components/landing/LandingFaq").then((m) => ({ default: m.LandingFaq })),
);

function SectionFallback() {
  return <div className="h-32 animate-pulse bg-muted/20 border-y border-border" aria-hidden />;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Alyson HR | Agentic AI Workspace" },
      {
        name: "description",
        content:
          "Your AI HR agent for time tracking, performance, payroll, meeting intelligence, and automated workflows.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <LandingNavbar />
      <main>
        <LandingHero />
        <LandingLogoCloud />
        <LandingFeatures />
        <LandingHowItWorks />
        <LandingCompare />
        <Suspense fallback={<SectionFallback />}>
          <LandingModuleSnapshots />
        </Suspense>
        <Suspense fallback={<SectionFallback />}>
          <LandingTestimonials />
        </Suspense>
        <Suspense fallback={<SectionFallback />}>
          <LandingFaq />
        </Suspense>
        <LandingFinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
