import { Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/brand/Wordmark";

export function SiteFooter() {
  return (
    <footer className="px-6 py-16 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <Wordmark size={26} />
            <p className="mt-5 text-sm text-muted-foreground max-w-sm leading-relaxed">
              The control plane for agentic work. Designed and operated for teams that treat AI
              output as evidence, not vibes.
            </p>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-widest text-muted-foreground/70 uppercase mb-4">
              Product
            </div>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#pillars" className="text-foreground/80 hover:text-foreground">
                  Pillars
                </a>
              </li>
              <li>
                <a href="#features" className="text-foreground/80 hover:text-foreground">
                  Features
                </a>
              </li>
              <li>
                <a href="#use-cases" className="text-foreground/80 hover:text-foreground">
                  Use cases
                </a>
              </li>
              <li>
                <Link to="/auth/signup" className="text-foreground/80 hover:text-foreground">
                  Sign up
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-widest text-muted-foreground/70 uppercase mb-4">
              Workspace
            </div>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/auth/login" className="text-foreground/80 hover:text-foreground">
                  Sign in
                </Link>
              </li>
              <li>
                <Link
                  to="/auth/forgot-password"
                  className="text-foreground/80 hover:text-foreground"
                >
                  Reset password
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="text-foreground/80 hover:text-foreground">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link to="/settings" className="text-foreground/80 hover:text-foreground">
                  Settings
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-6 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="font-mono">© {new Date().getFullYear()} 0101 · ALL RIGHTS RESERVED</div>
          <div className="font-mono tracking-widest">GOVERNED · AUDITED · DETERMINISTIC</div>
        </div>
      </div>
    </footer>
  );
}
