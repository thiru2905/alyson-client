import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { LandingDocPage, LandingProse } from "@/components/landing/LandingDocPage";
import { CAREERS_OPENINGS, CONTACT } from "@/lib/landing-content";

export const Route = createFileRoute("/careers")({
  head: () => ({
    meta: [
      { title: "Careers | Alyson HR" },
      { name: "description", content: "Join the team building Alyson HR: engineering, design, and HR operations roles." },
    ],
  }),
  component: CareersPage,
});

function CareersPage() {
  return (
    <LandingDocPage
      eyebrow="Company"
      title="Careers at Alyson"
      description="We are a small team obsessed with calm tooling for operators. If you like shipping real product with real data, we would like to hear from you."
    >
      <LandingProse>
        <h2>How we work</h2>
        <p>
          Hybrid from {CONTACT.address}, async-friendly, and module-oriented. You will own surfaces end to end,
          from schema to UI. We dogfood Alyson for our own people ops.
        </p>
        <h2>Open roles</h2>
        <div className="space-y-3 not-prose">
          {CAREERS_OPENINGS.map((role) => (
            <div key={role.title} className="surface-card rounded-xl p-4 md:p-5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{role.team}</div>
              <h3 className="font-display text-lg font-semibold text-foreground mt-1">{role.title}</h3>
              <p className="text-[13px] text-muted-foreground mt-1">{role.location}</p>
              <p className="text-[14px] text-muted-foreground mt-2 leading-relaxed">{role.blurb}</p>
            </div>
          ))}
        </div>
        <h2>Apply</h2>
        <p>
          Send your resume and a short note on what you would like to build to{" "}
          <a href={`mailto:${CONTACT.careersEmail}`}>{CONTACT.careersEmail}</a>. We reply to every application.
        </p>
        <p>
          Not sure which role fits? Read <Link to="/about">about us</Link> or <Link to="/contact">get in touch</Link>.
        </p>
      </LandingProse>
    </LandingDocPage>
  );
}
