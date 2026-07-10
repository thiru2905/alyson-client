import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { LandingDocPage, LandingProse } from "@/components/landing/LandingDocPage";
import { CONTACT, LEGAL_LAST_UPDATED } from "@/lib/landing-content";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service | Alyson HR" },
      { name: "description", content: "Terms of service for using Alyson HR." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LandingDocPage eyebrow="Legal" title="Terms of Service" description={`Last updated ${LEGAL_LAST_UPDATED}.`}>
      <LandingProse>
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern access to Alyson HR and related services
          (&ldquo;Service&rdquo;) operated by Cintara / Alyson (&ldquo;we,&rdquo; &ldquo;us&rdquo;). By signing in
          or using the Service, you agree to these Terms.
        </p>
        <h2>1. Access & accounts</h2>
        <p>
          You must provide accurate registration information and keep credentials secure. Access is granted per your
          organization&apos;s invitation and role. You are responsible for activity under your account.
        </p>
        <h2>2. Acceptable use</h2>
        <ul>
          <li>Use the Service only for lawful HR, finance, and operations purposes.</li>
          <li>Do not attempt to bypass role-based permissions or export data you are not entitled to see.</li>
          <li>Do not reverse engineer, scrape, or disrupt the Service.</li>
        </ul>
        <h2>3. Customer data</h2>
        <p>
          Your organization retains ownership of data submitted to the Service. We process it to provide features
          described in the product and in our <Link to="/privacy">Privacy Policy</Link>.
        </p>
        <h2>4. AI-assisted features</h2>
        <p>
          Alyson Brain and automated drafts are aids, not legal or financial advice. Your organization is
          responsible for reviewing outputs before payroll, compliance, or personnel decisions.
        </p>
        <h2>5. Availability</h2>
        <p>
          We strive for high availability but do not guarantee uninterrupted access. Maintenance windows and
          third-party outages may affect specific modules.
        </p>
        <h2>6. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, the Service is provided &ldquo;as is.&rdquo; We are not liable for
          indirect or consequential damages arising from use of the Service.
        </p>
        <h2>7. Changes</h2>
        <p>
          We may update these Terms. Material changes will be posted on this page with an updated date. Continued use
          after changes constitutes acceptance.
        </p>
        <h2>Contact</h2>
        <p>
          Questions: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
        </p>
      </LandingProse>
    </LandingDocPage>
  );
}
