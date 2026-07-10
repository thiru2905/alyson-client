import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { LandingDocPage, LandingProse } from "@/components/landing/LandingDocPage";
import { CONTACT, LEGAL_LAST_UPDATED } from "@/lib/landing-content";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie Policy | Alyson HR" },
      { name: "description", content: "How Alyson HR uses cookies and similar technologies." },
    ],
  }),
  component: CookiesPage,
});

function CookiesPage() {
  return (
    <LandingDocPage eyebrow="Legal" title="Cookie Policy" description={`Last updated ${LEGAL_LAST_UPDATED}.`}>
      <LandingProse>
        <p>
          This Cookie Policy describes how Alyson HR uses cookies and similar technologies on our marketing site
          and authenticated workspace.
        </p>
        <h2>What are cookies?</h2>
        <p>
          Cookies are small text files stored on your device. They help sites remember preferences, keep you signed
          in, and understand how features are used.
        </p>
        <h2>Cookies we use</h2>
        <ul>
          <li>
            <strong>Essential:</strong> authentication (Clerk), session security, and load balancing. Required for
            the app to function.
          </li>
          <li>
            <strong>Preferences:</strong> theme (light/dark) and UI settings such as sidebar width.
          </li>
          <li>
            <strong>Analytics:</strong> optional usage metrics to improve performance and reliability. We minimize
            identifiable data in analytics.
          </li>
        </ul>
        <h2>Third parties</h2>
        <p>
          Authentication and hosting providers may set their own cookies when you sign in or load the Service. Refer
          to their policies for details.
        </p>
        <h2>Managing cookies</h2>
        <p>
          You can block or delete cookies in your browser settings. Blocking essential cookies may prevent sign-in or
          break workspace features.
        </p>
        <h2>More information</h2>
        <p>
          See our <Link to="/privacy">Privacy Policy</Link> or email{" "}
          <a href={`mailto:${CONTACT.privacyEmail}`}>{CONTACT.privacyEmail}</a>.
        </p>
      </LandingProse>
    </LandingDocPage>
  );
}
