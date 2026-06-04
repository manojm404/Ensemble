import { AlertTriangle, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { WorkflowValidationResult } from "@/lib/workflow-validation";

interface WorkflowValidationSummaryProps {
  validation: WorkflowValidationResult;
  compact?: boolean;
}

export function WorkflowValidationSummary({ validation, compact = false }: WorkflowValidationSummaryProps) {
  const hasBlocking = validation.errors.length > 0;
  const statusLabel = hasBlocking
    ? `${validation.errors.length} blocking issue${validation.errors.length === 1 ? "" : "s"}`
    : validation.warnings.length > 0
      ? `${validation.warnings.length} warning${validation.warnings.length === 1 ? "" : "s"}`
      : "Ready to run";

  if (compact) {
    return (
      <div
        className={`rounded-2xl border px-3 py-2.5 shadow-sm backdrop-blur-md ${
          hasBlocking
            ? "border-rose-500/20 bg-rose-500/8"
            : validation.warnings.length > 0
              ? "border-amber-500/20 bg-amber-500/8"
              : "border-emerald-500/20 bg-emerald-500/8"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            {hasBlocking ? (
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            ) : validation.warnings.length > 0 ? (
              <ShieldCheck className="h-4 w-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
            <p className="text-sm font-semibold text-foreground truncate">Workflow validation</p>
          </div>
          <Badge
            variant="secondary"
            className={`text-[10px] uppercase tracking-[0.18em] ${
              hasBlocking
                ? "bg-rose-500/15 text-rose-600"
                : validation.warnings.length > 0
                  ? "bg-amber-500/15 text-amber-600"
                  : "bg-emerald-500/15 text-emerald-600"
            }`}
          >
            {hasBlocking ? "Fix before run" : validation.warnings.length > 0 ? "Review" : "Ready"}
          </Badge>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {validation.nodeCount} node{validation.nodeCount === 1 ? "" : "s"} · {validation.edgeCount} edge{validation.edgeCount === 1 ? "" : "s"}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        hasBlocking
          ? "border-rose-500/20 bg-rose-500/5"
          : validation.warnings.length > 0
            ? "border-amber-500/20 bg-amber-500/5"
            : "border-emerald-500/20 bg-emerald-500/5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {hasBlocking ? (
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            ) : validation.warnings.length > 0 ? (
              <ShieldCheck className="h-4 w-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
            <p className="text-sm font-semibold text-foreground">Workflow validation</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {statusLabel} · {validation.nodeCount} node{validation.nodeCount === 1 ? "" : "s"} · {validation.edgeCount} edge{validation.edgeCount === 1 ? "" : "s"}
          </p>
        </div>
        <Badge
          variant="secondary"
          className={`text-[10px] uppercase tracking-[0.18em] ${
            hasBlocking
              ? "bg-rose-500/15 text-rose-600"
              : validation.warnings.length > 0
                ? "bg-amber-500/15 text-amber-600"
                : "bg-emerald-500/15 text-emerald-600"
          }`}
        >
          {hasBlocking ? "Fix before run" : validation.warnings.length > 0 ? "Review before run" : "Ready"}
        </Badge>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1" : "md:grid-cols-2"}`}>
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Blocking issues</p>
          {validation.errors.length > 0 ? (
            validation.errors.slice(0, 3).map((issue) => (
              <div key={issue.code} className="rounded-xl border border-rose-500/15 bg-background/80 p-3">
                <p className="text-xs font-semibold text-foreground">{issue.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{issue.description}</p>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-emerald-500/15 bg-background/80 p-3">
              <p className="text-xs font-semibold text-foreground">No blocking issues</p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">The graph can execute, but review any warnings before you run.</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Release warnings</p>
          {validation.warnings.length > 0 ? (
            validation.warnings.slice(0, 3).map((issue) => (
              <div key={issue.code} className="rounded-xl border border-amber-500/15 bg-background/80 p-3">
                <p className="text-xs font-semibold text-foreground">{issue.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{issue.description}</p>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-border/50 bg-background/80 p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs font-semibold text-foreground">No release warnings</p>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">The workflow includes the expected quality and governance signals.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
