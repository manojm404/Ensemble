import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, Loader2, Inbox } from "lucide-react";
import { GlassPanel } from "./GlassPanel";
import { GlassButton } from "./GlassButton";

interface StateViewProps {
  loading?: boolean;
  error?: unknown;
  empty?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: React.ReactNode;
  skeleton?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Render one of: loading skeleton, error, empty, success.
 * Wrap any adapter-backed surface in this primitive.
 */
export function StateView({
  loading,
  error,
  empty,
  emptyTitle = "Nothing here yet",
  emptyBody,
  emptyAction,
  skeleton,
  children,
}: StateViewProps) {
  const router = useRouter();
  if (loading) {
    return (
      skeleton ?? (
        <GlassPanel
          padding="lg"
          className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin text-rim" />
          Loading…
        </GlassPanel>
      )
    );
  }
  if (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    return (
      <GlassPanel padding="lg" className="text-center py-12">
        <AlertTriangle className="size-5 text-destructive mx-auto mb-3" />
        <div className="font-mono text-[10px] tracking-widest text-destructive/80 uppercase mb-2">
          Error
        </div>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">{message}</p>
        <GlassButton variant="rim" size="sm" onClick={() => router.invalidate()}>
          Try again
        </GlassButton>
      </GlassPanel>
    );
  }
  if (empty) {
    return (
      <GlassPanel padding="lg" className="text-center py-16">
        <Inbox className="size-5 text-muted-foreground mx-auto mb-3" />
        <div className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase mb-3">
          Nothing here yet
        </div>
        <h3 className="text-xl font-semibold tracking-tight mb-2">{emptyTitle}</h3>
        {emptyBody && (
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">{emptyBody}</p>
        )}
        {emptyAction}
      </GlassPanel>
    );
  }
  return <>{children}</>;
}

export function RowSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-14 rounded-xl bg-white/[0.03] border border-white/5 animate-pulse"
        />
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-44 rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse"
        />
      ))}
    </div>
  );
}

/** Small inline status chip. */
export function StatusChip({ status }: { status: string }) {
  const tone = (() => {
    const s = status.toLowerCase();
    if (s.includes("succ") || s === "active" || s === "pass")
      return "text-emerald-300/90 bg-emerald-400/[0.08] border-emerald-400/20";
    if (s.includes("fail") || s.includes("error"))
      return "text-red-300/90 bg-red-400/[0.08] border-red-400/20";
    if (s.includes("run")) return "text-rim bg-rim/[0.08] border-rim/30";
    if (s.includes("approval") || s.includes("await") || s === "warn")
      return "text-amber-300/90 bg-amber-400/[0.08] border-amber-400/20";
    if (s === "paused" || s === "idle" || s === "draft")
      return "text-muted-foreground bg-white/[0.04] border-white/10";
    if (s === "disabled" || s === "archived")
      return "text-muted-foreground/70 bg-white/[0.02] border-white/5";
    return "text-foreground/70 bg-white/[0.04] border-white/10";
  })();
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border font-mono text-[10px] uppercase tracking-widest ${tone}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
