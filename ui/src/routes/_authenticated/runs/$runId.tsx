import * as React from "react";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  AlertOctagon,
  Archive,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Hash,
  LayoutTemplate,
  Printer,
  RotateCw,
  Timer,
} from "lucide-react";
import { PageHeader } from "@/components/glass/Primitives";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { StateView, StatusChip } from "@/components/glass/StateView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { workflowApi } from "@/lib/adapters";
import type { Artifact, RunEvent, WorkflowResultOutput } from "@/lib/adapters/types";

export const Route = createFileRoute("/_authenticated/runs/$runId")({
  head: () => ({ meta: [{ title: "Run - 0101" }] }),
  component: RunDetail,
});

function RunDetail() {
  const { runId } = useParams({ from: "/_authenticated/runs/$runId" });
  const qc = useQueryClient();

  const run = useQuery({
    queryKey: ["run-output", runId],
    queryFn: () => workflowApi.getRunOutput(runId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" || status === "awaiting_approval"
        ? 2000
        : false;
    },
    refetchIntervalInBackground: true,
  });

  const result = useQuery({
    queryKey: ["workflow-result", run.data?.workflow_id, runId],
    queryFn: () => workflowApi.getWorkflowResult(run.data!.workflow_id, runId),
    enabled: Boolean(run.data?.workflow_id),
    refetchInterval: (query) => {
      const status = run.data?.status ?? (query.state.data ? "running" : "queued");
      return status === "queued" || status === "running" || status === "awaiting_approval"
        ? 2000
        : false;
    },
    refetchIntervalInBackground: true,
  });

  const preview = useQuery({
    queryKey: ["workflow-preview", run.data?.workflow_id, runId],
    queryFn: () => workflowApi.getWorkflowPreview(run.data!.workflow_id).catch(() => ""),
    enabled: Boolean(run.data?.workflow_id),
  });

  const rerun = useMutation({
    mutationFn: () => workflowApi.rerun(runId),
    onSuccess: ({ run_id }) => {
      toast.success(`Re-run queued: ${run_id}`);
      qc.invalidateQueries({ queryKey: ["run-output", runId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not re-run"),
  });

  const exportPackage = useMutation({
    mutationFn: async () => {
      if (!run.data?.workflow_id) throw new Error("Workflow id missing.");
      const blob = await workflowApi.exportWorkflowPackage(run.data.workflow_id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${run.data.workflow_name ?? run.data.workflow_id}-package.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not export package"),
  });

  const outputs = result.data?.outputs ?? [];
  const events = mergeEvents(
    run.data?.events ?? [],
    result.data?.events ?? [],
    result.data?.messages ?? [],
  );
  const files = [...(result.data?.files ?? []), ...(run.data?.artifacts ?? [])];
  const hasPreview = Boolean(preview.data?.trim());

  return (
    <div>
      <div className="no-print">
        <PageHeader
          kicker={`Run${run.data?.workflow_name ? ` · ${run.data.workflow_name}` : ""}`}
          title={runId.slice(0, 12)}
          subtitle={
            run.data
              ? `${run.data.status.replace(/_/g, " ")} · ${run.data.audit.actor}`
              : "Loading..."
          }
          actions={
            <>
              <GlassButton
                variant="glass"
                onClick={() => rerun.mutate()}
                disabled={rerun.isPending}
              >
                <RotateCw /> {rerun.isPending ? "Re-running..." : "Re-run"}
              </GlassButton>
              <GlassButton variant="glass" onClick={() => window.print()}>
                <Printer /> Export PDF
              </GlassButton>
              <GlassButton
                variant="glass"
                onClick={() => exportPackage.mutate()}
                disabled={exportPackage.isPending || !run.data?.workflow_id}
              >
                <Archive /> Package
              </GlassButton>
              {run.data?.workflow_id && (
                <GlassButton asChild variant="ghost">
                  <Link to="/workflows/$id" params={{ id: run.data.workflow_id }}>
                    Open workflow
                  </Link>
                </GlassButton>
              )}
            </>
          }
        />
      </div>

      <StateView loading={run.isLoading} error={run.error}>
        {run.data && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 no-print">
              <StatTile label="Status" value={<StatusChip status={run.data.status} />} />
              <StatTile
                label="Trace"
                icon={<Hash className="size-3.5" />}
                value={<span className="font-mono text-base">{run.data.audit.trace_id}</span>}
              />
              <StatTile
                label="Duration"
                icon={<Timer className="size-3.5" />}
                value={run.data.duration_ms ? `${(run.data.duration_ms / 1000).toFixed(2)}s` : "-"}
              />
              <StatTile
                label="Outputs"
                value={outputs.length || (run.data.output_markdown ? 1 : 0)}
              />
            </div>

            {run.data.failed_node && (
              <GlassPanel padding="lg" className="border-red-400/30 bg-red-400/[0.04] no-print">
                <div className="flex items-start gap-3">
                  <AlertOctagon className="size-5 text-red-300 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-mono text-[10px] tracking-widest text-red-300/80 uppercase mb-1">
                      Failed at · {run.data.failed_node.role}
                    </div>
                    <h3 className="text-lg font-semibold tracking-tight mb-1">
                      {run.data.failed_node.label}
                    </h3>
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {run.data.failure_reason}
                    </p>
                  </div>
                </div>
              </GlassPanel>
            )}

            <Tabs defaultValue="outputs" className="no-print">
              <TabsList className="glass border border-white/10">
                <TabsTrigger value="outputs">Agent Outputs</TabsTrigger>
                {hasPreview && <TabsTrigger value="preview">Preview</TabsTrigger>}
                <TabsTrigger value="report">PDF Report</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
              </TabsList>

              <TabsContent value="outputs" className="mt-4">
                <AgentOutputs outputs={outputs} fallback={run.data.output_markdown} />
              </TabsContent>

              {hasPreview && (
                <TabsContent value="preview" className="mt-4">
                  <GlassPanel padding="none" className="overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <LayoutTemplate className="size-4 text-rim" /> Live preview
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Rendered from backend preview HTML
                      </span>
                    </div>
                    <iframe
                      title="Workflow preview"
                      srcDoc={preview.data}
                      className="w-full h-[680px] bg-white"
                      sandbox="allow-same-origin"
                    />
                  </GlassPanel>
                </TabsContent>
              )}

              <TabsContent value="report" className="mt-4">
                <GlassPanel padding="lg">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                      <div className="text-sm font-medium flex items-center gap-2">
                        <Printer className="size-4 text-rim" /> PDF Report
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Browser-native export. The printed page hides navigation and includes all
                        outputs.
                      </p>
                    </div>
                    <GlassButton variant="rim" onClick={() => window.print()}>
                      <Printer /> Export PDF
                    </GlassButton>
                  </div>
                  <ReportBody
                    title={run.data.workflow_name ?? run.data.workflow_id}
                    runId={run.data.run_id}
                    status={run.data.status}
                    outputs={outputs}
                    events={events}
                    files={files}
                  />
                </GlassPanel>
              </TabsContent>

              <TabsContent value="timeline" className="mt-4">
                <Timeline events={events} />
              </TabsContent>

              <TabsContent value="files" className="mt-4">
                <Files files={files} onExport={() => exportPackage.mutate()} />
              </TabsContent>
            </Tabs>

            <div className="print-report">
              <ReportBody
                title={run.data.workflow_name ?? run.data.workflow_id}
                runId={run.data.run_id}
                status={run.data.status}
                outputs={outputs}
                events={events}
                files={files}
              />
            </div>
          </div>
        )}
      </StateView>
    </div>
  );
}

function AgentOutputs({
  outputs,
  fallback,
}: {
  outputs: WorkflowResultOutput[];
  fallback?: string;
}) {
  if (!outputs.length && !fallback) {
    return (
      <GlassPanel padding="lg">
        <p className="text-sm text-muted-foreground py-12 text-center">
          No agent outputs found yet. If the run is still active, refresh once it finishes.
        </p>
      </GlassPanel>
    );
  }

  const cards =
    outputs.length > 0
      ? outputs
      : [
          {
            node_id: "final-output",
            label: "Final output",
            markdown: fallback ?? "",
            files: [],
          } satisfies WorkflowResultOutput,
        ];

  return (
    <div className="grid xl:grid-cols-2 gap-4">
      {cards.map((output, index) => (
        <OutputCard key={`${output.node_id}-${index}`} output={output} index={index} />
      ))}
    </div>
  );
}

function OutputCard({ output, index }: { output: WorkflowResultOutput; index: number }) {
  return (
    <GlassPanel padding="lg">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
            Agent {index + 1} · {output.role ?? output.node_id}
          </div>
          <h3 className="text-lg font-semibold tracking-tight text-chrome mt-1">{output.label}</h3>
        </div>
        {output.completed_at && (
          <div className="text-xs text-muted-foreground font-mono">
            {new Date(output.completed_at).toLocaleTimeString()}
          </div>
        )}
      </div>
      {output.selection_reason && (
        <p className="text-sm text-foreground/75 mb-3 leading-relaxed">{output.selection_reason}</p>
      )}
      <pre className="text-sm text-foreground/86 glass-inset rounded-xl p-4 overflow-auto max-h-[520px] whitespace-pre-wrap font-sans leading-relaxed">
        {output.markdown || "No markdown output was returned for this agent."}
      </pre>
      {!!output.files.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {output.files.map((file) => (
            <span
              key={file.id}
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted-foreground"
            >
              {file.name}
            </span>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

function Timeline({ events }: { events: RunEvent[] }) {
  return (
    <GlassPanel padding="lg">
      <div className="text-sm font-medium mb-4 flex items-center gap-2">
        <Activity className="size-4 text-rim" /> Timeline
      </div>
      {events.length ? (
        <ol className="space-y-3">
          {events.map((ev, i) => (
            <li key={`${ev.at}-${i}`} className="flex gap-4">
              <div className="font-mono text-[10px] text-muted-foreground tabular-nums w-32 shrink-0 pt-1">
                {new Date(ev.at).toLocaleTimeString()}
              </div>
              <div className="size-2 rounded-full bg-rim/60 mt-2 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground/85">{ev.title}</div>
                {ev.detail && (
                  <div className="text-xs text-muted-foreground mt-0.5">{ev.detail}</div>
                )}
                <div className="font-mono text-[10px] text-rim/70 mt-0.5">{ev.kind}</div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground py-8 text-center">No timeline events yet.</p>
      )}
    </GlassPanel>
  );
}

function Files({ files, onExport }: { files: Artifact[]; onExport: () => void }) {
  return (
    <GlassPanel padding="lg">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="text-sm font-medium flex items-center gap-2">
          <Download className="size-4 text-rim" /> Files
        </div>
        <GlassButton variant="glass" onClick={onExport}>
          <Archive /> Export package
        </GlassButton>
      </div>
      {files.length ? (
        <ul className="grid md:grid-cols-2 gap-3">
          {files.map((file, index) => (
            <li
              key={`${file.id}-${index}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-mono text-foreground/85 truncate">{file.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono truncate">
                  {file.size_bytes ? `${(file.size_bytes / 1024).toFixed(1)} kB` : "artifact"} ·{" "}
                  {file.sha256?.slice(0, 10) ?? file.path}
                </div>
              </div>
              {file.path && (
                <a
                  href={file.path}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-rim"
                >
                  <ExternalLink className="size-4" />
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No discrete files returned. Use the package export for the full audit bundle.
        </p>
      )}
    </GlassPanel>
  );
}

function ReportBody({
  title,
  runId,
  status,
  outputs,
  events,
  files,
}: {
  title: string;
  runId: string;
  status: string;
  outputs: WorkflowResultOutput[];
  events: RunEvent[];
  files: Artifact[];
}) {
  return (
    <article className="space-y-6">
      <header className="border-b border-white/10 pb-4">
        <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
          0101 Run Report
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-chrome mt-2">{title}</h2>
        <div className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
          <ReportMeta label="Run" value={runId} />
          <ReportMeta label="Status" value={status.replace(/_/g, " ")} />
          <ReportMeta label="Generated" value={new Date().toLocaleString()} />
        </div>
      </header>

      <section>
        <h3 className="text-lg font-semibold mb-3">Agent outputs</h3>
        <div className="space-y-4">
          {outputs.length ? (
            outputs.map((output, index) => (
              <div
                key={`${output.node_id}-${index}`}
                className="rounded-xl border border-white/10 p-4"
              >
                <div className="text-xs font-mono text-muted-foreground uppercase">
                  {output.role ?? output.node_id}
                </div>
                <h4 className="font-semibold mt-1">{output.label}</h4>
                {output.selection_reason && (
                  <p className="text-sm text-muted-foreground mt-2">{output.selection_reason}</p>
                )}
                <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {output.markdown || "No output returned."}
                </pre>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No agent outputs were returned.</p>
          )}
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-lg font-semibold mb-3">Timeline</h3>
          <ul className="space-y-2 text-sm">
            {events.slice(0, 20).map((event, index) => (
              <li key={`${event.at}-${index}`}>
                <span className="font-mono text-muted-foreground">
                  {new Date(event.at).toLocaleTimeString()}
                </span>{" "}
                {event.title}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-3">Files</h3>
          <ul className="space-y-2 text-sm">
            {files.length ? (
              files.map((file, index) => <li key={`${file.id}-${index}`}>{file.name}</li>)
            ) : (
              <li className="text-muted-foreground">No files returned.</li>
            )}
          </ul>
        </div>
      </section>
    </article>
  );
}

function ReportMeta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
        {label}
      </div>
      <div className="text-sm mt-1 break-all">{value}</div>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <GlassPanel padding="md">
      <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-xl font-semibold tracking-tight text-chrome">{value}</div>
      {hint && (
        <div className="text-[11px] text-muted-foreground mt-1 font-mono truncate">{hint}</div>
      )}
    </GlassPanel>
  );
}

function mergeEvents(...groups: RunEvent[][]) {
  return groups
    .flat()
    .filter(Boolean)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
