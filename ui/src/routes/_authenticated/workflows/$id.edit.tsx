import * as React from "react";
import { createFileRoute, useParams, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Play, History, GitBranch, AlertTriangle, Plus, ArrowLeft } from "lucide-react";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { StateView } from "@/components/glass/StateView";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { workflowApi, type NodeKind, type WorkflowNode } from "@/lib/adapters";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/workflows/$id/edit")({
  head: () => ({ meta: [{ title: "Edit workflow — 0101" }] }),
  component: WorkflowEditor,
});

const PALETTE: Array<{ kind: NodeKind; label: string }> = [
  { kind: "source", label: "Trigger" },
  { kind: "planner", label: "Plan" },
  { kind: "agent", label: "Agent" },
  { kind: "tool", label: "Tool" },
  { kind: "eval", label: "Eval" },
  { kind: "approval", label: "Approval" },
  { kind: "sink", label: "Artifact" },
];

function WorkflowEditor() {
  const { id } = useParams({ from: "/_authenticated/workflows/$id/edit" });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const wf = useQuery({ queryKey: ["workflow", id], queryFn: () => workflowApi.getById(id) });

  // local editor state — when the user is mutating the graph, work off this snapshot
  const [nodes, setNodes] = React.useState<WorkflowNode[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);

  React.useEffect(() => {
    if (wf.data && !nodes) setNodes(wf.data.nodes);
  }, [wf.data, nodes]);

  const activeNode = nodes?.find((n) => n.id === selectedId) ?? null;

  function addNode(kind: NodeKind, label: string) {
    if (!nodes) return;
    const id = `n${nodes.length + 1}`;
    const last = nodes[nodes.length - 1];
    const x = (last?.x ?? 60) + 180;
    const y = last?.y ?? 160;
    setNodes([...nodes, { id, kind, label, role: kind, x, y }]);
    setDirty(true);
  }

  function updateNode(patch: Partial<WorkflowNode>) {
    if (!nodes || !activeNode) return;
    setNodes(nodes.map((n) => (n.id === activeNode.id ? { ...n, ...patch } : n)));
    setDirty(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!nodes) return;
      await workflowApi.update(id, { nodes });
    },
    onSuccess: () => {
      toast.success("Saved");
      setDirty(false);
      setSavedAt(new Date());
      qc.invalidateQueries({ queryKey: ["workflow", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const trigger = useMutation({
    mutationFn: () => workflowApi.run(id),
    onSuccess: (r) => {
      toast.success(`Run ${r.run_id} started`);
      navigate({ to: "/runs/$runId", params: { runId: r.run_id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not trigger run"),
  });

  const validationIssues = React.useMemo(() => {
    if (!nodes || !wf.data) return [];
    const issues: string[] = [];
    if (!nodes.some((n) => n.kind === "source")) issues.push("Workflow has no trigger node.");
    if (!nodes.some((n) => n.kind === "sink"))
      issues.push("Workflow has no terminal artifact node.");
    if (nodes.length < 3) issues.push("Workflow has fewer than three nodes — likely incomplete.");
    return issues;
  }, [nodes, wf.data]);

  return (
    <StateView loading={wf.isLoading} error={wf.error}>
      {wf.data && nodes && (
        <div className="flex flex-col h-[calc(100vh-7rem)]">
          {/* save bar */}
          <GlassPanel padding="none" className="flex items-center gap-3 px-4 h-14 mb-3">
            <GlassButton asChild variant="ghost" size="sm">
              <Link to="/workflows/$id" params={{ id }}>
                <ArrowLeft className="size-4" /> Back
              </Link>
            </GlassButton>
            <div className="h-6 w-px bg-white/10" />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate text-chrome">{wf.data.name}</div>
              <div className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                v{wf.data.version} · {wf.data.status}
                {dirty ? " · unsaved" : savedAt ? " · saved" : ""}
              </div>
            </div>
            <div className="flex-1" />
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={() => trigger.mutate()}
              disabled={trigger.isPending}
            >
              <Play /> {trigger.isPending ? "Starting…" : "Run"}
            </GlassButton>
            <GlassButton
              variant="rim"
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending || !dirty}
            >
              <Save /> {save.isPending ? "Saving…" : "Save"}
            </GlassButton>
          </GlassPanel>

          <div className="grid grid-cols-[180px_1fr_300px] gap-3 flex-1 min-h-0">
            {/* palette */}
            <GlassPanel padding="md" className="overflow-y-auto">
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-3">
                Palette
              </div>
              <div className="space-y-1.5">
                {PALETTE.map((p) => (
                  <button
                    key={p.kind}
                    onClick={() => addNode(p.kind, p.label)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 hover:border-rim/40 hover:bg-white/[0.06] text-left text-xs"
                  >
                    <Plus className="size-3.5 text-rim" />
                    <span className="font-mono uppercase tracking-widest text-[10px] text-muted-foreground">
                      {p.kind}
                    </span>
                    <span className="ml-auto">{p.label}</span>
                  </button>
                ))}
              </div>

              <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mt-6 mb-3">
                Versions
              </div>
              <ul className="space-y-1 text-xs">
                {[wf.data.version, wf.data.version - 1, wf.data.version - 2].map((v) => (
                  <li
                    key={v}
                    className={cn(
                      "px-3 py-2 rounded-lg flex items-center gap-2",
                      v === wf.data.version
                        ? "bg-white/[0.06] text-foreground"
                        : "text-muted-foreground hover:bg-white/[0.04]",
                    )}
                  >
                    <GitBranch className="size-3 text-rim/70" /> v{v}
                  </li>
                ))}
              </ul>
            </GlassPanel>

            {/* canvas + validation */}
            <div className="flex flex-col gap-3 min-h-0">
              <div className="flex-1 min-h-0">
                <WorkflowCanvas
                  workflow={{ nodes, edges: wf.data.edges }}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </div>
              <GlassPanel padding="md" className="shrink-0 max-h-[200px] overflow-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
                    Validation & history
                  </div>
                  <History className="size-3.5 text-muted-foreground" />
                </div>
                {validationIssues.length === 0 ? (
                  <p className="text-xs text-emerald-300/80">All checks pass. Ready to run.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {validationIssues.map((i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-amber-200/90">
                        <AlertTriangle className="size-3.5 mt-0.5 shrink-0" /> {i}
                      </li>
                    ))}
                  </ul>
                )}
              </GlassPanel>
            </div>

            {/* inspector */}
            <GlassPanel padding="md" className="overflow-y-auto">
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-3">
                Inspector
              </div>
              {activeNode ? (
                <div className="space-y-3">
                  <Field label="Label">
                    <GlassInput
                      value={activeNode.label}
                      onChange={(e) => updateNode({ label: e.target.value })}
                    />
                  </Field>
                  <Field label="Role">
                    <GlassInput
                      value={activeNode.role ?? ""}
                      onChange={(e) => updateNode({ role: e.target.value })}
                      placeholder="researcher"
                    />
                  </Field>
                  <Field label="Kind">
                    <div className="font-mono text-xs text-rim/90 uppercase">{activeNode.kind}</div>
                  </Field>
                  <Field label="Node ID">
                    <div className="font-mono text-xs text-muted-foreground">{activeNode.id}</div>
                  </Field>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Click a node to edit, or pick from the palette to add one.
                </div>
              )}
              <div className="mt-6 pt-4 border-t border-white/5">
                <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-2">
                  Contract
                </div>
                <pre className="text-[10px] font-mono text-foreground/80 glass-inset rounded-lg p-3 overflow-auto">
                  {JSON.stringify(wf.data.contract, null, 2)}
                </pre>
              </div>
            </GlassPanel>
          </div>
        </div>
      )}
    </StateView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
