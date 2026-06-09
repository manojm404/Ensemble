import { createFileRoute, useParams, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  FileText,
  GitBranch,
  Pencil,
  Play,
  Route as RouteIcon,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/glass/Primitives";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { StateView, StatusChip } from "@/components/glass/StateView";
import { workflowApi } from "@/lib/adapters";
import type { WorkflowNode } from "@/lib/adapters/types";

export const Route = createFileRoute("/_authenticated/workflows/$id")({
  head: () => ({ meta: [{ title: "Workflow - 0101" }] }),
  component: WorkflowDetail,
});

function WorkflowDetail() {
  const { id } = useParams({ from: "/_authenticated/workflows/$id" });
  const qc = useQueryClient();
  const router = useRouter();

  const wf = useQuery({
    queryKey: ["workflow", id],
    queryFn: () => workflowApi.getById(id),
  });

  const runs = useQuery({
    queryKey: ["workflow-runs", id],
    queryFn: () => workflowApi.listRuns(id),
  });

  const latestRun = runs.data?.[0];

  async function triggerRun() {
    if (!wf.data) return;
    try {
      const data = await workflowApi.run(id);
      toast.success("Run started.");
      router.navigate({ to: "/runs/$runId", params: { runId: data.run_id } });
    } catch (err) {
      return toast.error(err instanceof Error ? err.message : "Failed to run workflow");
    }
    qc.invalidateQueries({ queryKey: ["workflow-runs", id] });
  }

  async function deleteWorkflow() {
    if (!wf.data) return;
    if (!confirm(`Delete "${wf.data.name}"? This cannot be undone.`)) return;
    try {
      await workflowApi.delete(id);
      toast.success("Workflow deleted.");
      router.navigate({ to: "/workflows" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete workflow");
    }
  }

  return (
    <div>
      <PageHeader
        kicker={`Workflow${wf.data?.company_name ? ` · ${wf.data.company_name}` : ""}`}
        title={wf.data?.name ?? "Loading..."}
        subtitle={
          wf.data?.description ?? "Selected agents, routing reasons, and latest run output."
        }
        actions={
          <>
            <GlassButton asChild variant="glass" disabled={!wf.data}>
              <Link to="/workflows/$id/edit" params={{ id }}>
                <Pencil /> Advanced edit
              </Link>
            </GlassButton>
            <GlassButton variant="rim" onClick={triggerRun} disabled={!wf.data}>
              <Play /> Run
            </GlassButton>
            {latestRun && (
              <GlassButton asChild variant="primary">
                <Link to="/runs/$runId" params={{ runId: latestRun.run_id }}>
                  <FileText /> View output
                </Link>
              </GlassButton>
            )}
            <GlassButton
              variant="ghost"
              onClick={deleteWorkflow}
              disabled={!wf.data}
              aria-label="Delete workflow"
            >
              <Trash2 />
            </GlassButton>
          </>
        }
      />

      <StateView loading={wf.isLoading || runs.isLoading} error={wf.error ?? runs.error}>
        {wf.data && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              <Stat label="Status" value={<StatusChip status={wf.data.status} />} />
              <Stat label="Agents" value={wf.data.nodes.length} />
              <Stat
                label="Latest run"
                value={latestRun ? latestRun.status.replace(/_/g, " ") : "none"}
                hint={
                  latestRun ? new Date(latestRun.started_at).toLocaleString() : "Run this workflow"
                }
              />
            </div>

            <div className="grid lg:grid-cols-[1fr_360px] gap-4">
              <GlassPanel padding="lg">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <RouteIcon className="size-4 text-rim" /> Selected agents
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {wf.data.edges.length} handoffs
                  </span>
                </div>
                <div className="space-y-3">
                  {wf.data.nodes.map((node, index) => (
                    <AgentRouteCard key={node.id} node={node} index={index} />
                  ))}
                </div>
              </GlassPanel>

              <div className="space-y-4">
                <GlassPanel padding="lg">
                  <div className="text-sm font-medium flex items-center gap-2 mb-3">
                    <GitBranch className="size-4 text-rim" /> Runs
                  </div>
                  {runs.data && runs.data.length > 0 ? (
                    <ul className="space-y-2">
                      {runs.data.slice(0, 6).map((run) => (
                        <li
                          key={run.run_id}
                          className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <Link
                              to="/runs/$runId"
                              params={{ runId: run.run_id }}
                              className="font-mono text-sm text-foreground/85 hover:text-rim"
                            >
                              {run.run_id.slice(0, 10)}
                            </Link>
                            <StatusChip status={run.status} />
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">
                            {new Date(run.started_at).toLocaleString()}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No runs yet. Run it once to generate agent outputs.
                    </p>
                  )}
                </GlassPanel>

                <GlassPanel padding="lg">
                  <div className="text-sm font-medium mb-3">Next action</div>
                  <div className="space-y-2">
                    <GlassButton className="w-full" variant="rim" onClick={triggerRun}>
                      <Play /> Run workflow
                    </GlassButton>
                    {latestRun && (
                      <GlassButton asChild className="w-full" variant="glass">
                        <Link to="/runs/$runId" params={{ runId: latestRun.run_id }}>
                          View latest output <ArrowRight />
                        </Link>
                      </GlassButton>
                    )}
                  </div>
                </GlassPanel>
              </div>
            </div>
          </div>
        )}
      </StateView>
    </div>
  );
}

function AgentRouteCard({ node, index }: { node: WorkflowNode; index: number }) {
  const config = node.config ?? {};
  const reason = String(config.selection_reason ?? "Selected by the backend workflow router.");
  const contract = String(
    config.output_contract ??
      config.contract ??
      "Produce a reviewable output for the workflow package.",
  );
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start gap-4">
        <div className="size-9 rounded-full border border-white/10 bg-white/[0.045] grid place-items-center font-mono text-xs text-rim">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-chrome truncate">{node.label}</h3>
            <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-[10px] font-mono text-muted-foreground uppercase">
              {node.role ?? node.kind}
            </span>
          </div>
          <p className="text-sm text-foreground/78 mt-2 leading-relaxed">{reason}</p>
          <div className="mt-3 rounded-xl glass-inset p-3">
            <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-1">
              Output
            </div>
            <p className="text-sm text-foreground/82">{contract}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <GlassPanel padding="md">
      <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-2">
        {label}
      </div>
      <div className="text-xl font-semibold tracking-tight text-chrome capitalize">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1 truncate">{hint}</div>}
    </GlassPanel>
  );
}
