import { Link } from "@tanstack/react-router";
import { AlysonLogo } from "@/components/AlysonLogo";

type FooterLink = { label: string } & ({ to: string } | { href: string });

const COLS: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: "Product",
    links: [
      { label: "Features", to: "/features" },
      { label: "Modules", to: "/modules" },
      { label: "How it works", to: "/how-it-works" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Careers", to: "/careers" },
      { label: "Contact", to: "/contact" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "FAQ", to: "/faq" },
      { label: "Voices", to: "/voices" },
      { label: "Sign in", to: "/auth" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", to: "/terms" },
      { label: "Privacy", to: "/privacy" },
      { label: "Cookies", to: "/cookies" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-muted/15">
      <div className="mx-auto max-w-6xl px-5 md:px-8 py-12">
        <Link to="/" className="inline-block mb-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
          <AlysonLogo size={28} wordmarkClassName="text-lg" />
        </Link>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {COLS.map((col) => (
            <div key={col.title}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                {col.title}
              </div>
              <ul className="mt-3 space-y-2 text-[13px] text-muted-foreground">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {"to" in link ? (
                      <Link to={link.to} className="hover:text-foreground">
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className="hover:text-foreground">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Alyson HR · Newport Beach, CA</span>
          <span className="font-display text-foreground">People · Pay · Time · Meetings</span>
        </div>
      </div>
    </footer>
  );
}
