import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { LandingDocPage, LandingProse } from "@/components/landing/LandingDocPage";
import { CONTACT, LEGAL_LAST_UPDATED } from "@/lib/landing-content";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | Alyson HR" },
      { name: "description", content: "How Alyson HR collects, uses, and protects your data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LandingDocPage eyebrow="Legal" title="Privacy Policy" description={`Last updated ${LEGAL_LAST_UPDATED}.`}>
      <LandingProse>
        <p>
          This Privacy Policy explains how Alyson HR (&ldquo;Alyson,&rdquo; &ldquo;we&rdquo;) handles personal
          information when you use our workspace, marketing site, and related services.
        </p>
        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Account data:</strong> name, email, and authentication identifiers from Clerk.
          </li>
          <li>
            <strong>Workspace data:</strong> HR, time, payroll, and meeting records your organization connects to
            Alyson.
          </li>
          <li>
            <strong>Usage data:</strong> logs, device type, and feature usage for security and product improvement.
          </li>
        </ul>
        <h2>How we use information</h2>
        <ul>
          <li>Provide and secure the Service, including RBAC enforcement.</li>
          <li>Generate reports, dashboards, and AI-assisted summaries requested by authorized users.</li>
          <li>Respond to support requests and legal obligations.</li>
        </ul>
        <h2>Sharing</h2>
        <p>
          We do not sell personal information. We use subprocessors (e.g. hosting, email, authentication) under
          contracts that require appropriate safeguards. Data may be disclosed if required by law.
        </p>
        <h2>Retention</h2>
        <p>
          We retain data while your organization&apos;s account is active and as needed for backups, audits, and legal
          requirements. Your admin may request deletion subject to contractual limits.
        </p>
        <h2>Security</h2>
        <p>
          We apply access controls, encryption in transit, and least-privilege practices. No system is perfectly
          secure. Report concerns to{" "}
          <a href={`mailto:${CONTACT.privacyEmail}`}>{CONTACT.privacyEmail}</a>.
        </p>
        <h2>Your rights</h2>
        <p>
          Depending on jurisdiction, you may request access, correction, or deletion of your personal data. Contact{" "}
          <a href={`mailto:${CONTACT.privacyEmail}`}>{CONTACT.privacyEmail}</a> or your employer as the data
          controller for employee records.
        </p>
        <h2>Cookies</h2>
        <p>
          See our <Link to="/cookies">Cookie Policy</Link> for details on site cookies and similar technologies.
        </p>
      </LandingProse>
    </LandingDocPage>
  );
}
