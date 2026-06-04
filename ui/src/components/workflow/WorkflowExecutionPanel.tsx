/**
 * WorkflowExecutionPanel.tsx — Right-side Execution Pipeline
 * 
 * Manages the full workflow execution lifecycle:
 * 1. INPUT phase: User describes task + attaches files
 * 2. RUNNING phase: Sequential agent execution with live status
 * 3. COMPLETE phase: Results displayed in OutputViewer
 * 
 * The panel uses the backend run ledger as the source of truth for status,
 * agent outputs, and generated artifacts.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AgentStepTracker, type AgentStep } from "./AgentStepTracker";
import { OutputViewer, normalizeDisplayPath, type OutputFile, type WorkflowOutput } from "./OutputViewer";
import { useWorkflowOutput } from "@/lib/workflow-output-context";
import { useTabContext } from "@/lib/tab-context";
import { Send, Paperclip, X, Sparkles, FileText, ExternalLink, Bot, FileCode, Activity, Pause, StepForward, Gauge } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  saveWorkflow,
  runWorkflowAPI,
  getWorkflowRunStatus,
  getWorkflowRunOutput,
  getWorkflowRunArtifacts,
  getWorkflowEvaluation,
  getWorkspaceFile,
  getSimulationRunStatus,
  pauseSimulationRun,
  resumeSimulationRun,
  stepSimulationRun,
  getSimulationRunResult,
} from "@/lib/api";
import { validateWorkflowGraph } from "@/lib/workflow-validation";
import { WorkflowValidationSummary } from "./WorkflowValidationSummary";
import type { Node, Edge } from "reactflow";

function formatMatchType(value?: unknown) {
  const type = String(value || "exact").toLowerCase();
  if (type === "virtual") return "Virtual";
  if (type === "adapted") return "Adapted";
  if (type === "missing") return "Gap";
  return "Exact";
}

function matchBadgeClass(value?: unknown) {
  const type = String(value || "exact").toLowerCase();
  if (type === "virtual") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (type === "adapted") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (type === "missing") return "border-rose-300/25 bg-rose-300/10 text-rose-100";
  return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
}

/**
 * Topological sort — derives execution order from React Flow edges.
 * Agents without incoming edges run first. Unconnected agents run last.
 * This is backend-driven logic — the runtime stays in sync with persisted runs.
 */
function getExecutionOrder(nodes: Node[], edges: Edge[]): Node[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => { inDegree.set(n.id, 0); adj.set(n.id, []); });
  edges.forEach((e) => {
    adj.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  });
  const queue = nodes.filter((n) => (inDegree.get(n.id) || 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) || []) {
      const deg = (inDegree.get(next) || 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }
  nodes.forEach((n) => { if (!order.includes(n.id)) order.push(n.id); });
  return order.map((id) => nodes.find((n) => n.id === id)!).filter(Boolean);
}

function buildBackendSummary(
  workflowId: string,
  taskInput: string,
  outputs: Array<{ agent_id: string; label?: string; role?: string; selection_reason?: string; output?: { markdown?: string }; task?: string }>,
  agentSteps: AgentStep[] = []
) {
  const summarize = (markdown?: string) => {
    const text = (markdown || "").trim();
    if (!text) return "No markdown output was returned.";
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line !== "---" && !/^```/.test(line) && !/^\|.*\|$/.test(line));
    return lines.slice(0, 4).join(" ").replace(/\s+/g, " ").slice(0, 420) || "No markdown output was returned.";
  };

  const sections = outputs
    .map((item, index) => {
      const step = agentSteps[index];
      const title = step?.agentName || item.label || item.role || item.agent_id || `Agent ${index + 1}`;
      const role = item.role || step?.agentName || item.label || item.agent_id || `Agent ${index + 1}`;
      const reason = (item.selection_reason || step?.selectionReason || "").trim();
      const taskFocus = (item.task || step?.selectionReason || "Workflow step").trim();
      const summary = summarize(item.output?.markdown);
      return [
        `### ${index + 1}. ${title}`,
        "",
        `**Agent output summary**`,
        "",
        `- **Role:** ${role}`,
        `- **Task focus:** ${taskFocus}`,
        `- **Why this step was chosen:** ${reason || "Selected as part of the workflow plan."}`,
        `- **High-level result:** ${summary}`,
      ].join("\n");
    })
    .join("\n\n");

  return {
    markdown: [
      "# Workflow Results",
      "",
      "## Task",
      taskInput || "No task was provided.",
      "",
      `**Workflow ID:** \`${workflowId}\``,
      "",
      "## What happened",
      "This is a high-level execution summary. It shows the task first, then each agent’s role and result in order. It intentionally avoids exposing internal chain-of-thought.",
      "",
      "## Step-by-step delivery",
      sections || "_No backend output was returned yet._",
    ].join("\n"),
    workflowId,
  };
}

function buildPackageSummary(output: WorkflowOutput | null) {
  const files = Array.isArray(output?.files) ? output!.files : [];
  const hasHtml = files.some((file) => file.path.toLowerCase().endsWith(".html"));
  const hasMarkdown = Boolean((output?.markdown || "").trim());
  const packageType = hasHtml
    ? "web-package"
    : files.length > 1 && hasMarkdown
      ? "mixed-package"
      : files.length > 0
        ? "file-package"
        : "document-package";
  const primaryArtifact = files.find((file) => file.path.toLowerCase().endsWith("index.html") || file.path.toLowerCase().endsWith("preview.html"))?.path
    || files[0]?.path
    || "workflow-output.md";

  return {
    package_type: packageType,
    primary_artifact: normalizeDisplayPath(primaryArtifact),
    artifact_count: files.length,
    has_preview: hasHtml,
    artifact_paths: files.slice(0, 8).map((file) => normalizeDisplayPath(file.path)),
  };
}

