import { useState, useEffect, useMemo } from "react";
import { Plus, Search, GitBranch, Clock, Bot, Trash2, RotateCcw, CheckCircle2, AlertCircle, FileText, Sparkles, Play, ExternalLink, Loader2, ShieldCheck, Layers3, Target, Archive, ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { useTabContext } from "@/lib/tab-context";
import { useScrollMemory } from "@/lib/use-scroll-memory";
import { fetchApi, deleteWorkflow, runWorkflowAPI, getWorkflowRunStatus, getWorkflowRunOutput, getWorkflowEvaluation } from "@/lib/api";
import { MotionCard, StaggerContainer, StaggerItem } from "@/components/ui/motion-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OutputViewer } from "@/components/workflow/OutputViewer";
import { toast } from "sonner";

const STORAGE_KEY = "ensemble_workflow_outputs";
const FAILURE_STORAGE_KEY = "ensemble_workflow_failures";
const GOVERNED_STAGES = ["Intake", "Brief", "Plan", "Route", "Execute", "Verify", "Package", "Preview", "Audit"];
const RUN_FILTERS = [
  { id: "all", label: "All workflows" },
  { id: "success", label: "Completed" },
  { id: "failed", label: "Needs repair" },
  { id: "none", label: "Ready to run" },
] as const;

const hasUsefulWorkflowOutput = (output: any) => {
  const markdown = output?.output?.markdown?.trim();
  const files = Array.isArray(output?.output?.files) ? output.output.files : [];
  const hasFiles = files.some((file: any) => file?.path && file?.content);
  return (!!markdown && markdown !== "# Workflow Results\n\nNo output returned.") || hasFiles;
};

interface WorkflowOutput {
  title: string;
  task: string;
  agentCount: number;
  output: {
    markdown?: string;
    files?: Array<{ path: string; content: string; language?: string }>;
    workflowId?: string;
  };
  completedAt: string;
}

interface WorkflowEvaluationCheck {
  name?: string;
  title?: string;
  status?: string;
  passed?: boolean;
  score?: number;
  max_score?: number;
  summary?: string;
  description?: string;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  agentCount: number;
  lastEdited: string;
  status: "draft" | "active" | "archived";
  graphJson?: string;
  planMetadata?: {
    domain_title?: string;
    domain_key?: string;
    prompt_summary?: string;
    routing_reason?: string;
    requested_agents?: number;
    generated_agents?: number;
    stage_plan?: Array<Record<string, any>>;
  } | null;
  runStatus: "success" | "failed" | "none";
  lastOutput?: WorkflowOutput | null;
  lastFailure?: { agentName: string; reason: string; stepId?: string | null; kind?: string | null; label?: string | null } | null;
  hasOutputsAvailable?: boolean;
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-400/20 text-emerald-400",
  draft: "bg-badge-orange/20 text-badge-orange",
  archived: "bg-muted text-muted-foreground",
};

const Workflows = () => {
  const [search, setSearch] = useState("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [viewingOutput, setViewingOutput] = useState<Workflow | null>(null);
  const [viewingEvaluation, setViewingEvaluation] = useState<any>(null);
  const [runningWorkflowId, setRunningWorkflowId] = useState<string | null>(null);
  const [runFilter, setRunFilter] = useState<(typeof RUN_FILTERS)[number]["id"]>("all");
  const navigate = useNavigate();
  const { openRouteTab } = useTabContext();
  const scrollRef = useScrollMemory("esemble_scroll_workflows");

  const failureBadgeClass = (kind?: string | null) => {
    switch ((kind || "").toLowerCase()) {
      case "provider":
        return "border-rose-500/20 bg-rose-500/10 text-rose-600";
      case "validation":
        return "border-amber-500/20 bg-amber-500/10 text-amber-600";
      case "approval":
        return "border-amber-500/20 bg-amber-500/10 text-amber-600";
      case "governance":
        return "border-orange-500/20 bg-orange-500/10 text-orange-600";
      default:
        return "border-rose-500/20 bg-rose-500/10 text-rose-600";
    }
  };

  useEffect(() => {
    const savedSearch = localStorage.getItem("esemble_workflows_search");
    if (savedSearch) setSearch(savedSearch);
  }, []);

  useEffect(() => {
    localStorage.setItem("esemble_workflows_search", search);
  }, [search]);

  useEffect(() => {
    Promise.all([
      fetchApi('/api/workflows'),
      fetchApi('/api/workflow-runs/outputs').catch(() => ({ outputs: {}, total: 0 }))
    ])
      .then(([wfData, outputsData]) => {
        if (wfData && Array.isArray(wfData)) {
          const backendOutputs = outputsData?.outputs || {};
          const hasAnyOutputs = Object.keys(backendOutputs).length > 0;
          
          // Also check localStorage
          let lsOutputs: Record<string, any> = {};
          try {
            const lsRaw = localStorage.getItem(STORAGE_KEY);
            if (lsRaw) {
              lsOutputs = JSON.parse(lsRaw);
            }
          } catch { /* ignore */ }

          let lsFailures: Record<string, any> = {};
          try {
            const lsRaw = localStorage.getItem(FAILURE_STORAGE_KEY);
            if (lsRaw) {
              lsFailures = JSON.parse(lsRaw);
            }
          } catch { /* ignore */ }
          
          const allOutputs = { ...backendOutputs, ...lsOutputs };
          
          const loaded = wfData.map((w: any) => {
            let lastEditedStr = 'Unknown';
            if (w.updated_at) {
              const d = new Date(w.updated_at);
              lastEditedStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            let agentCount = 0;
            let planMetadata = null;
            try {
              const graph = typeof w.graph_json === 'string' ? JSON.parse(w.graph_json) : w.graph_json;
              agentCount = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
              planMetadata = graph?.metadata || null;
            } catch { agentCount = 0; }

            // Merge outputs: trust server data if available, fallback to localStorage
            const serverOutput = backendOutputs[w.id];
            const lsOutput = lsOutputs[w.id];
            const finalOutput = hasUsefulWorkflowOutput(serverOutput) ? serverOutput : lsOutput;
            const hasOutput = hasUsefulWorkflowOutput(finalOutput);
            
            return {
              id: w.id,
              name: w.name,
              description: "Custom Esemble Workflow",
              agentCount,
              lastEdited: lastEditedStr,
              status: "active" as const,
              graphJson: w.graph_json,
              planMetadata,
              runStatus: hasOutput ? "success" : "none",
              lastOutput: hasOutput ? {
                ...finalOutput,
                output: {
                  ...finalOutput.output,
                  workflowId: w.id,
                  files: normalizeFiles(finalOutput.output?.files || []),
                },
              } : null,
              lastFailure: lsFailures[w.id] || null,
              hasOutputsAvailable: hasOutput
            };
          });
          setWorkflows(loaded);
        }
      })
      .catch(console.error);
  }, []);

  const dashboardMetrics = useMemo(() => {
    const completed = workflows.filter((workflow) => workflow.runStatus === "success").length;
    const failed = workflows.filter((workflow) => workflow.runStatus === "failed").length;
    const ready = workflows.filter((workflow) => workflow.runStatus === "none").length;
    const agents = workflows.reduce((total, workflow) => total + workflow.agentCount, 0);
    return { completed, failed, ready, agents };
  }, [workflows]);

  const filtered = workflows.filter((w) => {
    const matchesSearch = `${w.name} ${w.description} ${w.planMetadata?.domain_title || ""} ${w.planMetadata?.routing_reason || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesFilter = runFilter === "all" || w.runStatus === runFilter;
    return matchesSearch && matchesFilter;
  });

  const normalizeFiles = (files: any[] = []) => {
    const seen = new Set<string>();
    return files
      .filter((file) => file?.content && file?.path && !String(file.path).includes("/.git/"))
      .sort((a, b) => String(a.path).startsWith("repo/") ? -1 : String(b.path).startsWith("repo/") ? 1 : 0)
      .map((file) => {
        const rawPath = String(file.path).replace(/^repo\//, "");
        return { ...file, path: rawPath };
      })
      .filter((file) => {
        const key = String(file.content);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await deleteWorkflow(id);
      setWorkflows(prev => prev.filter(w => w.id !== id));
      toast.success(`Deleted "${name}"`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete workflow");
    }
  };

  const handleRerun = (e: React.MouseEvent, wf: Workflow) => {
    e.stopPropagation();
    handleRunFromList(e, wf);
  };

  const handleViewOutput = async (e: React.MouseEvent, wf: Workflow) => {
    e.stopPropagation();
    
    if (wf.lastOutput?.output?.markdown || (Array.isArray(wf.lastOutput?.output?.files) && wf.lastOutput.output.files.length > 0)) {
      setViewingOutput({
        ...wf,
        lastOutput: {
          ...wf.lastOutput,
          output: {
            ...wf.lastOutput.output,
            workflowId: wf.id,
            files: normalizeFiles(wf.lastOutput.output.files || []),
          },
        },
        });
      setViewingEvaluation(null);
      try {
        const [backendOutput, evaluation] = await Promise.all([
          getWorkflowRunOutput(wf.id),
          getWorkflowEvaluation(wf.id).catch(() => null),
        ]);
        const files = normalizeFiles(backendOutput?.files || backendOutput?.latest?.output?.files || wf.lastOutput.output.files || []);
        const refreshed: Workflow = {
          ...wf,
          lastOutput: {
            ...wf.lastOutput,
            output: {
              ...wf.lastOutput.output,
              markdown: wf.lastOutput.output.markdown || backendOutput?.latest?.output?.markdown,
              files,
              workflowId: wf.id,
            },
          },
        };
        setViewingOutput(refreshed);
        setViewingEvaluation(evaluation);
      } catch {
        // Keep the cached output open; preview may still be available by workflow ID.
      }
    } else {
      toast.warning("No output found for this workflow. Run it to generate output.");
    }
  };

  const getWorkflowTask = (wf: Workflow, graph: any) => {
    const firstPrompt = graph?.nodes?.find((node: any) => node?.data?.prompt)?.data?.prompt;
    return firstPrompt || wf.lastOutput?.task || wf.name;
  };

  const handleRunFromList = async (e: React.MouseEvent, wf: Workflow) => {
    e.stopPropagation();
    if (runningWorkflowId) return;
    let failureDetails: { agentName: string; reason: string; stepId?: string | null } | null = null;

    try {
      setRunningWorkflowId(wf.id);
      const graph = typeof wf.graphJson === "string" ? JSON.parse(wf.graphJson) : wf.graphJson;
      const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
      const edges = Array.isArray(graph?.edges) ? graph.edges : [];
      if (!nodes.length) {
        toast.error("This workflow has no agents on the canvas.");
        return;
      }

      const task = getWorkflowTask(wf, graph);
      toast.info(`Running "${wf.name}"`);
      const run = await runWorkflowAPI({ id: wf.id, nodes, edges, initialInput: task });

      let status: Awaited<ReturnType<typeof getWorkflowRunStatus>> | null = null;
      for (let attempt = 0; attempt < 180; attempt++) {
        status = await getWorkflowRunStatus(run.run_id);
        setWorkflows((prev) => prev.map((item) => (
          item.id === wf.id
            ? { ...item, runStatus: status?.status === "failed" ? "failed" : item.runStatus }
            : item
        )));

        if ((status.status || "").toLowerCase() === "completed") break;
        if ((status.status || "").toLowerCase() === "failed") {
          const failedStep = status.node_statuses?.find((item: any) => item.status === "failed");
          const failedAgent = failedStep?.label || failedStep?.role || status.current_node_label || status.current_node || "an unknown agent";
          const rawError = failedStep?.error || "";
          const cleanError = String(rawError)
            .replace(/^Error:\s*/i, "")
            .replace(/^Error calling [^:]+:\s*/i, "")
            .split("\n")[0]
            .slice(0, 180);
          failureDetails = {
            agentName: failedAgent,
            reason: cleanError || "The backend reported a failed step.",
            stepId: failedStep?.node_id || status.current_node || null,
            kind: failedStep?.failure_kind || status.failure_kind || null,
            label: failedStep?.failure_label || status.failure_label || null,
          };
          throw new Error(`${failedAgent} failed${cleanError ? `: ${cleanError}` : ""}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1400));
      }

      if (!status || (status.status || "").toLowerCase() !== "completed") {
        throw new Error("Workflow timed out before completion.");
      }

      const backendOutput = await getWorkflowRunOutput(wf.id, run.run_id);
      const outputs = Array.isArray(backendOutput?.outputs) ? backendOutput.outputs : [];
      const markdown = outputs
        .map((item: any, index: number) => `### Step ${index + 1}: ${item.node_id || item.agent_id || "Agent"}\n\n${item.output?.markdown || ""}`)
        .join("\n\n---\n\n");

      const completedOutput: WorkflowOutput = {
        title: wf.name,
        task,
        agentCount: status.total_steps || wf.agentCount,
        output: {
          markdown: markdown || backendOutput?.latest?.output?.markdown || "# Workflow Results\n\nNo output returned.",
          files: normalizeFiles(backendOutput?.files || backendOutput?.latest?.output?.files || []),
          workflowId: wf.id,
        },
        completedAt: new Date().toISOString(),
      };

      setWorkflows((prev) => prev.map((item) => (
        item.id === wf.id
          ? { ...item, runStatus: "success", lastOutput: completedOutput, lastFailure: null }
          : item
      )));

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed[wf.id] = completedOutput;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        const failureRaw = localStorage.getItem(FAILURE_STORAGE_KEY);
        const failureParsed = failureRaw ? JSON.parse(failureRaw) : {};
        if (failureParsed[wf.id]) {
          delete failureParsed[wf.id];
          localStorage.setItem(FAILURE_STORAGE_KEY, JSON.stringify(failureParsed));
        }
      } catch { /* ignore */ }

      toast.success(`Workflow completed — ${status.completed_count}/${status.total_steps} step(s) finished`);
    } catch (err: any) {
      const storedFailure = failureDetails || { agentName: "Unknown agent", reason: err?.message || "Workflow failed to run", kind: "runtime", label: "Runtime issue" };
      setWorkflows((prev) => prev.map((item) => (
        item.id === wf.id
          ? { ...item, runStatus: "failed", lastFailure: storedFailure }
          : item
      )));
      try {
        const raw = localStorage.getItem(FAILURE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed[wf.id] = storedFailure;
        localStorage.setItem(FAILURE_STORAGE_KEY, JSON.stringify(parsed));
      } catch { /* ignore */ }
      toast.error(err?.message || "Workflow failed to run");
    } finally {
      setRunningWorkflowId(null);
    }
  };

  const evaluationChecks = Array.isArray(viewingEvaluation?.checks) ? viewingEvaluation.checks : [];
  const evaluationScore = typeof viewingEvaluation?.score === "number" ? viewingEvaluation.score : 0;
  const evaluationMaxScore = typeof viewingEvaluation?.max_score === "number" ? viewingEvaluation.max_score : 6;
  const viewedPlan = (() => {
    try {
      return viewingOutput?.planMetadata || (viewingOutput?.graphJson ? JSON.parse(viewingOutput.graphJson)?.metadata : null);
    } catch {
      return viewingOutput?.planMetadata || null;
    }
  })();
  const plannedAgents = viewedPlan?.requested_agents || viewingOutput?.agentCount || 0;
  const generatedAgents = viewedPlan?.generated_agents || viewingOutput?.lastOutput?.agentCount || viewingOutput?.agentCount || 0;

  return (
    <div ref={scrollRef as any} className="flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_12%_10%,rgba(14,165,233,0.16),transparent_28%),radial-gradient(circle_at_88%_0%,rgba(16,185,129,0.10),transparent_24%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--background))_100%)] text-foreground">
      <div className="border-b border-border/55 bg-background/80 px-5 py-5 backdrop-blur-2xl xl:px-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-primary">
                Governed Workflow OS
              </Badge>
              <Badge variant="secondary" className="px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em]">
                CAS ready
              </Badge>
            </div>
            <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-[-0.045em] text-foreground md:text-4xl">
              Workflow Command Center
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-muted-foreground">
              Launch, rerun, repair, and inspect governed agent workflows without breaking the audit trail. Every card keeps the route, run state, output, and failure evidence close to the action.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row xl:items-end">
            <div className="relative w-full sm:w-[360px]">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, domain, route..."
                className="h-11 rounded-2xl border-border/60 bg-card/85 pl-10 shadow-sm"
              />
            </div>
            <Button className="h-11 gap-2 rounded-2xl px-5 font-bold shadow-[0_16px_36px_rgba(14,165,233,0.20)]" onClick={() => navigate("/workflows/new")}>
              <Plus className="h-4 w-4" /> New Workflow
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Completed runs", value: dashboardMetrics.completed, icon: CheckCircle2, tone: "text-emerald-600", surface: "bg-emerald-500/10 border-emerald-500/20" },
            { label: "Needs repair", value: dashboardMetrics.failed, icon: AlertCircle, tone: "text-rose-600", surface: "bg-rose-500/10 border-rose-500/20" },
            { label: "Ready to run", value: dashboardMetrics.ready, icon: Play, tone: "text-sky-600", surface: "bg-sky-500/10 border-sky-500/20" },
            { label: "Agents routed", value: dashboardMetrics.agents, icon: Bot, tone: "text-foreground", surface: "bg-card/80 border-border/60" },
          ].map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className={`rounded-[1.4rem] border ${metric.surface} p-4 shadow-sm backdrop-blur-xl`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">{metric.label}</p>
                  <Icon className={`h-4 w-4 ${metric.tone}`} />
                </div>
                <p className="mt-3 text-2xl font-black tracking-[-0.035em] text-foreground">{metric.value}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 overflow-hidden rounded-[1.35rem] border border-border/55 bg-card/70 p-3 shadow-sm backdrop-blur-xl">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">Operating model</p>
                <p className="truncate text-sm font-semibold text-foreground">Intake to Audit lifecycle for production-grade agent work</p>
              </div>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1 xl:pb-0">
              {GOVERNED_STAGES.map((stage, index) => (
                <div key={stage} className="flex shrink-0 items-center gap-1">
                  <div className="rounded-full border border-border/60 bg-background/75 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-foreground/70">
                    {stage}
                  </div>
                  {index < GOVERNED_STAGES.length - 1 && <div className="h-px w-4 bg-border/70" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {RUN_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setRunFilter(filter.id)}
              className={`rounded-full border px-4 py-2 text-xs font-bold transition-all ${
                runFilter === filter.id
                  ? "border-primary/30 bg-primary/10 text-primary shadow-sm"
                  : "border-border/60 bg-card/70 text-muted-foreground hover:border-primary/20 hover:text-foreground"
              }`}
            >
              {filter.label}
            </button>
          ))}
          <span className="ml-auto text-xs font-medium text-muted-foreground">
            Showing {filtered.length} of {workflows.length}
          </span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <StaggerContainer className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3 xl:p-8">
          {filtered.map((wf) => {
            const statusGlow = wf.runStatus === "success"
              ? "ring-1 ring-emerald-400/35 shadow-[0_24px_70px_rgba(16,185,129,0.10)]"
              : wf.runStatus === "failed"
                ? "ring-1 ring-rose-400/35 shadow-[0_24px_70px_rgba(244,63,94,0.10)]"
                : "";

            return (
              <StaggerItem key={wf.id}>
                <MotionCard
                className={`group relative flex min-h-[310px] flex-col justify-between overflow-hidden rounded-[1.8rem] border border-border/60 bg-card/85 p-5 transition-all duration-300 hover:border-primary/25 ${statusGlow}`}
                  onClick={() => {
                    openRouteTab({
                      id: `workflow-${wf.id}`,
                      title: wf.name,
                      url: `/workflows/${wf.id}`,
                      icon: GitBranch,
                      iconName: "GitBranch",
                      closable: true,
                    });
                    navigate(`/workflows/${wf.id}`);
                  }}
                >
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-emerald-400 to-cyan-300 opacity-70" />
                  <div>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 shadow-sm">
                          <GitBranch className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-black tracking-[-0.025em] text-foreground transition-colors group-hover:text-primary">{wf.name}</h3>
                          <p className="mt-0.5 truncate text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                            {wf.planMetadata?.domain_title || "Custom Workflow"}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge variant="secondary" className={`text-[10px] font-bold uppercase tracking-[0.16em] ${statusColors[wf.status]}`}>{wf.status}</Badge>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground/55 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                      </div>
                    </div>

                    <p className="mb-4 line-clamp-2 text-sm leading-6 text-muted-foreground">{wf.description}</p>

                    <div className="mb-4 grid grid-cols-3 gap-2">
                      <div className="rounded-2xl border border-border/45 bg-background/65 px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Agents</p>
                        <p className="mt-1 text-sm font-bold text-foreground">{wf.agentCount}</p>
                      </div>
                      <div className="rounded-2xl border border-border/45 bg-background/65 px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Plan</p>
                        <p className="mt-1 truncate text-sm font-bold text-foreground">{wf.planMetadata?.requested_agents || wf.agentCount || 0}</p>
                      </div>
                      <div className="rounded-2xl border border-border/45 bg-background/65 px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">State</p>
                        <p className="mt-1 truncate text-sm font-bold text-foreground">{wf.runStatus === "none" ? "Ready" : wf.runStatus}</p>
                      </div>
                    </div>

                    {wf.runStatus === "failed" && wf.lastFailure && (
                    <div className="mb-4 rounded-2xl border border-rose-500/15 bg-rose-500/5 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-600/80">Run failed</p>
                        <Badge variant="outline" className={`text-[9px] px-2 py-0.5 uppercase tracking-[0.18em] ${failureBadgeClass(wf.lastFailure.kind)}`}>
                          {wf.lastFailure.label || "Runtime issue"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs font-medium text-foreground truncate">
                        {wf.lastFailure.agentName} failed
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                        {wf.lastFailure.reason}
                      </p>
                    </div>
                    )}

                    <div className="mb-4 flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="border-border/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/70">
                        <Layers3 className="mr-1 h-3 w-3" />
                        {wf.planMetadata?.domain_title || "Custom Workflow"}
                      </Badge>
                      <Badge variant="secondary" className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]">
                        <Target className="mr-1 h-3 w-3" />
                        {wf.planMetadata?.requested_agents || wf.agentCount} agent plan
                      </Badge>
                      {wf.planMetadata?.routing_reason && (
                        <Badge variant="outline" className="border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                          Planner routed
                        </Badge>
                      )}
                    </div>
                    {wf.planMetadata?.routing_reason && (
                      <p className="mb-4 line-clamp-3 rounded-2xl border border-border/40 bg-background/55 p-3 text-[11px] leading-5 text-muted-foreground">
                        {wf.planMetadata.routing_reason}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-border/35 pt-4">
                    <div className="flex items-center gap-1">
                      {wf.runStatus === "success" ? (
                        <span className="flex items-center gap-1 text-emerald-600 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span className="font-medium">Completed</span>
                        </span>
                      ) : wf.runStatus === "failed" ? (
                        <span className="flex items-center gap-1 text-rose-500 text-xs">
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span className="font-medium">Failed</span>
                          {wf.lastFailure?.label && (
                            <Badge variant="outline" className={`ml-1 text-[9px] px-1.5 py-0.5 uppercase tracking-[0.16em] ${failureBadgeClass(wf.lastFailure.kind)}`}>
                              {wf.lastFailure.label}
                            </Badge>
                          )}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-foreground/65 text-xs">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Not run</span>
                        </span>
                      )}
                      <span className="ml-2 hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                        <Clock className="h-3 w-3" />
                        {wf.lastEdited}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {wf.runStatus === "success" && (
                        <button
                          onClick={(e) => handleViewOutput(e, wf)}
                          className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 text-emerald-600 text-xs font-medium transition-all hover:scale-105"
                          title="View output"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Output</span>
                        </button>
                      )}
                      {wf.runStatus === "none" ? (
                        <button
                          onClick={(e) => handleRunFromList(e, wf)}
                          disabled={runningWorkflowId === wf.id}
                          className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-foreground/90 hover:bg-foreground border border-foreground/90 text-background text-xs font-medium transition-all hover:scale-105 group/btn"
                          title="Run workflow"
                        >
                          {runningWorkflowId === wf.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5 transition-transform group-hover/btn:scale-110 duration-300" />
                          )}
                          <span className="hidden sm:inline">{runningWorkflowId === wf.id ? "Running" : "Run"}</span>
                        </button>
                      ) : (
                        <button
                          onClick={(e) => handleRerun(e, wf)}
                          className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-foreground/90 hover:bg-foreground border border-foreground/90 text-background text-xs font-medium transition-all hover:scale-105 group/btn"
                          title="Rerun workflow"
                        >
                          <RotateCcw className="h-3.5 w-3.5 transition-transform group-hover/btn:-rotate-180 duration-500" />
                          <span className="hidden sm:inline">Rerun</span>
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(e, wf.id, wf.name)}
                        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-foreground/55 hover:text-destructive transition-all"
                        title="Delete workflow"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </MotionCard>
              </StaggerItem>
            );
          })}
        </StaggerContainer>

        {filtered.length === 0 && (
          <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-[2rem] border border-primary/20 bg-card shadow-xl">
                {workflows.length === 0 ? <Archive className="h-8 w-8 text-primary" /> : <Search className="h-8 w-8 text-primary" />}
              </div>
            </div>
            <h2 className="mt-6 text-2xl font-black tracking-[-0.035em] text-foreground">
              {workflows.length === 0 ? "No workflows yet" : "No workflows match this view"}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {workflows.length === 0
                ? "Create a governed workflow and Ensemble will preserve the route, run output, failure state, and audit handoff for future reruns."
                : "Try a different search or status filter. Your workflows are still here; this command-center view is just narrowed."}
            </p>
            <Button className="mt-5 gap-2 rounded-2xl px-5 font-bold" onClick={() => navigate("/workflows/new")}>
              <Plus className="h-4 w-4" />
              Create workflow
            </Button>
          </div>
        )}
      </ScrollArea>

      {/* 🆕 Output Viewing Dialog */}
      <Dialog open={!!viewingOutput} onOpenChange={(open) => {
        if (!open) {
          setViewingOutput(null);
          setViewingEvaluation(null);
        }
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] p-0 overflow-hidden border-border/60 bg-card/95">
          <div className="bg-gradient-to-br from-background/80 via-transparent to-transparent p-6 pb-4 border-b border-border/60">
            <DialogHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <DialogTitle className="text-xl flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-emerald-400" />
                    </div>
                    {viewingOutput?.name} — Output
                  </DialogTitle>
                  <p className="text-xs text-foreground/65 max-w-2xl line-clamp-2">
                    {viewingOutput?.lastOutput?.task}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs gap-1.5 bg-muted/70 text-foreground/75 border border-border/60">
                    <Bot className="h-3 w-3" />
                    {generatedAgents} agents
                  </Badge>
                  {plannedAgents ? (
                    <Badge variant="outline" className="text-xs gap-1.5 text-foreground/65 border-border/60">
                      Planned {plannedAgents}
                    </Badge>
                  ) : null}
                  {viewingOutput?.lastOutput?.completedAt && (
                    <Badge variant="outline" className="text-xs gap-1.5 text-foreground/65 border-border/60">
                      <Clock className="h-3 w-3" />
                      {new Date(viewingOutput.lastOutput.completedAt).toLocaleString()}
                    </Badge>
                  )}
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="flex-1 min-h-[500px] h-[60vh] overflow-hidden relative">
            {viewingOutput?.lastOutput?.output?.markdown ? (
              <OutputViewer output={viewingOutput.lastOutput.output} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-foreground/55 py-20">
                <FileText className="h-12 w-12 opacity-20" />
                <p className="text-sm font-medium">Loading output...</p>
                <p className="text-xs">Fetching from server</p>
              </div>
            )}
          </div>

          {viewingEvaluation && (
            <div className="border-t border-border/40 bg-background/80 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Evaluation review</p>
                </div>
                <p className="text-xs text-foreground/65 max-w-3xl">
                  {viewingEvaluation.summary || "No evaluation summary available."}
                </p>
              </div>
                <Badge
                  variant="secondary"
                  className={`text-[10px] uppercase tracking-[0.18em] ${
                    String(viewingEvaluation.status || "").toLowerCase() === "pass"
                      ? "bg-emerald-500/15 text-emerald-600"
                      : String(viewingEvaluation.status || "").toLowerCase() === "needs_review"
                        ? "bg-amber-500/15 text-amber-600"
                        : "bg-rose-500/15 text-rose-600"
                  }`}
                >
                  {viewingEvaluation.status || "unknown"}
                </Badge>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr]">
                <div className="rounded-2xl border border-border/60 bg-card/80 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Score</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">
                    {evaluationScore}
                    <span className="text-sm text-foreground/45">/{evaluationMaxScore}</span>
                  </p>
                  <p className="mt-1 text-xs text-foreground/60">
                    {viewingEvaluation.package_type ? `Package: ${viewingEvaluation.package_type}` : "Package info unavailable"}
                  </p>
                  <p className="mt-1 text-xs text-foreground/60">
                    {viewingEvaluation.has_preview ? "Preview ready" : "No preview artifact detected"}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Checks</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {evaluationChecks.slice(0, 4).map((check: WorkflowEvaluationCheck, index: number) => {
                      const checkStatus = String(check.status || (check.passed ? "pass" : "needs_review")).toLowerCase();
                      const isPass = checkStatus === "pass" || checkStatus === "passed";
                      return (
                        <div key={`${check.name || check.title || "check"}-${index}`} className="rounded-xl border border-border/60 bg-card/80 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-foreground">
                              {check.title || check.name || `Check ${index + 1}`}
                            </p>
                            <Badge
                              variant="secondary"
                              className={`text-[10px] uppercase tracking-[0.18em] ${
                                isPass
                                  ? "bg-emerald-500/15 text-emerald-600"
                                  : "bg-amber-500/15 text-amber-600"
                              }`}
                            >
                              {isPass ? "Pass" : "Review"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-[11px] leading-5 text-foreground/60">
                            {check.summary || check.description || "No detail available."}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="p-4 border-t border-border/30 bg-secondary/10 flex items-center justify-between gap-3">
            <p className="text-xs text-foreground/65">
              💡 Output is read-only. To modify and rerun, close this dialog and click the workflow card.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
            onClick={() => {
              if (viewingOutput) {
                setViewingOutput(null);
                setViewingEvaluation(null);
                navigate(`/workflows/${viewingOutput.id}`);
              }
            }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in Editor
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Workflows;
