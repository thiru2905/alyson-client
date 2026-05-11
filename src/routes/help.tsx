import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { Book, MessageCircle, Zap, FileQuestion, Search, ChevronDown } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/help")({
  head: () => ({ meta: [{ title: "Help — Alyson HR" }] }),
  component: HelpPage,
});

const TOPICS = [
  {
    icon: Book,
    title: "Getting started",
    desc: "Set up your workspace, import people, configure pay cycles.",
    faq: [
      { q: "How do I import existing employees?", a: "Use the CSV importer in Admin → Data sources, or paste from your old HRIS. We'll match levels and departments automatically." },
      { q: "What if I don't have all comp data?", a: "Start with name, email, role, department. You can backfill base salary and bonus % later — every other metric will update automatically." },
      { q: "Can I trial without committing?", a: "Yes — create a sandbox workspace from the role switcher. Nothing in sandbox is published." },
    ],
  },
  {
    icon: Zap,
    title: "Run your first payroll",
    desc: "From draft to Wise export in under 10 minutes.",
    faq: [
      { q: "How are payroll items generated?", a: "Each run pulls base salary from compensation, overlays approved bonuses, and applies any approved adjustments. You can override any line." },
      { q: "What format does Wise need?", a: "We export their standard CSV: recipient, currency, amount, reference. Click Wise CSV on any approved run." },
      { q: "Can I roll back a paid run?", a: "Paid runs are immutable. Issue an adjustment in the next run instead." },
    ],
  },
  {
    icon: FileQuestion,
    title: "Equity & vesting",
    desc: "How to model grants, cliff periods, and acceleration clauses.",
    faq: [
      { q: "What's the cliff vs vesting period?", a: "The cliff is when the first chunk vests (typically 12 months). After that, shares vest monthly across the remaining years." },
      { q: "Can I add acceleration?", a: "Yes — open any grant and toggle 'Single-trigger' or 'Double-trigger' acceleration. Affects forecast immediately." },
      { q: "How is equity expense projected?", a: "We amortize the next 6 months of vesting events and apply the active scenario factor." },
    ],
  },
  {
    icon: MessageCircle,
    title: "Contact support",
    desc: "Ask Alyson AI or email support@alyson.com — we reply within 4h.",
    faq: [
      { q: "How do I reach a human?", a: "Click 'Ask Alyson' in the top bar. If she can't help, type 'escalate' and we'll route to support@alyson.com." },
      { q: "What's your SLA?", a: "Standard plans get a 4-hour first response on weekdays. Enterprise plans get a 30-minute pager." },
    ],
  },
];

function HelpPage() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const filtered = TOPICS.map((t) => ({
    ...t,
    faq: t.faq.filter((f) => !q || f.q.toLowerCase().includes(q.toLowerCase()) || f.a.toLowerCase().includes(q.toLowerCase())),
  })).filter((t) => !q || t.faq.length || t.title.toLowerCase().includes(q.toLowerCase()) || t.desc.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader eyebrow="Resources" title="Help & docs" description="Everything you need to operate Alyson confidently." />
      <div className="px-5 md:px-8 py-6 md:py-7 space-y-5 max-w-3xl">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search help topics and FAQs…"
            className="w-full h-10 pl-9 pr-3 rounded-md border border-border bg-background text-[13px]"
          />
        </div>

        <div className="space-y-3">
          {filtered.map((t) => {
            const isOpen = open === t.title;
            return (
              <div key={t.title} className="surface-card overflow-hidden">
                <button
                  onClick={() => setOpen(isOpen ? null : t.title)}
                  className="w-full p-5 flex items-start gap-3 text-left hover:bg-muted/30"
                >
                  <div className="h-9 w-9 rounded-md bg-accent text-accent-foreground grid place-items-center shrink-0">
                    <t.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{t.desc}</div>
                  </div>
                  <ChevronDown className={"h-4 w-4 text-muted-foreground transition-transform shrink-0 " + (isOpen ? "rotate-180" : "")} />
                </button>
                {isOpen && (
                  <div className="border-t border-border divide-y divide-border bg-muted/10">
                    {t.faq.map((f, i) => (
                      <div key={i} className="p-4">
                        <div className="font-medium text-[13px]">{f.q}</div>
                        <div className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">{f.a}</div>
                      </div>
                    ))}
                    {t.faq.length === 0 && <div className="p-4 text-[12px] text-muted-foreground italic">No FAQs match your search.</div>}
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="surface-card p-10 text-center">
              <div className="text-[14px] font-medium">No matches</div>
              <div className="text-[12px] text-muted-foreground mt-1">Try a different search term, or <button onClick={() => { /* opens AI from app shell */ }} className="text-primary hover:underline">ask Alyson</button>.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
