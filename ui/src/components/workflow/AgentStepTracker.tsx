/**
 * AgentStepTracker.tsx — Vertical Timeline of Agent Execution
 * 
 * Displays a vertical list of agents being executed in sequence.
 * Each step shows status (pending/running/done/error), and when done,
 * can be expanded to reveal input received and output produced.
 * 
 * PRODUCTION-READY: This component only renders data — no mocking.
 * All mock data comes from WorkflowExecutionPanel.
 * 
 * DO NOT CHANGE:
 * - Status icon mapping (Circle/Loader2/CheckCircle2/AlertCircle)
 * - Vertical connector line pattern (absolute left-[15px])
 * - Expand/collapse animation (Framer Motion height transition)
 */

import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, CheckCircle2, Loader2, Circle, AlertCircle, Clock, GitBranch } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export type StepStatus = "pending" | "running" | "done" | "error";

export interface AgentStep {
  id: string;
  agentName: string;
  emoji: string;
  status: StepStatus;
  /** Why the planner selected this agent */
  selectionReason?: string;
  /** What this agent received as input (from previous agent or user) */
  input?: string;
  /** What this agent produced as output */
  output?: string;
  /** Failure reason when the step errors out */
  error?: string;
  /** Categorized failure kind for error steps */
  failureKind?: string;
  /** Human-readable failure label */
  failureLabel?: string;
  /** Execution time in seconds */
  duration?: number;
  /** Structured handover summary containing verification status and git ref */
  handover?: any;
  /** The model used for this step */
  model?: string;
  /** The status of the verification step */
  verification_status?: 'pending' | 'running' | 'passed' | 'failed';
}

/** Status → icon/color mapping. DO NOT CHANGE these semantic associations. */
const statusConfig: Record<StepStatus, { icon: React.ElementType; color: string; label: string }> = {
  pending: { icon: Circle, color: "text-muted-foreground/50", label: "Pending" },
  running: { icon: Loader2, color: "text-primary", label: "Running" },
  done: { icon: CheckCircle2, color: "text-badge-green", label: "Done" },
  error: { icon: AlertCircle, color: "text-destructive", label: "Error" },
};