function normalizeFailureText(value: unknown, fallback = "Unknown failure") {
  if (value == null) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map((item) => normalizeFailureText(item, "")).filter(Boolean);
    return parts.join(", ") || fallback;
  }
  if (typeof value === "object") {
    const payload = value as Record<string, unknown>;
    const nested = payload.message ?? payload.detail ?? payload.error ?? payload.reason;
    if (nested !== undefined) {
      const extracted = normalizeFailureText(nested, "");
      if (extracted) return extracted;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function hydrateWorkflowFiles(workflowId: string): Promise<OutputFile[]> {
  try {
    const artifacts = await getWorkflowRunArtifacts(workflowId);
    if (Array.isArray(artifacts) && artifacts.length > 0) {
      const fetched = await Promise.all(
        artifacts.slice(0, 24).map(async (artifact) => {
          const relPath = artifact?.path || artifact?.name;
          if (!relPath) return null;
          try {
            const file = await getWorkspaceFile(`workflow_${workflowId}/${relPath}`);
            return {
              path: file.path.replace(`workflow_${workflowId}/`, ""),
              content: file.content,
              language: artifact?.type || relPath.split(".").pop(),
            } satisfies OutputFile;
          } catch {
            return null;
          }
        })
      );

      const hydrated = fetched.filter(Boolean) as OutputFile[];
      if (hydrated.length > 0) return hydrated;
    }
  } catch (error) {
    console.warn("Could not hydrate workflow files from backend", error);
  }

  return [];
}

interface WorkflowExecutionPanelProps {
  nodes: Node[];
  edges: Edge[];
  onClose: () => void;
  /** Pre-filled task from AI Workflow Generator — skips redundant input */
  initialTask?: string;
  /** Workflow ID for output storage — used to open output in a separate tab */
  workflowId?: string;
  /** Workflow name for auto-save before run */
  workflowName?: string;
  /** Planner metadata from the workflow graph, if available */
  workflowPlan?: any;
  /** Stored output from a previous run (passed from WorkflowEditor) */
  storedOutput?: any;
}

export function WorkflowExecutionPanel({ nodes, edges, onClose, initialTask = "", workflowId = "new", workflowName = "Workflow", workflowPlan, storedOutput }: WorkflowExecutionPanelProps) {
  const [taskInput, setTaskInput] = useState(initialTask);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [finalOutput, setFinalOutput] = useState<WorkflowOutput | null>(null);
  /** Phase state machine: input → running → approval → complete → failed */
  const [phase, setPhase] = useState<"input" | "running" | "paused" | "approval" | "complete" | "failed">("input");
  const [backendStatus, setBackendStatus] = useState<string>("idle");
  const [runtimeEngine, setRuntimeEngine] = useState<string>("custom_dag");
  const [simulationCycle, setSimulationCycle] = useState<number>(0);
  const [simulationControlBusy, setSimulationControlBusy] = useState<"pause" | "resume" | "step" | null>(null);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  /** The actual workflow ID (may differ from prop if auto-saved) */
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>(workflowId);
  const [backendRunId, setBackendRunId] = useState<string | null>(null);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [failureDetails, setFailureDetails] = useState<{ agentName: string; reason: string; stepId?: string | null; kind?: string | null; label?: string | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { setOutput } = useWorkflowOutput();
  const { openApp, updateCurrentTabUrl } = useTabContext();
  const validation = useMemo(() => validateWorkflowGraph(nodes, edges), [nodes, edges]);
  const orderedNodes = useMemo(() => getExecutionOrder(nodes, edges), [nodes, edges]);
  const isSimulationPlan = workflowPlan?.workflow_mode === "simulation" || workflowPlan?.runtime_mode === "simulation";
  const liveSummary = useMemo(() => {
    const running = steps.filter((step) => step.status === "running").length;
    const done = steps.filter((step) => step.status === "done").length;
    const failed = steps.filter((step) => step.status === "error").length;
    const idle = steps.filter((step) => step.status === "pending").length;
    const current = currentStepId ? steps.find((step) => step.id === currentStepId) || null : null;
    return { running, done, failed, idle, current };
  }, [steps, currentStepId]);
  const hasCompleteRun = phase === "complete" || backendStatus === "completed";
  const displayedOutput = finalOutput ?? { markdown: "", files: [] } as WorkflowOutput;
  const resolvedOutputWorkflowId = finalOutput?.workflowId || storedOutput?.workflowId || activeWorkflowId || workflowId;
  const hasRenderableOutput = Boolean(
    (finalOutput?.markdown && finalOutput.markdown.trim()) ||
    (Array.isArray(finalOutput?.files) && finalOutput.files.length > 0) ||
    (storedOutput?.output?.markdown && String(storedOutput.output.markdown).trim()) ||
    (Array.isArray(storedOutput?.output?.files) && storedOutput.output.files.length > 0)
  );
  const isSimulationRunActive = Boolean(backendRunId?.startsWith("sim_") || isSimulationPlan);
  const canPauseSimulation = isSimulationRunActive && backendRunId && phase === "running" && backendStatus !== "paused" && !hasCompleteRun;
  const canResumeSimulation = isSimulationRunActive && backendRunId && (phase === "paused" || backendStatus === "paused") && !hasCompleteRun;
  const canStepSimulation = isSimulationRunActive && backendRunId && (phase === "paused" || backendStatus === "paused") && !hasCompleteRun;
  const structuredRoute = workflowPlan?.stage_plan || workflowPlan?.stagePlan || [];
  const routeEvidence = workflowPlan?.route_evidence || workflowPlan?.routeEvidence || [];
  const plannerSource = workflowPlan?.planner_source || "LangChain";
  const routeOutputType = workflowPlan?.output_type || workflowPlan?.outputType || "auto";

  const getRunStatusLabel = (status: string) => {
    switch ((status || "").toLowerCase()) {
      case "queued":
        return "Queued";
      case "running":
        return "Running";
      case "waiting_for_approval":
      case "paused_approval":
        return "Waiting for approval";
      case "paused":
        return "Paused";
      case "completed":
      case "complete":
        return "Complete";
      case "failed":
        return "Failed";
      default:
        return "Idle";
    }
  };

  const getFailureBadgeClass = (kind?: string | null) => {
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

  const getRunBadgeClass = (status: string) => {
    switch ((status || "").toLowerCase()) {
      case "running":
        return "border-sky-500/20 bg-sky-500/10 text-sky-700";
      case "completed":
      case "complete":
        return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
      case "paused":
      case "paused_approval":
      case "waiting_for_approval":
        return "border-amber-500/20 bg-amber-500/10 text-amber-700";
      case "failed":
        return "border-rose-500/20 bg-rose-500/10 text-rose-700";
      default:
        return "border-border/60 bg-secondary/30 text-muted-foreground";
    }
  };

  useEffect(() => {
    // If the backend has already marked the run complete, keep the UI in sync
    // even when the inline polling loop or a route refresh misses the final
    // local transition.
    if (backendStatus === "completed" && phase !== "complete") {
      setPhase("complete");
    }
  }, [backendStatus, phase]);

  // Restore from storedOutput prop (passed directly from WorkflowEditor)
  useEffect(() => {
    // If the component is explicitly instructed to rerun (e.g. from the editor), reset state.
    if (sessionStorage.getItem(`rerun_${activeWorkflowId}`)) {
      sessionStorage.removeItem(`rerun_${activeWorkflowId}`);
      localStorage.removeItem(`workflow_run_${activeWorkflowId}`);
      setPhase("input");
      setFinalOutput(null);
      setSteps([]);
      setBackendRunId(null);
      setCurrentStepId(null);
      setFailureDetails(null);
      setEvaluation(null);
      setEvaluationLoading(false);
      setRuntimeEngine("custom_dag");
      return;
    }

    if (storedOutput?.output) {
      setPhase("complete");
      setTaskInput(storedOutput.task);
      setFinalOutput(storedOutput.output);
      setBackendRunId(null);
      setCurrentStepId(null);
      setEvaluation(null);
      setRuntimeEngine(String(storedOutput?.runtime_engine || storedOutput?.runtimeEngine || "custom_dag"));
      setSteps(Array.from({ length: storedOutput.agentCount }, (_, i) => ({
        id: `step-${i}`,
        agentName: `Agent ${i + 1}`,
        emoji: "🤖",
        status: "done" as const,
      })));
      return;
    }
    // Check for running/completed state under this workflow's specific key
    if (activeWorkflowId && activeWorkflowId !== "new") {
      try {
        const raw = localStorage.getItem(`workflow_run_${activeWorkflowId}`);
        if (raw) {
          const runState = JSON.parse(raw);
          if (runState.phase && runState.task) {
            setPhase(runState.phase);
            setTaskInput(runState.task);
            if (runState.output) setFinalOutput(runState.output);
            if (runState.steps) setSteps(runState.steps);
            const resumedRunningStep = (runState.steps || []).find((step: AgentStep) => step.status === "running");
            setCurrentStepId(runState.phase === "complete" ? null : resumedRunningStep?.id || null);
            if (runState.failureDetails) setFailureDetails(runState.failureDetails);
            return;
          }
        }
      } catch { /* ignore */ }
    }
    if (initialTask) {
      setTaskInput(initialTask);
    }
  }, [activeWorkflowId, storedOutput, initialTask]);

  // Sync initialTask prop changes (e.g., after AI generation)
  useEffect(() => {
    if (initialTask && initialTask !== taskInput) {
      setTaskInput(initialTask);
    }
  }, [initialTask]);

  // Persist running state to localStorage for tab-switch resilience
  useEffect(() => {
    if (activeWorkflowId && activeWorkflowId !== "new") {
      try {
        localStorage.setItem(`workflow_run_${activeWorkflowId}`, JSON.stringify({
          phase, task: taskInput, output: finalOutput, steps, failureDetails
        }));
      } catch { /* ignore */ }
    }
  }, [phase, taskInput, finalOutput, steps, failureDetails, activeWorkflowId]);

  const buildOutputRecord = (resolvedWorkflowId: string, output: WorkflowOutput, agentSteps: AgentStep[] = steps) => ({
        title: workflowName,
        task: taskInput,
        agentCount: agentSteps.length,
        runtime_engine: runtimeEngine,
        plan: orderedNodes.length > 0 ? {
          ...(workflowPlan || {}),
          domainTitle: workflowPlan?.domain_title || orderedNodes[0]?.data?.workflow_domain_title,
          domainKey: workflowPlan?.domain_key || orderedNodes[0]?.data?.workflow_domain,
          promptSummary: workflowPlan?.prompt_summary || (orderedNodes[0]?.data?.workflow_domain_title ? taskInput.slice(0, 140) : undefined),
          routingReason: workflowPlan?.routing_reason || (orderedNodes[0]?.data?.selection_reason ? `First step: ${orderedNodes[0].data.selection_reason}` : undefined),
          routeEvidence: workflowPlan?.route_evidence || workflowPlan?.routeEvidence || [],
	          requestedAgents: workflowPlan?.requested_agents || validation.nodeCount,
	          generatedAgents: workflowPlan?.generated_agents || orderedNodes.length,
	          routeQuality: workflowPlan?.route_quality || workflowPlan?.routeQuality,
	          stagePlan: workflowPlan?.stage_plan || orderedNodes.map((node) => ({
	            id: node.id,
	            label: node.data.subtitle,
	            agent: node.data.label,
	            reason: node.data.selection_reason,
	            requested_role: node.data.requested_role,
	            match_type: node.data.match_type,
	            match_confidence: node.data.match_confidence,
	            base_skill_id: node.data.base_skill_id,
	          })),
	        } : undefined,
        output: {
          ...output,
          package: output?.package || buildPackageSummary(output),
        },
        completedAt: new Date(),
        workflowId: resolvedWorkflowId,
  });

  const persistCompletedOutput = (resolvedWorkflowId: string, output: WorkflowOutput, agentSteps: AgentStep[] = steps) => {
    if (!resolvedWorkflowId || resolvedWorkflowId === "new") return;
    const record = buildOutputRecord(resolvedWorkflowId, output, agentSteps);
    setOutput(resolvedWorkflowId, record);
    try {
      const raw = localStorage.getItem("ensemble_workflow_outputs");
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[resolvedWorkflowId] = { ...record, completedAt: record.completedAt.toISOString() };
      localStorage.setItem("ensemble_workflow_outputs", JSON.stringify(parsed));
      localStorage.setItem(`workflow_run_${resolvedWorkflowId}`, JSON.stringify({
        phase: "complete",
        task: taskInput,
        output,
        steps: agentSteps.map((step) => ({ ...step, status: step.status === "error" ? "error" : "done" })),
        failureDetails: null,
      }));
    } catch {
      console.warn("Failed to persist completed workflow output");
    }
  };

  // Persist state changes (only after completion). The run loop also calls
  // persistCompletedOutput immediately, so this effect is just a safety net
  // for restored completions and browser refreshes.
  useEffect(() => {
    if (phase === "complete" && finalOutput && activeWorkflowId !== "new") {
      persistCompletedOutput(activeWorkflowId, finalOutput);
    }
  }, [phase, finalOutput, activeWorkflowId]);

  const handleAttachFile = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles((prev) => [...prev, ...files.map((f) => f.name)]);
  };

  const handlePauseSimulation = async () => {
    if (!backendRunId) return;
    setSimulationControlBusy("pause");
    try {
      await pauseSimulationRun(backendRunId);
      setBackendStatus("paused");
      setPhase("paused");
      toast.info("Simulation paused", {
        description: "The run board will keep polling so you can resume from here.",
      });
    } catch (error: any) {
      toast.error(`Could not pause simulation: ${error?.message || "Unknown error"}`);
    } finally {
      setSimulationControlBusy(null);
    }
  };

  const handleResumeSimulation = async () => {
    if (!backendRunId) return;
    setSimulationControlBusy("resume");
    try {
      await resumeSimulationRun(backendRunId);
      setBackendStatus("running");
      setPhase("running");
      toast.success("Simulation resumed");
    } catch (error: any) {
      toast.error(`Could not resume simulation: ${error?.message || "Unknown error"}`);
    } finally {
      setSimulationControlBusy(null);
    }
  };

  const handleStepSimulation = async () => {
    if (!backendRunId) return;
    setSimulationControlBusy("step");
    try {
      const status = await stepSimulationRun(backendRunId);
      setBackendStatus((status?.status || "paused").toLowerCase());
      setSimulationCycle(Number(status?.current_cycle || simulationCycle));
      toast.info(`Simulation checkpoint ${status?.current_cycle ?? simulationCycle} loaded`);
    } catch (error: any) {
      toast.error(`Could not step simulation: ${error?.message || "Unknown error"}`);
    } finally {
      setSimulationControlBusy(null);
    }
  };

  /**
   * Main execution handler.
   * 
   * PRODUCTION-READY:
   * 1. Transmits the full ReactFlow DAG + task input to the Esemble backend.
   * 2. Sequentially executes agents via the DAG workflow engine.
   * 3. Harvests generated artifacts and output payloads from the backend.
   */
  const handleRun = async () => {
    if (!taskInput.trim() || nodes.length === 0) {
      if (nodes.length === 0) toast.error("Add agents to the canvas first");
      if (!taskInput.trim()) toast.error("Describe your task before running");
      return;
    }

    if (!validation.isValid) {
      const firstError = validation.errors[0];
      toast.error(firstError?.title || "Fix workflow validation issues before running", {
        description: firstError?.description || "Review the validation panel for details.",
      });
      setPhase("input");
      return;
    }

    // Clear stale output from previous runs
    if (activeWorkflowId && activeWorkflowId !== 'new') {
      localStorage.removeItem(`workflow_run_${activeWorkflowId}`);
      sessionStorage.removeItem(`rerun_${activeWorkflowId}`);

      // Also clear from the main output store
      try {
        const raw = localStorage.getItem("ensemble_workflow_outputs");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed[activeWorkflowId]) {
            delete parsed[activeWorkflowId];
            localStorage.setItem("ensemble_workflow_outputs", JSON.stringify(parsed));
          }
        }
      } catch {}
    }

    toast.info(`Running workflow with ${nodes.length} agent(s)...`);

      setIsRunning(true);
      setPhase("running");
      setBackendStatus("queued");
      setBackendRunId(null);
      setCurrentStepId(null);
      setFailureDetails(null);

    const orderedNodes = getExecutionOrder(nodes, edges);
    const initialSteps: AgentStep[] = orderedNodes.map((n) => ({
      id: n.id,
      agentName: (n.data.label as string)?.replace(/^[^\w]*/, "").trim() || "Agent",
      emoji: (n.data.label as string)?.split(" ")[0] || "🤖",
      selectionReason: n.data.selection_reason as string | undefined,
      status: "pending" as const,
    }));
    setSteps(initialSteps);

    try {
      // 0. Auto-save the workflow so it persists and gets a real ID
      let runId = workflowId;
      if (workflowId === "new") {
        try {
          const graphJson = JSON.stringify({ nodes, edges, metadata: workflowPlan });
          const saved = await saveWorkflow(workflowName, graphJson);
          runId = saved.id;
          setActiveWorkflowId(runId);
          console.log(`✅ Auto-saved workflow: ${runId}`);
          // Force the URL to update so tab switches don't reset to /workflows/new
          navigate(`/workflows/${runId}`, { replace: true });
          updateCurrentTabUrl(`/workflows/${runId}`, workflowName, "workflows");
        } catch (e) {
          console.warn("Failed to auto-save workflow, continuing with temp ID", e);
        }
      }

      // 1. Start the workflow on the backend so the run is durable and auditable.
      let backendRunId: string | null = null;
      let backendWorkflowMode: string | undefined;
      try {
        const backendRun = await runWorkflowAPI({
          id: runId,
          nodes,
          edges,
          metadata: workflowPlan,
          initialInput: taskInput,
        });
        backendRunId = backendRun.run_id;
        backendWorkflowMode = backendRun.workflow_mode;
        setRuntimeEngine(String(backendRun.runtime_engine || workflowPlan?.runtime_engine || "custom_dag"));
        setBackendRunId(backendRunId);
        console.log(`✅ Backend workflow started: ${backendRunId}`);
      } catch (backendError) {
        console.warn("Backend workflow execution could not be started.", backendError);
        throw backendError;
      }

      // Give the board an immediate live state so the UI feels responsive while
      // the backend run ledger catches up on the first poll.
      setBackendStatus("running");
      setCurrentStepId(initialSteps[0]?.id || null);
      setSteps((prev) => prev.map((step, index) => (
        index === 0
          ? { ...step, status: "running" }
          : step
      )));
      window.dispatchEvent(new CustomEvent("workflow_run_status", {
        detail: {
          runId: backendRunId || runId,
          workflowId: runId,
          status: "running",
          currentNodeId: initialSteps[0]?.id || null,
          runtimeEngine: backendRun?.runtime_engine || runtimeEngine,
          nodeStatuses: initialSteps.map((step, index) => ({
            node_id: step.id,
            status: index === 0 ? "running" : "pending",
            label: step.agentName,
          })),
        },
      }));

      const workflowSteps = initialSteps.map((step, index) => ({
        ...step,
        model: orderedNodes[index]?.data?.model,
      }));
      const orderedStepIds = workflowSteps.map((step) => step.id);

      const toStepStatus = (status?: string): AgentStep["status"] => {
        const value = (status || "").toLowerCase();
        if (value === "completed" || value === "complete" || value === "done") return "done";
        if (value === "failed" || value === "error") return "error";
        if (value === "running" || value === "active") return "running";
        return "pending";
      };

      const syncStepsFromBackend = (runStatus: any, backendOutputs: any[] = [], observedRunId: string = backendRunId || runId) => {
        const outputByNode = new Map<string, any>();
        backendOutputs.forEach((item) => {
          if (item?.node_id) outputByNode.set(item.node_id, item);
          if (item?.agent_id) outputByNode.set(item.agent_id, item);
        });
        const currentIndex = runStatus?.current_node ? orderedStepIds.indexOf(runStatus.current_node) : -1;
        const normalizedRunStatus = (runStatus?.status || "").toLowerCase();
        const isCompleteStatus = normalizedRunStatus === "completed" || normalizedRunStatus === "complete";
        const completedNodeIds = new Set<string>(
          (runStatus?.node_statuses || [])
            .filter((item: any) => toStepStatus(item?.status) === "done")
            .map((item: any) => item.node_id)
        );
        const runningNode = (runStatus?.node_statuses || []).find((item: any) => toStepStatus(item?.status) === "running");
        const failedNode = (runStatus?.node_statuses || []).find((item: any) => toStepStatus(item?.status) === "error");

        setSteps((prev) => prev.map((step) => {
          const nodeMeta = orderedNodes.find((n) => n.id === step.id);
          const backendStep = runStatus?.node_statuses?.find((item: any) => item.node_id === step.id);
          const outputItem = outputByNode.get(step.id);
          const nextStatus = toStepStatus(backendStep?.status);
          let inferredStatus = nextStatus;
          const stepIndex = orderedStepIds.indexOf(step.id);
          if (normalizedRunStatus === "running" && currentIndex >= 0) {
            if (stepIndex < currentIndex) inferredStatus = "done";
            else if (stepIndex === currentIndex) inferredStatus = "running";
          } else if (normalizedRunStatus === "running") {
            if (completedNodeIds.has(step.id)) inferredStatus = "done";
            else if (backendStep?.status && toStepStatus(backendStep.status) !== "pending") inferredStatus = toStepStatus(backendStep.status);
          } else if (isCompleteStatus) {
            const backendStatus = toStepStatus(backendStep?.status);
            if (backendStatus === "error") inferredStatus = "error";
            else inferredStatus = "done";
          } else if (backendStep?.status && toStepStatus(backendStep.status) !== "pending") {
            inferredStatus = toStepStatus(backendStep.status);
          }
          return {
            ...step,
            status: inferredStatus === "pending" ? step.status : inferredStatus,
            output: outputItem?.output?.markdown || step.output,
            error: nextStatus === "error" ? normalizeFailureText(backendStep?.error || outputItem?.output?.error || step.error, "") : step.error,
            failureKind: nextStatus === "error" ? backendStep?.failure_kind || runStatus?.failure_kind || undefined : step.failureKind,
            failureLabel: nextStatus === "error" ? backendStep?.failure_label || runStatus?.failure_label || undefined : step.failureLabel,
            model: step.model || orderedNodes.find((n) => n.id === step.id)?.data?.model,
            selectionReason: step.selectionReason || (backendStep?.selection_reason as string | undefined) || (nodeMeta?.data?.selection_reason as string | undefined),
          };
        }));

        if (isCompleteStatus) {
          setCurrentStepId(null);
        } else if (failedNode?.node_id) {
          setCurrentStepId(failedNode.node_id);
        } else if (runningNode?.node_id) {
          setCurrentStepId(runningNode.node_id);
        } else if (normalizedRunStatus === "running") {
          const nextStep = orderedStepIds.find((id) => !completedNodeIds.has(id));
          setCurrentStepId(nextStep || null);
        } else {
          setCurrentStepId(null);
        }

        window.dispatchEvent(new CustomEvent("workflow_run_status", {
          detail: {
            runId: observedRunId,
            workflowId: runId,
            status: normalizedRunStatus || "running",
            currentNodeId: runStatus?.current_node || runStatus?.current_node_id || null,
            runtimeEngine: runStatus?.runtime_engine || runtimeEngine,
            nodeStatuses: runStatus?.node_statuses || [],
          },
        }));
      };

      const pollBackendUntilComplete = async (runIdToPoll: string) => {
        if (!runIdToPoll) return;
        const maxAttempts = 180;
        const isSimulationRun = runIdToPoll.startsWith("sim_") || backendWorkflowMode === "simulation" || isSimulationPlan;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const runStatus = isSimulationRun
            ? await getSimulationRunStatus(runIdToPoll)
            : await getWorkflowRunStatus(runIdToPoll);
          const normalizedStatus = (runStatus.status || "").toLowerCase();
          setBackendStatus(normalizedStatus || "running");
          if (isSimulationRun && runStatus.current_cycle !== undefined && runStatus.current_cycle !== null) {
            setSimulationCycle(Number(runStatus.current_cycle || 0));
          }
          setBackendRunId(runIdToPoll);
          syncStepsFromBackend(runStatus, [], runIdToPoll);

          if (normalizedStatus === "completed" || normalizedStatus === "complete") {
            const backendOutput = isSimulationRun
              ? await getSimulationRunResult(runIdToPoll)
              : await getWorkflowRunOutput(runId, runIdToPoll);
            const backendOutputsRaw = Array.isArray(backendOutput?.outputs) ? backendOutput.outputs : [];
            const orderMap = new Map(workflowSteps.map((step, index) => [step.id, index]));
            const backendOutputs = [...backendOutputsRaw].sort((a: any, b: any) => {
              const aIndex = orderMap.get(a?.node_id) ?? 9999;
              const bIndex = orderMap.get(b?.node_id) ?? 9999;
              return aIndex - bIndex;
            });
            syncStepsFromBackend(runStatus, backendOutputs, runIdToPoll);

            const backendFiles = Array.isArray(backendOutput?.files) && backendOutput.files.length > 0
              ? backendOutput.files.map((file: any) => ({
                  path: file.path,
                  content: file.content || "",
                  language: file.language,
                }))
              : await hydrateWorkflowFiles(runId);

            const finalResult: WorkflowOutput = {
              markdown: isSimulationRun && backendOutput?.latest?.output?.markdown
                ? backendOutput.latest.output.markdown
                : buildBackendSummary(runId, taskInput, backendOutputs, workflowSteps).markdown,
              workflowId: runId,
              files: backendFiles,
            };
            (finalResult as any).messages = backendOutput?.messages || runStatus?.messages || [];
            (finalResult as any).message_threads = backendOutput?.message_threads || runStatus?.message_threads || [];
            (finalResult as any).events = backendOutput?.events || runStatus?.events || [];
            (finalResult as any).state = backendOutput?.state;
            (finalResult as any).checkpoints = backendOutput?.checkpoints || [];
            (finalResult as any).agent_logs = backendOutput?.agent_logs || [];
            (finalResult as any).simulation_status = backendOutput?.status;
            (finalResult as any).package = backendOutput?.package || finalResult.package;

            if (!backendOutputs.length) {
              const fallbackFiles = await hydrateWorkflowFiles(runId);
              finalResult.files = backendFiles.length ? backendFiles : fallbackFiles;
              finalResult.markdown = `# Workflow Results\n\n**Task:** ${taskInput}\n\nNo backend output was returned yet.\n`;
            }

            const outputByNode = new Map<string, any>();
            backendOutputs.forEach((item: any) => {
              if (item?.node_id) outputByNode.set(item.node_id, item);
              if (item?.agent_id) outputByNode.set(item.agent_id, item);
            });
            const completedSteps: AgentStep[] = workflowSteps.map((step) => {
              const outputItem = outputByNode.get(step.id);
              return {
                ...step,
                status: "done",
                output: outputItem?.output?.markdown || step.output,
              };
            });
            setSteps(completedSteps);
            setFinalOutput(finalResult);
            persistCompletedOutput(runId, finalResult, completedSteps);
            setEvaluationLoading(true);
            try {
              const evaluationResult = await getWorkflowEvaluation(runId);
              setEvaluation(evaluationResult);
            } catch (error) {
              console.warn("Could not load workflow evaluation", error);
              setEvaluation(null);
            } finally {
              setEvaluationLoading(false);
            }
            setPhase("complete");
            setBackendStatus("completed");
            const completedCount = Math.max(
              completedSteps.length,
              Number(runStatus.completed_count || 0)
            );
            const totalCount = Math.max(completedSteps.length, Number(runStatus.total_steps || 0));
            toast.success(`Workflow completed — ${completedCount}/${totalCount} step(s) finished on the backend`);
            return;
          }

          if (normalizedStatus === "failed") {
            const failedStep = runStatus.node_statuses?.find((item: any) => item.status === "failed");
            const failedAgent = failedStep?.label || failedStep?.role || runStatus.current_node_label || runStatus.current_node || "an unknown agent";
            const cleanError = normalizeFailureText(failedStep?.error, "")
              .replace(/^Error:\s*/i, "")
              .replace(/^Error calling [^:]+:\s*/i, "")
              .split("\n")[0]
              .slice(0, 180);
            const failureReason = cleanError || "The backend reported a failed step.";
            const failureStepId = failedStep?.node_id || runStatus.current_node || null;
            setFailureDetails({
              agentName: failedAgent,
              reason: failureReason,
              stepId: failureStepId,
              kind: failedStep?.failure_kind || runStatus.failure_kind || null,
              label: failedStep?.failure_label || runStatus.failure_label || null,
            });
            setSteps((prev) => prev.map((step) => (
              step.id === failureStepId
                ? { ...step, status: "error", error: failureReason }
                : step
            )));
            setCurrentStepId(failureStepId);
            setBackendStatus("failed");
            setPhase("failed");
            setEvaluation(null);
            toast.error(`Workflow failed: ${failedAgent} failed${failureReason ? `: ${failureReason}` : ""}`);
            return;
          }

          if (normalizedStatus === "paused") {
            setPhase("paused");
            setBackendStatus("paused");
            await new Promise((resolve) => setTimeout(resolve, 1400));
            continue;
          }

          if (["waiting_for_approval", "paused_approval"].includes(normalizedStatus)) {
            setPhase("approval");
            setBackendStatus(normalizedStatus);
            toast.info("Workflow paused for approval", {
              description: "Open Permissions to review and approve the blocking action.",
            });
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 1400));
        }

        throw new Error("Workflow run timed out while waiting for backend completion.");
      };

      await pollBackendUntilComplete(backendRunId || "");

    } catch (err: any) {
      console.error("❌ Workflow Execution Error:", err);
      const errorMsg = err?.message || "Unknown error";
      if (phase !== "failed") {
        setFailureDetails((prev) => prev || { agentName: "Unknown agent", reason: errorMsg, stepId: currentStepId, kind: "runtime", label: "Runtime issue" });
        toast.error(`Workflow failed: ${errorMsg}`);
        // Reset running steps back to pending
        setSteps(prev => prev.map(s => s.status === "running" ? { ...s, status: "pending" } : s));
        setPhase("failed");
        setEvaluation(null);
      }
      setBackendRunId(null);
      setCurrentStepId(null);
    } finally {
      setIsRunning(false);
    }
  };

  /** Opens workflow output in a dedicated full-width tab */
  const handleOpenInTab = () => {
    const targetId = resolvedOutputWorkflowId;
    openApp({
      id: `workflow-output-${targetId}`,
      title: `${workflowName} — Output`,
      url: `/workflow-output/${targetId}`,
      icon: FileCode,
      description: "Workflow execution results",
    });
    navigate(`/workflow-output/${targetId}`);
  };

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 520, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="h-full min-h-0 border-l border-border/50 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.10),transparent_30%),linear-gradient(180deg,hsl(var(--card)/0.88),hsl(var(--background)/0.92))] backdrop-blur-2xl flex flex-col shrink-0 overflow-hidden"
    >
      {/* Header — shows current phase label */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Activity className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Live Run Board</p>
            <span className="text-base font-bold tracking-tight text-foreground">
              {phase === "input" ? "Ready to execute" : phase === "running" ? "Executing agents" : phase === "paused" ? "Simulation paused" : phase === "approval" ? "Approval pending" : phase === "failed" ? "Run failed" : "Result ready"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleOpenInTab}
            disabled={!hasRenderableOutput}
            title={hasRenderableOutput ? "Open workflow output" : "Run the workflow to generate an output"}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Output
          </Button>
          {/* Close button — closes the entire execution panel */}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="p-3 border-b border-border/30 bg-secondary/10">
        <WorkflowValidationSummary validation={validation} compact />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
      {workflowPlan && (
        <div className="px-3 pt-3">
          <div className="rounded-[1.35rem] border border-primary/15 bg-gradient-to-br from-primary/8 via-background/80 to-background p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary/80">Planner Route</p>
                </div>
                <h3 className="mt-1 truncate text-sm font-semibold text-foreground">{workflowPlan.domain_title || workflowPlan.domainTitle || "Generated Workflow"}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground line-clamp-3">
                  {workflowPlan.routing_reason || workflowPlan.routingReason || "The planner selected the minimum required specialists for this task."}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant="secondary" className="text-[9px] font-bold uppercase tracking-[0.18em]">
                  {plannerSource}
                </Badge>
                <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-[0.18em] border-border/60 text-muted-foreground">
                  {String(runtimeEngine).replace(/_/g, " ")}
                </Badge>
	                <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-[0.18em] border-primary/20 text-primary">
	                  {String(routeOutputType).replace(/_/g, " ")}
	                </Badge>
	                {(workflowPlan.route_quality || workflowPlan.routeQuality) && (
	                  <Badge variant="outline" className={`text-[9px] font-bold uppercase tracking-[0.18em] ${matchBadgeClass((workflowPlan.route_quality || workflowPlan.routeQuality) === "adapted" ? "adapted" : (workflowPlan.route_quality || workflowPlan.routeQuality) === "gap" ? "missing" : "exact")}`}>
	                    {String(workflowPlan.route_quality || workflowPlan.routeQuality).replace(/_/g, " ")}
	                  </Badge>
	                )}
	              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border/40 bg-background/65 px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Requested</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{workflowPlan.requested_agents || workflowPlan.requestedAgents || nodes.length}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/65 px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Planned</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{workflowPlan.generated_agents || workflowPlan.generatedAgents || nodes.length}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/65 px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Evidence</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{Array.isArray(routeEvidence) ? routeEvidence.length : 0}</p>
              </div>
            </div>

            {Array.isArray(routeEvidence) && routeEvidence.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {routeEvidence.slice(0, 4).map((item: string) => (
                  <Badge key={item} variant="outline" className="text-[9px] font-bold uppercase tracking-[0.16em] border-primary/20 text-primary">
                    {item}
                  </Badge>
                ))}
              </div>
            )}

            {Array.isArray(structuredRoute) && structuredRoute.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[9px] font-black uppercase tracking-[0.24em] text-muted-foreground">Stage plan</p>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {structuredRoute.slice(0, 6).map((stage: any, index: number) => (
                    <div key={`${stage.agent_id || stage.id || index}`} className="rounded-xl border border-border/40 bg-background/65 p-3">
	                      <div className="flex items-center justify-between gap-3">
	                        <p className="truncate text-xs font-semibold text-foreground">{stage.stage || stage.label || `Stage ${index + 1}`}</p>
	                        <Badge variant="outline" className={`text-[9px] font-bold uppercase tracking-[0.16em] ${matchBadgeClass(stage.match_type || stage.matchType)}`}>
	                          {formatMatchType(stage.match_type || stage.matchType)}
	                        </Badge>
	                      </div>
	                      <p className="mt-1 truncate text-[10px] font-semibold text-foreground/70">
	                        {stage.requested_role || stage.agent_name || stage.agent || stage.agent_id}
	                      </p>
	                      <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-muted-foreground">
                        {stage.selection_reason || stage.reason || "Selected by the planner for this route."}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="border-b border-border/30 px-4 py-3">
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-2xl border border-border/40 bg-background/60 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Cycle</p>
            <p className="mt-1 text-sm font-bold text-foreground">{isSimulationRunActive ? simulationCycle : backendStatus === "running" ? "live" : "0"}</p>
          </div>
          <div className="rounded-2xl border border-border/40 bg-background/60 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Speed</p>
            <p className="mt-1 text-sm font-bold text-foreground">{isSimulationRunActive ? "Logical" : "Max"}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-full min-h-[48px] flex-col gap-1 rounded-2xl text-[10px]"
            disabled={simulationControlBusy !== null || !(canPauseSimulation || canResumeSimulation)}
            onClick={canResumeSimulation ? handleResumeSimulation : handlePauseSimulation}
          >
            <Pause className={`h-3.5 w-3.5 ${simulationControlBusy === "pause" || simulationControlBusy === "resume" ? "animate-pulse" : ""}`} />
            {canResumeSimulation ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-full min-h-[48px] flex-col gap-1 rounded-2xl text-[10px]"
            disabled={simulationControlBusy !== null || !canStepSimulation}
            onClick={handleStepSimulation}
          >
            <StepForward className={`h-3.5 w-3.5 ${simulationControlBusy === "step" ? "animate-pulse" : ""}`} />
            Step
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-2xl border border-border/40 bg-background/50 px-3 py-2">
          <Gauge className="h-3.5 w-3.5 text-primary" />
          <p className="text-[11px] leading-5 text-muted-foreground">
            {isSimulationRunActive
              ? backendStatus === "paused"
                ? "Simulation is paused. Resume to continue polling, or Step to inspect the latest checkpoint."
                : "Simulation controls are attached to the backend runner for pause, resume, and checkpoint stepping."
              : "Simulation controls become active when this workflow runs in Simulation mode."}
          </p>
        </div>
      </div>

      <div className="px-3 pt-3">
        <div className="rounded-2xl border border-border/50 bg-background/70 p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Run board</p>
              <h3 className="mt-1 truncate text-sm font-semibold text-foreground">
                {liveSummary.current ? liveSummary.current.agentName : "Waiting for the first agent"}
              </h3>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {liveSummary.current?.selectionReason || "The live board shows which agent is active while the rest stay idle or complete."}
              </p>
            </div>
            <Badge variant="outline" className={`text-[10px] uppercase tracking-[0.18em] ${getRunBadgeClass(backendStatus || phase)}`}>
              {getRunStatusLabel(backendStatus || phase)}
            </Badge>
            <Badge variant="outline" className="text-[9px] uppercase tracking-[0.18em] border-border/60 text-muted-foreground">
              {String(runtimeEngine).replace(/_/g, " ")}
            </Badge>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <div className="rounded-xl border border-border/40 bg-primary/5 px-2 py-2 text-center">
              <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Active</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{liveSummary.running}</p>
            </div>
            <div className="rounded-xl border border-border/40 bg-secondary/30 px-2 py-2 text-center">
              <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Idle</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{liveSummary.idle}</p>
            </div>
            <div className="rounded-xl border border-border/40 bg-emerald-500/5 px-2 py-2 text-center">
              <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Done</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{liveSummary.done}</p>
            </div>
            <div className="rounded-xl border border-border/40 bg-rose-500/5 px-2 py-2 text-center">
              <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Failed</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{liveSummary.failed}</p>
            </div>
          </div>
          {failureDetails && (
            <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-600">Failure focus</p>
              <p className="mt-1 text-sm font-semibold text-rose-700">{failureDetails.agentName}</p>
              <p className="mt-1 text-xs leading-5 text-rose-700/90">{failureDetails.reason}</p>
            </div>
          )}
        </div>
      </div>

      {/* Phase 1: Task Input */}
      {phase === "input" && (
        <div className="p-4 space-y-3 border-b border-border/30">
          <div className="relative">
            <Textarea
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="Describe your task... e.g., 'Research AI trends and write a blog post'"
              className="min-h-[100px] bg-secondary/30 border-border/50 text-sm resize-none pr-10"
            />
          </div>

            {/* Attached files list */}
          <AnimatePresence>
            {attachedFiles.length > 0 && (
              <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="flex flex-wrap gap-1.5 overflow-hidden">
                {attachedFiles.map((f, i) => (
                  <span key={i} className="flex items-center gap-1 text-[10px] bg-secondary/50 rounded px-2 py-1 text-muted-foreground">
                    <FileText className="h-2.5 w-2.5" /> {f}
                    {/* Remove individual file from list */}
                    <button onClick={() => setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i))} className="hover:text-foreground">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileChange} />
            {/* Attach button — opens the native file picker */}
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleAttachFile}>
              <Paperclip className="h-3 w-3" /> Attach
            </Button>
            {/* Run button — starts execution pipeline */}
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 flex-1"
              onClick={handleRun}
              disabled={!taskInput.trim() || nodes.length === 0}
            >
              <Send className="h-3 w-3" /> Run Workflow
            </Button>
          </div>

          {/* Warning when canvas is empty */}
          {nodes.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center">Add agents to the canvas first</p>
          )}
        </div>
      )}

      {/* Phase 2 & 3: Agent execution steps (timeline) */}
      {(phase === "running" || phase === "paused" || phase === "complete" || phase === "approval" || phase === "failed") && (
        <div className={`${phase === "complete" ? "max-h-[48%]" : "flex-1"} border-b border-border/30 flex flex-col min-h-0`}>
          <div className="px-4 py-3 space-y-3 border-b border-border/30 bg-secondary/10">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Badge
                  variant={phase === "complete" ? "outline" : phase === "approval" ? "secondary" : "secondary"}
                  className={`text-[10px] uppercase tracking-[0.18em] font-bold ${
                    phase === "approval" ? "bg-amber-500/15 text-amber-600" : ""
                  }`}
                >
                  {getRunStatusLabel(backendStatus || phase)}
                </Badge>
                {backendRunId && (
                  <span className="text-[10px] text-muted-foreground truncate">
                    Backend run {backendRunId.slice(0, 8)}
                  </span>
                )}
              </div>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {steps.filter((s) => s.status === "done").length}/{steps.length} done
              </Badge>
            </div>

            <div className="rounded-xl border border-border/40 bg-background/60 p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Current step</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5 truncate">
                    {(() => {
                      const active = steps.find((s) => s.id === currentStepId);
                      if (hasCompleteRun) return "Workflow complete";
                      return active ? `${active.emoji} ${active.agentName}` : "Waiting to start";
                    })()}
                  </p>
                  {(() => {
                    const active = steps.find((s) => s.id === currentStepId);
                    if (hasCompleteRun) {
                      return (
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground line-clamp-2">
                          All steps completed successfully. Open the output to review the final handoff, files, and preview.
                        </p>
                      );
                    }
                    return active?.selectionReason ? (
                      <p className="mt-1 text-[11px] leading-5 text-muted-foreground line-clamp-2">{active.selectionReason}</p>
                    ) : null;
                  })()}
                </div>
                {(() => {
                  const active = steps.find((s) => s.id === currentStepId);
                  return hasCompleteRun ? (
                    <Badge variant="outline" className="text-[10px] shrink-0 border-emerald-500/20 text-emerald-600 bg-emerald-500/10">
                      Complete
                    </Badge>
                  ) : active?.model ? (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {active.model}
                    </Badge>
                  ) : null;
                })()}
              </div>
              <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                {phase === "approval"
                  ? "A human approval is required before execution can continue. Review the queue in Permissions and return here after the decision is recorded."
                  : phase === "failed"
                  ? "The backend reported a failed step. The failed agent and reason are shown below."
                  : phase === "paused"
                  ? "Simulation is paused. You can resume the run or inspect the latest checkpoint with Step."
                  : phase === "running"
                  ? "The workflow is executing step by step. Expand the current step to inspect the latest input and output."
                  : hasCompleteRun && displayedOutput.markdown
                  ? displayedOutput.markdown.split("\n").filter((line) => line.trim() && !line.startsWith("#")).slice(0, 2).join(" ")
                  : finalOutput?.markdown
                    ? finalOutput.markdown.split("\n").filter((line) => line.trim() && !line.startsWith("#")).slice(0, 2).join(" ")
                    : hasCompleteRun
                      ? "The run completed, but the result bundle is still syncing."
                      : "The run completed, but no markdown output was produced yet."}
              </p>
            </div>

            {phase === "approval" && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600/80">Approval required</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">Pause is awaiting human review</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs border-amber-500/20 text-amber-600 hover:bg-amber-500/10" onClick={() => navigate("/permissions")}>
                    Open Approvals
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  The workflow reached a governance gate. Approve or reject the pending action in the Approvals queue to continue.
                </p>
              </div>
            )}

            {hasCompleteRun && (
              <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70">Result snapshot</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">Workflow output is ready</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleOpenInTab}>
                    Open in Tab
                  </Button>
                </div>
              </div>
            )}

            {phase === "failed" && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-600/80">Run failed</p>
                      <Badge variant="outline" className={`text-[9px] px-2 py-0.5 uppercase tracking-[0.18em] ${getFailureBadgeClass(failureDetails?.kind)}`}>
                        {failureDetails?.label || "Runtime issue"}
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-foreground mt-0.5 truncate">
                      {failureDetails?.agentName || "An agent"} failed
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {failureDetails?.reason || "The backend reported a failure, but no readable reason was returned."}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs border-rose-500/20 text-rose-600 hover:bg-rose-500/10" onClick={() => setPhase("input")}>
                    Back to input
                  </Button>
                </div>
              </div>
            )}
          </div>
          <AgentStepTracker steps={steps} focusStepId={currentStepId} />
        </div>
      )}

      {/* Phase 3: Results viewer */}
      {hasCompleteRun && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-4 pt-4 pb-3 border-b border-border/30 bg-secondary/10">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Results Ready</span>
              </div>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleOpenInTab}>
                <ExternalLink className="h-3.5 w-3.5" /> Open in Tab
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-3">
              {finalOutput.markdown && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <FileText className="h-2.5 w-2.5" />
                  {finalOutput.markdown.split(/\s+/).length} words
                </Badge>
              )}
              {finalOutput.files && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <FileCode className="h-2.5 w-2.5" />
                  {finalOutput.files.length} files
                </Badge>
              )}
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Bot className="h-2.5 w-2.5" />
                {steps.length} agents
              </Badge>
            </div>
            {displayedOutput.markdown && (
              <p className="mt-2 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {displayedOutput.markdown.split("\n").filter(l => l.trim() && !l.startsWith("#") && !l.startsWith("---")).slice(0, 2).join(" ")}
              </p>
            )}
          </div>
          <div className="flex-1 min-h-0">
            {finalOutput ? (
              <OutputViewer output={finalOutput} />
            ) : (
              <div className="flex h-full items-center justify-center px-6 py-10 text-center">
                <div className="max-w-md space-y-3 rounded-2xl border border-border/50 bg-background/70 p-6 shadow-sm">
                  <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Results are syncing</p>
                    <p className="text-xs leading-5 text-muted-foreground">The backend marked this run complete. Open the output page to review the latest bundle once hydration finishes.</p>
                  </div>
                  {evaluationLoading ? (
                    <div className="rounded-2xl border border-border/40 bg-secondary/20 px-4 py-3 text-left text-xs text-muted-foreground">
                      Loading evaluation summary...
                    </div>
                  ) : evaluation ? (
                    <div className="rounded-2xl border border-border/40 bg-secondary/20 px-4 py-3 text-left">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Review outcome</p>
                          <p className="mt-1 text-sm font-semibold text-foreground capitalize">{String(evaluation.status || "needs_review").replace(/_/g, " ")}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Score</p>
                          <p className="text-base font-semibold text-foreground">{evaluation.score}/{evaluation.max_score}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{evaluation.summary}</p>
                    </div>
                  ) : null}
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleOpenInTab}>
                    <ExternalLink className="h-3.5 w-3.5" /> Open in Tab
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Completion actions — output option sits at the bottom when finished */}
      {hasCompleteRun && (
        <div className="p-3 border-t border-border/30 bg-card/80 backdrop-blur-sm sticky bottom-0 z-20">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Output option</p>
              <p className="text-xs text-muted-foreground truncate">Open the full workflow output page or run the task again.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={handleOpenInTab}
                disabled={!hasRenderableOutput}
              >
                <ExternalLink className="h-3 w-3" /> Open Output
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => { setPhase("input"); setSteps([]); setFinalOutput(null); }}
              >
                Run Again
              </Button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
