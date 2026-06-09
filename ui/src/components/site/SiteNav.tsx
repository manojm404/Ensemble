import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { GlassButton } from "@/components/glass/GlassButton";
import { cn } from "@/lib/utils";

const links = [
  { to: "/platform" as const, label: "Platform" },
  { to: "/solutions" as const, label: "Solutions" },
  { to: "/enterprise" as const, label: "Enterprise" },
  { to: "/pricing" as const, label: "Pricing" },
];

export function SiteNav() {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-all", scrolled ? "py-2" : "py-4")}>
      <div className="max-w-6xl mx-auto px-4">
        <div
          className={cn(
            "flex items-center justify-between rounded-full px-4 md:px-6 py-2.5 transition-all",
            scrolled ? "glass-strong border border-white/10" : "glass border border-white/8",
          )}
        >
          <Link to="/" className="flex items-center gap-2">
            <Wordmark size={26} />
          </Link>
          <nav className="hidden md:flex items-center gap-7">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="text-sm text-foreground/70 hover:text-foreground transition-colors"
                activeProps={{ className: "text-foreground" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-2">
            <GlassButton asChild variant="ghost" size="sm">
              <Link to="/auth/login">Sign in</Link>
            </GlassButton>
            <GlassButton asChild variant="primary" size="sm">
              <Link to="/auth/signup">Start free</Link>
            </GlassButton>
          </div>
          <button
            type="button"
            className="md:hidden size-9 grid place-items-center rounded-full hover:bg-white/[0.06]"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {open && (
          <div className="md:hidden mt-2 rounded-2xl glass-strong border border-white/10 p-4 space-y-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm text-foreground/80 hover:bg-white/[0.06]"
              >
                {l.label}
              </Link>
            ))}
            <div className="border-t border-white/5 my-2" />
            <Link
              to="/auth/login"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm text-foreground/80 hover:bg-white/[0.06]"
            >
              Sign in
            </Link>
            <Link
              to="/auth/signup"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm text-rim hover:bg-white/[0.06]"
            >
              Start free →
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
