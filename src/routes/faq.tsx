import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { LandingAccordion } from "@/components/ui/landing-accordion";
import { LandingDocPage, LandingProse } from "@/components/landing/LandingDocPage";
import { LANDING_FAQ } from "@/lib/landing-content";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ | Alyson HR" },
      { name: "description", content: "Frequently asked questions about Alyson HR modules, access, and getting started." },
    ],
  }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <LandingDocPage eyebrow="Resources" title="Frequently asked questions" description="Quick answers about access, modules, and how Alyson fits your team.">
      <LandingAccordion items={LANDING_FAQ} />
      <LandingProse className="mt-8">
        <p>
          Still stuck? <Link to="/contact">Contact us</Link> or read the full{" "}
          <Link to="/modules">module guide</Link>.
        </p>
      </LandingProse>
    </LandingDocPage>
  );
}
