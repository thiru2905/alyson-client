import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { LandingDocPage, LandingProse } from "@/components/landing/LandingDocPage";
import { CONTACT } from "@/lib/landing-content";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About | Alyson HR" },
      { name: "description", content: "Learn about Alyson HR, the workspace for people, pay, time, and meetings." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <LandingDocPage
      eyebrow="Company"
      title="About Alyson HR"
      description="Alyson is the operating system for modern HR and finance teams: one calm workspace instead of scattered spreadsheets and portals."
    >
      <LandingProse>
        <p>
          Alyson HR brings time tracking, performance, payroll, equity, leave, and meeting intelligence into a
          single product. Operators get executive-grade dashboards; managers get scoped views of their teams;
          employees get clarity on their own records.
        </p>
        <h2>What we believe</h2>
        <ul>
          <li>HR data should be readable, not buried in exports.</li>
          <li>Permissions should match how your org actually works.</li>
          <li>AI should cite sources, not guess from a blank chat window.</li>
          <li>The UI should feel as considered as a finance board deck.</li>
        </ul>
        <h2>Where we are</h2>
        <p>
          We are based in {CONTACT.address}, building for distributed teams that run on Google Workspace, Time
          Doctor, and modern payroll stacks.
        </p>
        <h2>Explore the product</h2>
        <p>
          Browse <Link to="/features">features</Link>, the full <Link to="/modules">module guide</Link>, or{" "}
          <Link to="/how-it-works">how it works</Link> to see how Alyson fits your workflow.
        </p>
      </LandingProse>
    </LandingDocPage>
  );
}
