import { Link } from "@tanstack/react-router";
import { ArrowRight, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { AlysonLogo } from "@/components/AlysonLogo";
import { useTheme } from "@/lib/theme";

const LINKS = [
  { to: "/features", label: "Features" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/modules", label: "Modules" },
  { to: "/voices", label: "Voices" },
  { to: "/faq", label: "FAQ" },
] as const;

export function LandingNavbar() {
  const { theme, toggle } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 md:px-4">
      <nav
        className={cn(
          "mx-auto flex h-14 items-center justify-between gap-3 border border-border bg-paper/90 px-3 backdrop-blur-md transition-all duration-300 md:px-5",
          scrolled
            ? "max-w-4xl rounded-full shadow-[var(--shadow-soft)]"
            : "max-w-6xl rounded-2xl",
        )}
        aria-label="Main"
      >
        <Link
          to="/"
          className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          <AlysonLogo size={30} wordmarkClassName="text-base sm:text-lg max-[380px]:hidden" />
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-md px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <Link
            to="/auth"
            className="hidden h-9 items-center rounded-md px-3 text-[13px] text-muted-foreground hover:text-foreground sm:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-4 text-[13px] font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Open app
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>
    </header>
  );
}
