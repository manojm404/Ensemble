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

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, CheckCircle2, Loader2, Circle, AlertCircle, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export type StepStatus = "pending" | "running" | "done" | "error";

export interface AgentStep {
  id: string;
  agentName: string;
  emoji: string;
  status: StepStatus;
  /** What this agent received as input (from previous agent or user) */
  input?: string;
  /** What this agent produced as output */
  output?: string;
  /** Execution time in seconds */
  duration?: number;
}

/** Status → icon/color mapping. DO NOT CHANGE these semantic associations. */
const statusConfig: Record<StepStatus, { icon: React.ElementType; color: string; label: string }> = {
  pending: { icon: Circle, color: "text-muted-foreground/50", label: "Pending" },
  running: { icon: Loader2, color: "text-primary", label: "Running" },
  done: { icon: CheckCircle2, color: "text-badge-green", label: "Done" },
  error: { icon: AlertCircle, color: "text-destructive", label: "Error" },
};

/** Individual step row — expandable when done/error */
function StepItem({ step, isLast }: { step: AgentStep; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const config = statusConfig[step.status];
  const StatusIcon = config.icon;

  return (
    <div className="relative">
      {/* Vertical connector line between steps */}
      {!isLast && (
        <div className={`absolute left-[15px] top-8 bottom-0 w-px ${step.status === "done" ? "bg-badge-green/30" : "bg-border/50"}`} />
      )}

      {/* Step button — clickable only when done or error */}
      <button
        className="flex items-center gap-3 w-full text-left px-2 py-2 rounded-lg hover:bg-secondary/30 transition-colors group"
        onClick={() => (step.status === "done" || step.status === "error") && setExpanded(!expanded)}
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
          </div>
        </div>

        {/* Duration badge + expand chevron */}
        <div className="flex items-center gap-1.5 shrink-0">
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
              {/* Input received from previous agent */}
              {step.input && (
                <div className="rounded-md bg-secondary/30 border border-border/30 p-2.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Input</span>
                  <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-4">{step.input}</p>
                </div>
              )}
              {/* Output produced by this agent */}
              {step.output && (
                <div className="rounded-md bg-primary/5 border border-primary/10 p-2.5">
                  <span className="text-[10px] font-medium text-primary/70 uppercase tracking-wider">Output</span>
                  <p className="text-[11px] text-foreground/80 mt-1 whitespace-pre-wrap line-clamp-6">{step.output}</p>
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
export function AgentStepTracker({ steps }: { steps: AgentStep[] }) {
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
            <StepItem key={step.id} step={step} isLast={i === steps.length - 1} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
