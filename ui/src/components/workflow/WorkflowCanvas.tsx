import * as React from "react";
import type { Workflow, WorkflowNode, NodeStatus } from "@/lib/adapters";
import { cn } from "@/lib/utils";

const NODE_W = 140;
const NODE_H = 48;

const KIND_BADGE: Record<WorkflowNode["kind"], string> = {
  source: "SRC",
  planner: "PLAN",
  tool: "TOOL",
  agent: "AGT",
  eval: "EVAL",
  approval: "GATE",
  sink: "OUT",
};

const STATUS_TONE: Record<NodeStatus, string> = {
  pending: "border-white/15 text-foreground/70",
  running: "border-rim/60 text-rim shadow-[0_0_24px_-6px_oklch(0.78_0.06_240/0.6)]",
  succeeded: "border-emerald-400/40 text-emerald-200/90",
  failed: "border-red-400/50 text-red-200/90",
  skipped: "border-white/10 text-muted-foreground/60",
  awaiting_approval: "border-amber-400/40 text-amber-200/90",
};

interface Props {
  workflow: Pick<Workflow, "nodes" | "edges">;
  nodeStatuses?: Record<string, NodeStatus>;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

/**
 * Read-only SVG canvas that renders the workflow graph with status chips.
 * Production-quality shell — visually polished, interactive selection,
 * ready to host a real editor (drag/drop, etc.) later.
 */
export function WorkflowCanvas({ workflow, nodeStatuses = {}, selectedId, onSelect }: Props) {
  const { nodes, edges } = workflow;
  const maxX = Math.max(...nodes.map((n) => (n.x ?? 0) + NODE_W));
  const maxY = Math.max(...nodes.map((n) => (n.y ?? 0) + NODE_H));

  return (
    <div className="relative w-full h-full overflow-auto glass-inset rounded-2xl">
      <svg
        width={maxX + 60}
        height={maxY + 60}
        className="block"
        style={{
          background:
            "radial-gradient(circle at 1px 1px, oklch(1 0 0 / 0.06) 1px, transparent 0) 0 0 / 24px 24px",
        }}
      >
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="oklch(0.85 0.06 240 / 0.7)" />
          </marker>
        </defs>

        {/* edges */}
        {edges.map(([from, to], i) => {
          const a = nodes.find((n) => n.id === from);
          const b = nodes.find((n) => n.id === to);
          if (!a || !b) return null;
          const x1 = (a.x ?? 0) + NODE_W;
          const y1 = (a.y ?? 0) + NODE_H / 2;
          const x2 = b.x ?? 0;
          const y2 = (b.y ?? 0) + NODE_H / 2;
          const cx = (x1 + x2) / 2;
          return (
            <path
              key={i}
              d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
              stroke="oklch(0.85 0.06 240 / 0.45)"
              strokeWidth={1.25}
              fill="none"
              markerEnd="url(#arrow)"
            />
          );
        })}

        {/* nodes */}
        {nodes.map((n) => {
          const status = nodeStatuses[n.id] ?? "pending";
          const isSelected = n.id === selectedId;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x ?? 0}, ${n.y ?? 0})`}
              className="cursor-pointer"
              onClick={() => onSelect?.(isSelected ? null : n.id)}
            >
              <foreignObject width={NODE_W} height={NODE_H}>
                <div
                  className={cn(
                    "h-full w-full rounded-xl px-3 py-2 backdrop-blur-md bg-black/40 border transition-all",
                    STATUS_TONE[status],
                    isSelected ? "ring-1 ring-rim/60" : "",
                  )}
                >
                  <div className="font-mono text-[9px] tracking-widest uppercase opacity-80">
                    {KIND_BADGE[n.kind]} · {status.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs truncate font-medium">{n.label}</div>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
