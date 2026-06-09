import * as React from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function AuthShell({ title, subtitle, footer, children }: AuthShellProps) {
  return (
    <div className="relative min-h-screen flex flex-col">
      <header className="px-8 py-6 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back</span>
        </Link>
        <Wordmark size={20} />
        <span className="text-xs text-muted-foreground/60 font-mono tracking-wider">v1.0</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
          className="w-full max-w-sm"
        >
          <div className="text-center mb-10">
            <h1 className="text-4xl font-semibold tracking-tight text-chrome leading-[1.05]">
              {title}
            </h1>
            {subtitle && <p className="text-[15px] text-muted-foreground mt-3">{subtitle}</p>}
          </div>

          {children}

          {footer && <div className="text-center text-sm text-muted-foreground mt-8">{footer}</div>}
        </motion.div>
      </main>

      <footer className="px-8 py-5 flex items-center justify-center gap-6 text-[11px] text-muted-foreground/50">
        <span>© 0101</span>
        <Link to="/" className="hover:text-foreground/70 transition-colors">
          Privacy
        </Link>
        <Link to="/" className="hover:text-foreground/70 transition-colors">
          Terms
        </Link>
      </footer>
    </div>
  );
}