/** Individual step row — expandable when done/error */
function StepItem({ step, isLast, focusStepId }: { step: AgentStep; isLast: boolean; focusStepId?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const config = statusConfig[step.status];
  const StatusIcon = config.icon;
  const isCurrent = focusStepId === step.id && step.status === "running";

  useEffect(() => {
    if (focusStepId && step.id === focusStepId && (step.status === "running" || step.status === "done" || step.status === "error")) {
      setExpanded(true);
    }
  }, [focusStepId, step.id, step.status]);

  return (
    <div className="relative">
      {/* Vertical connector line between steps */}
      {!isLast && (
        <div className={`absolute left-[15px] top-8 bottom-0 w-px ${step.status === "done" ? "bg-badge-green/30" : "bg-border/50"}`} />
      )}

      {/* Step button — clickable only when done or error */}
      <button
        className={`flex items-center gap-3 w-full text-left px-2 py-2 rounded-lg transition-colors group ${
          isCurrent ? "ring-1 ring-primary/20 bg-primary/5" :
          step.status === "error" ? "bg-rose-500/5 hover:bg-rose-500/10" : "hover:bg-secondary/30"
        }`}
        onClick={() => ((step.status === "done" || step.status === "error" || isCurrent) && setExpanded(!expanded))}
        disabled={step.status === "pending"}
      >
        {/* Status icon — spins when running */}
        <div className={`shrink-0 ${config.color}`}>
          <StatusIcon className={`h-4 w-4 ${step.status === "running" ? "animate-spin" : ""}`} />
        </div>

        {/* Agent emoji + name */}
        <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm">{step.emoji}</span>
                <span className={`text-xs font-medium truncate ${step.status === "running" ? "text-primary" : "text-foreground"}`}>
                  {step.agentName}
                </span>
            {step.model && <Badge variant="outline" className="text-[9px] px-1 py-0">{step.model}</Badge>}
          </div>
          {step.status === "error" && step.error && (
            <div className="mt-1 space-y-1">
              {step.failureLabel && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 uppercase tracking-[0.16em] border-rose-500/20 bg-rose-500/10 text-rose-600">
                  {step.failureLabel}
                </Badge>
              )}
              <p className="text-[11px] leading-4 text-rose-600 line-clamp-2">{step.error}</p>
            </div>
          )}
        </div>

        {/* Duration badge + verification status + expand chevron */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isCurrent && (
            <Badge variant="outline" className="text-[9px] uppercase tracking-[0.18em] text-primary border-primary/30 bg-primary/5">
              Working now
            </Badge>
          )}
          {step.verification_status === 'running' && <Badge variant="outline" className="text-xs text-primary border-primary/50">Verifying...</Badge>}
          {step.verification_status === 'passed' && <Badge variant="outline" className="text-xs text-badge-green border-badge-green/50">Passed</Badge>}
          {step.verification_status === 'failed' && <Badge variant="destructive" className="text-xs">Failed</Badge>}
          {step.duration && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />
              {step.duration}s
            </span>
          )}
          {(step.status === "done" || step.status === "error") && (
            expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded input/output panels */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-9 mr-2 mb-2 space-y-2">
              {/* Handover Data (M2) */}
              {step.handover && step.handover.verification && step.handover.verification !== "pending" && (
                <div className={`rounded-md border p-2 flex items-center justify-between ${
                  step.handover.verification === 'passed' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'
                }`}>
                  <div className="flex items-center gap-2">
                    {step.handover.verification === 'passed' ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <AlertCircle className="h-3 w-3 text-rose-500" />}
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      step.handover.verification === 'passed' ? 'text-emerald-500' : 'text-rose-500'
                    }`}>Verification {step.handover.verification}</span>
                  </div>
                  {step.handover.git_ref && (
                    <span className="text-[9px] font-mono text-muted-foreground flex items-center gap-1">
                      <GitBranch className="h-3 w-3" /> {step.handover.git_ref.substring(0, 7)}
                    </span>
                  )}
                </div>
              )}

              {/* Input received from previous agent */}
              {step.input && (
                <div className="rounded-md bg-secondary/30 border border-border/30 p-2.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Input</span>
                  <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-4">{step.input}</p>
                </div>
              )}
              {step.selectionReason && (
                <div className="rounded-md bg-primary/5 border border-primary/10 p-2.5">
                  <span className="text-[10px] font-medium text-primary/70 uppercase tracking-wider">Routing rationale</span>
                  <p className="text-[11px] text-foreground/80 mt-1 whitespace-pre-wrap line-clamp-4">{step.selectionReason}</p>
                </div>
              )}
              {/* Output produced by this agent */}
              {step.output && (
                <div className="rounded-md bg-primary/5 border border-primary/10 p-2.5">
                  <span className="text-[10px] font-medium text-primary/70 uppercase tracking-wider">Output</span>
                  <p className="text-[11px] text-foreground/80 mt-1 whitespace-pre-wrap line-clamp-6">{step.output}</p>
                </div>
              )}
              {step.status === "error" && step.error && !step.output && (
                <div className="rounded-md bg-rose-500/5 border border-rose-500/15 p-2.5">
                  <span className="text-[10px] font-medium text-rose-600 uppercase tracking-wider">Failure reason</span>
                  <p className="text-[11px] text-rose-700 mt-1 whitespace-pre-wrap line-clamp-6">{step.error}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Main tracker — header with progress count + scrollable step list */
export function AgentStepTracker({ steps, focusStepId }: { steps: AgentStep[]; focusStepId?: string | null }) {
  const completedCount = steps.filter((s) => s.status === "done").length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <span className="text-xs font-medium text-foreground">Execution Steps</span>
        {/* Progress badge: completed/total */}
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {completedCount}/{steps.length}
        </Badge>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {steps.map((step, i) => (
            <StepItem key={step.id} step={step} isLast={i === steps.length - 1} focusStepId={focusStepId} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
