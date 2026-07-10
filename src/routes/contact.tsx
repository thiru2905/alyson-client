import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Mail, MapPin, Clock } from "lucide-react";
import { LandingDocPage, LandingProse } from "@/components/landing/LandingDocPage";
import { CONTACT } from "@/lib/landing-content";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact | Alyson HR" },
      { name: "description", content: "Contact the Alyson HR team for demos, support, and partnerships." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <LandingDocPage
      eyebrow="Company"
      title="Contact us"
      description="Questions about Alyson, a module rollout, or enterprise access. We are happy to help."
    >
      <div className="grid gap-3 sm:grid-cols-3 mb-8">
        {[
          { icon: Mail, label: "Email", value: CONTACT.email, href: `mailto:${CONTACT.email}` },
          { icon: MapPin, label: "Office", value: CONTACT.address },
          { icon: Clock, label: "Hours", value: CONTACT.hours },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="surface-card rounded-xl p-4">
              <Icon className="h-4 w-4 text-muted-foreground mb-2" />
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</div>
              {"href" in item && item.href ? (
                <a href={item.href} className="text-[14px] font-medium text-foreground mt-1 block hover:underline">
                  {item.value}
                </a>
              ) : (
                <div className="text-[14px] font-medium text-foreground mt-1">{item.value}</div>
              )}
            </div>
          );
        })}
      </div>
      <LandingProse>
        <h2>What to include</h2>
        <ul>
          <li>
            <strong>Product demo:</strong> team size, tools you use today (calendar, time tracking, payroll).
          </li>
          <li>
            <strong>Support:</strong> workspace URL, module name, and steps to reproduce.
          </li>
          <li>
            <strong>Privacy:</strong> write to{" "}
            <a href={`mailto:${CONTACT.privacyEmail}`}>{CONTACT.privacyEmail}</a> for data requests.
          </li>
        </ul>
        <p>
          Ready to explore? <Link to="/auth">Sign in</Link> or read the <Link to="/faq">FAQ</Link>.
        </p>
      </LandingProse>
    </LandingDocPage>
  );
}
