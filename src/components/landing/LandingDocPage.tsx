import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { LandingPageLayout } from "@/components/landing/LandingPageLayout";
import { cn } from "@/lib/utils";

export function LandingProse({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "space-y-4 text-[14px] leading-relaxed text-muted-foreground [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:mb-2 [&_h3]:text-[15px] [&_h3]:font-medium [&_h3]:text-foreground [&_h3]:mt-5 [&_h3]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5 [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-80 [&_strong]:text-foreground [&_strong]:font-medium",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function LandingDocPage({
  eyebrow,
  title,
  description,
  children,
  wide,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <LandingPageLayout>
      <article className={cn("mx-auto px-5 md:px-8 py-10 md:py-14", wide ? "max-w-5xl" : "max-w-3xl")}>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>
        {eyebrow ? (
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-foreground mt-1">
          {title}
        </h1>
        {description ? <p className="mt-3 text-[15px] text-muted-foreground leading-relaxed">{description}</p> : null}
        <div className="mt-8">{children}</div>
      </article>
    </LandingPageLayout>
  );
}
