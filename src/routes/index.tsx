import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Cpu, Moon, ShieldCheck, Sun, Zap } from "lucide-react";
import { BackgroundBeams } from "@/components/aceternity/BackgroundBeams";
import { Spotlight } from "@/components/aceternity/Spotlight";
import { BentoCard, BentoGrid } from "@/components/aceternity/BentoGrid";
import { InfiniteMovingCards } from "@/components/aceternity/InfiniteMovingCards";
import { useTheme } from "@/lib/theme";
import { LandingOrgChart } from "@/components/landing/LandingOrgChart";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Alyson HR — People, Pay & Equity OS" },
      { name: "description", content: "The AI-augmented operating system for people, payroll, performance, and equity." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { theme, toggle } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30">
        <div
          className={[
            "mx-auto px-3 md:px-4 pt-3 transition-all duration-300",
            scrolled ? "max-w-[980px]" : "max-w-6xl",
          ].join(" ")}
        >
          <motion.div
            className={[
              "h-14 flex items-center justify-between gap-3",
              "backdrop-blur-md transition-all duration-300",
              scrolled
                ? "rounded-full border border-border bg-background/70 shadow-[var(--shadow-soft)] px-4 md:px-5"
                : "border-b border-border bg-background/60 px-2 md:px-4 rounded-none",
            ].join(" ")}
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link to="/" className="font-display text-lg font-semibold tracking-tight hover:opacity-90">
              Alyson HR
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#features" className="hover:text-foreground">
                Features
              </a>
              <a href="#lab" className="hover:text-foreground">
                Lab
              </a>
              <a href="#security" className="hover:text-foreground">
                Security
              </a>
              <a href="#faq" className="hover:text-foreground">
                FAQ
              </a>
            </nav>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggle}
                className="h-9 w-9 grid place-items-center rounded-md border border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                title={theme === "dark" ? "Light mode" : "Dark mode"}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <Link
                to="/auth"
                className="h-9 min-w-[92px] px-4 rounded-md border border-border text-sm font-medium inline-flex items-center justify-center hover:bg-muted/50"
              >
                Sign in
              </Link>
              <Link
                to="/auth"
                className="h-9 min-w-[92px] px-4 rounded-md bg-foreground text-background text-sm font-medium inline-flex items-center justify-center gap-2 hover:opacity-90"
              >
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <BackgroundBeams />
          <Spotlight />

          <div className="mx-auto max-w-6xl px-5 md:px-8 pt-16 md:pt-20 pb-10 md:pb-14 relative">
            <motion.div
              className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-muted-foreground"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <Cpu className="h-3.5 w-3.5" />
              AI-first HR lab for compensation + headcount intelligence
            </motion.div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-7">
                <motion.h1
                  className="font-display text-4xl md:text-6xl font-semibold tracking-tight leading-[1.03]"
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-120px" }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                >
                  An AI lab for people & pay.
                  <span className="text-muted-foreground"> Built like a modern SaaS OS.</span>
                </motion.h1>
                <motion.p
                  className="mt-5 max-w-2xl text-[15px] md:text-lg text-muted-foreground leading-relaxed"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-120px" }}
                  transition={{ duration: 0.65, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
                >
                  Alyson turns HR + Finance data into decision-ready views: role-aware dashboards, scenario planning, and audit-grade workflows —
                  with an AI copilot that explains every metric.
                </motion.p>
                <motion.div
                  className="mt-8 flex flex-col sm:flex-row gap-3"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-120px" }}
                  transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Link
                    to="/auth"
                    className="h-11 px-5 rounded-md bg-foreground text-background text-sm font-medium inline-flex items-center justify-center gap-2 hover:opacity-90"
                  >
                    Create account <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/auth"
                    className="h-11 px-5 rounded-md border border-border text-sm font-medium inline-flex items-center justify-center hover:bg-muted/50"
                  >
                    Sign in
                  </Link>
                </motion.div>

                <div className="mt-10 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border bg-muted/30 px-3 py-1">Role-aware access</span>
                  <span className="rounded-full border border-border bg-muted/30 px-3 py-1">Forecast payroll + bonus + equity</span>
                  <span className="rounded-full border border-border bg-muted/30 px-3 py-1">Workflows + approvals</span>
                  <span className="rounded-full border border-border bg-muted/30 px-3 py-1">Clerk auth</span>
                </div>
              </div>

              <div className="lg:col-span-5">
                <motion.div
                  className="surface-lifted p-4 md:p-5 rounded-2xl"
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-120px" }}
                  transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">Lab console</div>
                  <div className="mt-3 rounded-xl border border-border bg-background/60 p-4 font-mono text-[12px] leading-relaxed">
                    <div className="text-muted-foreground">$ alyson run forecast --scenario growth --months 12</div>
                    <div className="mt-2">
                      <span className="text-foreground">✓</span> Payroll next month:{" "}
                      <span className="text-foreground font-medium">$1.42M</span>
                    </div>
                    <div>
                      <span className="text-foreground">✓</span> Bonus accrual (Q):{" "}
                      <span className="text-foreground font-medium">$310k</span>
                    </div>
                    <div>
                      <span className="text-foreground">✓</span> Equity expense (6mo):{" "}
                      <span className="text-foreground font-medium">$980k</span>
                    </div>
                    <div className="mt-2 text-muted-foreground">Explain variance ↴</div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                      { k: "Latency", v: "fast" },
                      { k: "Lineage", v: "traceable" },
                      { k: "Controls", v: "role-based" },
                    ].map((x) => (
                      <div key={x.k} className="rounded-xl border border-border bg-muted/20 p-3">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{x.k}</div>
                        <div className="mt-1 text-sm font-medium">{x.v}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-5 md:px-8 py-14 md:py-20">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">What you get</div>
              <h2 className="font-display text-3xl md:text-4xl font-semibold mt-2 tracking-tight">Modern ops, minus the noise</h2>
            </div>
            <div className="text-sm text-muted-foreground max-w-md">
              Designed like a SaaS AI lab: fast feedback loops, clean surfaces, and data you can trust.
            </div>
          </div>

          <BentoGrid className="mt-8 grid-cols-1 md:grid-cols-3">
            <BentoCard
              eyebrow="Explore"
              title="Instant answers"
              description="Slice headcount, comp, and spend by org unit and time — without exporting data."
              icon={<Zap className="h-4 w-4" />}
            />
            <BentoCard
              eyebrow="Model"
              title="Scenario planning"
              description="Forecast payroll + bonus + equity costs with conservative/base/growth assumptions."
              icon={<Bot className="h-4 w-4" />}
            />
            <BentoCard
              eyebrow="Operate"
              title="Workflows that stick"
              description="Approvals, inboxes, and audit trails that match real finance + HR teams."
              icon={<ShieldCheck className="h-4 w-4" />}
            />
          </BentoGrid>
        </section>

        <section id="lab" className="border-t border-border bg-muted/10">
          <div className="mx-auto max-w-6xl px-5 md:px-8 py-14 md:py-18">
            <div className="flex items-end justify-between gap-6 flex-wrap">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">AI lab</div>
                <h3 className="font-display text-2xl md:text-3xl font-semibold mt-2 tracking-tight">
                  Lab-driven primitives, product-grade UX
                </h3>
              </div>
              <div className="text-sm text-muted-foreground max-w-md">
                Every KPI is explainable. Every forecast is reproducible. Every decision has lineage.
              </div>
            </div>

            <BentoGrid className="mt-8 grid-cols-1 lg:grid-cols-12">
              <BentoCard
                className="lg:col-span-7"
                eyebrow="Copilot"
                title="Explain anything"
                description="Ask why a metric moved, what contributes to cost, or where a number comes from — and get a plain-English answer."
                icon={<Bot className="h-4 w-4" />}
              >
                <div className="rounded-xl border border-border bg-background/60 p-4 font-mono text-[12px] text-muted-foreground leading-relaxed">
                  <div className="text-foreground">Q: Why did payroll jump 8% MoM?</div>
                  <div className="mt-2">A: Headcount +6, comp refresh +$120k, equity amortization +$34k.</div>
                  <div className="mt-1">Sources: employees, compensation, vesting_events.</div>
                </div>
              </BentoCard>
              <BentoCard
                className="lg:col-span-5"
                eyebrow="Guardrails"
                title="Operator-safe"
                description="Role-based access, consistent surfaces, and calm defaults. Built to ship without chaos."
                icon={<ShieldCheck className="h-4 w-4" />}
              >
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border bg-muted/30 px-3 py-1">CEO</span>
                  <span className="rounded-full border border-border bg-muted/30 px-3 py-1">Finance</span>
                  <span className="rounded-full border border-border bg-muted/30 px-3 py-1">HR</span>
                  <span className="rounded-full border border-border bg-muted/30 px-3 py-1">Manager</span>
                  <span className="rounded-full border border-border bg-muted/30 px-3 py-1">Employee</span>
                </div>
              </BentoCard>
            </BentoGrid>
          </div>
        </section>

        <section id="org" className="border-t border-border">
          <div className="mx-auto max-w-6xl px-5 md:px-8 py-14 md:py-20">
            <div className="flex items-end justify-between gap-6 flex-wrap">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">Canvas</div>
                <h3 className="font-display text-2xl md:text-3xl font-semibold mt-2 tracking-tight">
                  Org chart, as a heroic scene
                </h3>
              </div>
              <div className="text-sm text-muted-foreground max-w-md">
                A living map of your company: reporting lines, cost, and movement — built for operators.
              </div>
            </div>

            <div className="mt-8">
              <LandingOrgChart
                onCta={() => {
                  const el = document.getElementById("faq");
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
              />
            </div>
          </div>
        </section>

        <section id="security" className="border-t border-border bg-muted/20">
          <div className="mx-auto max-w-6xl px-5 md:px-8 py-14 md:py-16 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">Security</div>
              <h3 className="font-display text-2xl md:text-3xl font-semibold mt-2 tracking-tight">Clean auth, safe defaults</h3>
              <p className="mt-3 text-sm md:text-[15px] text-muted-foreground leading-relaxed">
                Sign-in is handled by Clerk. Private routes stay private, and marketing pages remain public.
              </p>
            </div>
            <div className="surface-card p-5">
              <div className="text-sm font-medium">Included</div>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><span className="text-foreground">•</span> Protected app area under <span className="font-mono text-foreground">/app</span></li>
                <li className="flex gap-2"><span className="text-foreground">•</span> Public landing page at <span className="font-mono text-foreground">/</span></li>
                <li className="flex gap-2"><span className="text-foreground">•</span> Auth page at <span className="font-mono text-foreground">/auth</span></li>
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-5 md:px-8 py-14 md:py-20">
            <div className="flex items-end justify-between gap-6 flex-wrap">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">Signals</div>
                <h3 className="font-display text-2xl md:text-3xl font-semibold mt-2 tracking-tight">
                  Operators don’t want dashboards. They want decisions.
                </h3>
              </div>
              <div className="text-sm text-muted-foreground max-w-md">
                A few notes from early users and finance partners evaluating Alyson’s approach.
              </div>
            </div>

            <div className="mt-8">
              <InfiniteMovingCards
                speed="normal"
                items={[
                  {
                    quote: "Finally a people/pay view that feels like a lab notebook, not a spreadsheet export.",
                    name: "Finance Lead",
                    title: "Mid-market SaaS",
                    handle: "@financeops",
                  },
                  {
                    quote: "The org canvas is the first time approvals and reporting lines feel connected.",
                    name: "HR Ops",
                    title: "Scaling team",
                    handle: "@hrops",
                  },
                  {
                    quote: "Scenario planning across payroll + bonus + equity is the missing link in most HR stacks.",
                    name: "FP&A",
                    title: "B2B platform",
                    handle: "@fpa",
                  },
                  {
                    quote: "Clean, calm UI. The AI explanations are what I show the exec team.",
                    name: "CEO",
                    title: "Consumer startup",
                    handle: "@operator",
                  },
                  {
                    quote: "We can trace why a number changed. That’s the whole game.",
                    name: "Controller",
                    title: "High growth",
                    handle: "@controllership",
                  },
                ]}
              />
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-6xl px-5 md:px-8 py-14 md:py-20">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">FAQ</div>
              <h3 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">Everything you need for a demo</h3>
            </div>
            <div className="text-sm text-muted-foreground max-w-md">
              Short answers for stakeholders. We can expand docs and pricing pages later.
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7">
              <FaqAccordion
                items={[
                  {
                    q: "What’s the fastest path to the product?",
                    a: "Click Start free → create an account. After sign-in you land in /app automatically.",
                  },
                  {
                    q: "Is the landing page public?",
                    a: "Yes. / is public. /auth is public. The app lives behind auth and routes you to /auth when needed.",
                  },
                  {
                    q: "Where does team data come from in demo mode?",
                    a: "From the S3 snapshot at alyson-hr/overview.json. That keeps the demo consistent even if Supabase is empty.",
                  },
                  {
                    q: "Can we edit the org chart visually?",
                    a: "Super Admins can drag nodes to reflect priorities and save the layout. Auto-arrange snaps back to the hierarchical tree.",
                  },
                  {
                    q: "How does the AI copilot stay accurate?",
                    a: "It answers from the same underlying tables powering each module and can cite the source tables for KPIs.",
                  },
                ]}
              />
            </div>

            <div className="lg:col-span-5">
              <BentoCard
                eyebrow="Next"
                title="Run a 10-minute walkthrough"
                description="Start with Team → Org chart, then show Dashboard forecasting, then open a KPI drilldown."
                icon={<Cpu className="h-4 w-4" />}
              >
                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2">
                    <span>1) Team canvas</span>
                    <span className="font-mono text-[12px]">2m</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2">
                    <span>2) Forecast chart</span>
                    <span className="font-mono text-[12px]">4m</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2">
                    <span>3) KPI lineage</span>
                    <span className="font-mono text-[12px]">4m</span>
                  </div>
                </div>
              </BentoCard>
            </div>
          </div>

          <div className="mt-10 surface-card p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="font-display text-xl font-semibold">Ready to build your workspace?</div>
              <div className="text-sm text-muted-foreground mt-1">Create an account and explore the demo roles inside.</div>
            </div>
            <Link
              to="/auth"
              className="h-11 px-5 rounded-md bg-foreground text-background text-sm font-medium inline-flex items-center gap-2 hover:opacity-90"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 md:px-8 py-10 text-sm text-muted-foreground flex items-center justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <div>© {new Date().getFullYear()} Alyson HR</div>
            <div className="hidden sm:block opacity-60">•</div>
            <div>Newport Beach, CA</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            <a href="#faq" className="hover:text-foreground">Support</a>
            <Link to="/auth" className="hover:text-foreground">Sign in</Link>
            <Link to="/auth" className="hover:text-foreground">Create account</Link>
            <span className="opacity-50">|</span>
            <a href="#" className="hover:text-foreground">Terms</a>
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Cookies</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FaqAccordion({
  items,
}: {
  items: Array<{ q: string; a: string }>;
}) {
  return (
    <div className="surface-card overflow-hidden divide-y divide-border">
      {items.map((it) => (
        <details key={it.q} className="group">
          <summary className="list-none cursor-pointer px-5 py-4 hover:bg-muted/20 flex items-start justify-between gap-4">
            <span className="font-medium text-[14px]">{it.q}</span>
            <span className="text-muted-foreground group-open:rotate-45 transition-transform select-none">+</span>
          </summary>
          <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
            {it.a}
          </div>
        </details>
      ))}
    </div>
  );
}
