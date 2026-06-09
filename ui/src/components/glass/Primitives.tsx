import * as React from "react";
import { cn } from "@/lib/utils";
import { GlassPanel } from "./GlassPanel";

export function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        {kicker && (
          <div className="font-mono text-[10px] tracking-[0.3em] text-rim/80 uppercase mb-2">
            {kicker}
          </div>
        )}
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-chrome">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-2 max-w-xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  trend,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  trend?: string;
  hint?: string;
}) {
  return (
    <GlassPanel padding="md">
      <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-2">
        {label}
      </div>
      <div className="text-3xl font-semibold tracking-tight text-chrome">{value}</div>
      <div className="flex items-center gap-2 mt-2">
        {trend && <span className="text-xs text-rim">{trend}</span>}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </GlassPanel>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <GlassPanel padding="lg" className="text-center py-16">
      <div className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase mb-3">
        Nothing here yet
      </div>
      <h3 className="text-xl font-semibold tracking-tight mb-2">{title}</h3>
      {body && <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">{body}</p>}
      {action}
    </GlassPanel>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg bg-gradient-to-r from-white/[0.04] via-white/[0.08] to-white/[0.04] bg-[length:200%_100%] animate-[shimmer_1.6s_ease-in-out_infinite]",
        className,
      )}
      style={{ animationName: "shimmer" }}
    />
  );
}
