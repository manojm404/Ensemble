import { useParams, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Play, Save, X, Search, Plus, Settings2, Loader2, CheckCircle2, Wand2, Sparkles, FileText, Bot, ChevronLeft, TestTube, GitBranch, Radio, Eye, EyeOff, ShieldCheck, Activity, Layers3 } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { getWorkflow, saveWorkflow, getAgents, type AgentSkill } from "@/lib/api";
import { categoryColors } from "@/lib/agent-metadata";
import { MagicWandDialog } from "@/components/workflow/MagicWandDialog";
import { generateWorkflowFromPrompt } from "@/lib/workflow-generator";
import { WorkflowOutputProvider } from "@/lib/workflow-output-context";
import { WorkflowExecutionPanel } from "@/components/workflow/WorkflowExecutionPanel";
import { WorkflowValidationSummary } from "@/components/workflow/WorkflowValidationSummary";
import { useTabContext, allApps } from "@/lib/tab-context";
import { validateWorkflowGraph } from "@/lib/workflow-validation";

const STUDIO_STAGES = ["Intake", "Brief", "Plan", "Route", "Execute", "Verify", "Package", "Preview", "Audit"];

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

function formatConfidence(value?: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "";
  return `${Math.round(Math.max(0, Math.min(1, numeric)) * 100)}%`;
}

// --- Agent Node ---
const nodeStyle = {
  background: "linear-gradient(145deg, hsl(222, 19%, 13%), hsl(220, 18%, 9%))",
  border: "1px solid hsl(206, 40%, 24%)",
  borderRadius: "1.15rem",
  color: "hsl(210, 20%, 92%)",
  padding: "0",
  fontSize: "12px",
  minWidth: "260px",
  boxShadow: "0 22px 70px rgba(2, 6, 23, 0.34), inset 0 1px 0 rgba(255,255,255,0.04)",
};

function AgentNode({ id, data, selected }: NodeProps) {
  const hasResetContext = data.reset_context !== false;
  const hasVerification = Array.isArray(data.verification_commands) && data.verification_commands.length > 0;
  const hasCodeTools = Array.isArray(data.tools) && data.tools.some(t => ['write_file', 'shell_cmd'].includes(t));
  const timingPolicy = (data.timing_policy as any)?.type || data.timingPolicy || "dependency";
  const visibility = data.visibility || "public";
  const outputStateKey = data.output_state_key || data.outputStateKey;
  const runtimeStatus = String(data.runtime_status || "").toLowerCase();
  const matchType = data.match_type || data.matchType;
  const matchConfidence = formatConfidence(data.match_confidence || data.matchConfidence);
  const runtimeLabel = runtimeStatus === "running"
    ? "Working now"
    : runtimeStatus === "done" || runtimeStatus === "completed"
      ? "Done"
      : runtimeStatus === "error" || runtimeStatus === "failed"
        ? "Failed"
        : runtimeStatus === "pending"
          ? "Idle"
          : "";

  const modelColor = useMemo(() => {
    const model = data.model || '';
    if (model.includes('opus') || model.includes('pro')) return 'bg-blue-500';
    if (model.includes('sonnet') || model.includes('flash')) return 'bg-green-500';
    return 'bg-gray-500';
  }, [data.model]);

  return (
    <div className={`relative group overflow-hidden ${selected ? "ring-2 ring-primary rounded-[1.15rem]" : ""}`} style={nodeStyle}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/50 to-transparent" />
      <Handle type="target" position={Position.Left} style={{ background: "hsl(195, 90%, 56%)", border: "none", width: 10, height: 10 }} />
      <Handle type="source" position={Position.Right} style={{ background: "hsl(195, 90%, 56%)", border: "none", width: 10, height: 10 }} />
      <button
        className="absolute -top-2 -right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:scale-110 shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent("delete-node", { detail: { nodeId: id } }));
        }}
        title="Remove agent"
      >
        <X className="h-3 w-3" />
      </button>
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${modelColor} shadow-[0_0_18px_currentColor]`} title={`Model: ${data.model || 'Default'}`}></div>
              <div className="truncate text-[14px] font-semibold tracking-tight">{data.label as string}</div>
            </div>
            <div className="mt-1 line-clamp-2 text-[11px] leading-5" style={{ color: "hsl(215, 15%, 63%)" }}>
              {data.subtitle as string || "New Step"}
            </div>
          </div>
          <div className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${matchBadgeClass(matchType)}`}>
            {formatMatchType(matchType)}
          </div>
        </div>
        {matchConfidence && (
          <div className="mt-2 rounded-xl border border-white/5 bg-white/[0.035] px-2.5 py-2 text-[10px] font-semibold text-slate-300">
            Route confidence: {matchConfidence}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/5 bg-white/[0.035] px-2.5 py-2">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">Timing</p>
            <p className="mt-1 truncate text-[11px] font-semibold text-slate-200">{String(timingPolicy).replace(/_/g, " ")}</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.035] px-2.5 py-2">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">Visibility</p>
            <p className="mt-1 truncate text-[11px] font-semibold text-slate-200">{String(visibility).replace(/_/g, " ")}</p>
          </div>
        </div>

        {outputStateKey && (
          <div className="mt-2 rounded-xl border border-emerald-400/15 bg-emerald-400/10 px-2.5 py-2 text-[10px] font-semibold text-emerald-100">
            Writes state: {String(outputStateKey)}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
            {runtimeLabel && (
              <div
                className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${
                  runtimeStatus === "running"
                    ? "border-sky-400/30 bg-sky-400/10 text-sky-200"
                    : runtimeStatus === "done" || runtimeStatus === "completed"
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                      : runtimeStatus === "failed" || runtimeStatus === "error"
                        ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
                        : "border-slate-400/20 bg-slate-400/10 text-slate-200"
                }`}
              >
                {runtimeLabel}
              </div>
            )}
            {hasResetContext && (
              <div title="Fresh context per node" className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="text-base">🔄</span>
              </div>
            )}
            {hasCodeTools && (
              <div title="Auto-commit before execution" className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="text-base">⎇</span>
              </div>
            )}
            {hasVerification && (
              <div title="Verification Enabled" className="flex items-center gap-1 text-xs text-muted-foreground">
                <TestTube className="h-3.5 w-3.5 text-indigo-400" />
              </div>
            )}
            <span className="ml-auto text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">lane ready</span>
        </div>
      </div>
    </div>
  );
}

// --- Node Inspector ---
interface NodeInspectorProps {
  node: Node | null;
  onClose: () => void;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
}

function NodeInspector({ node, onClose, onUpdate }: NodeInspectorProps) {
  if (!node) return null;
  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 320, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="h-full border-l border-border/50 bg-card/80 backdrop-blur-xl overflow-hidden shrink-0"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground truncate">Node Properties</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="h-[calc(100%-49px)]">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border/30">
            <span className="text-2xl">{(node.data.label as string)?.split(" ")[0]}</span>
            <div>
              <p className="text-sm font-semibold text-foreground">{(node.data.label as string)?.split(" ").slice(1).join(" ")}</p>
              <p className="text-xs text-muted-foreground">{node.data.subtitle as string}</p>
            </div>
          </div>
          {(node.data.match_type || node.data.matchType) && (
            <div className="grid grid-cols-2 gap-2">
              <div className={`rounded-xl border px-3 py-2 ${matchBadgeClass(node.data.match_type || node.data.matchType)}`}>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-70">Match</p>
                <p className="mt-1 text-xs font-bold">{formatMatchType(node.data.match_type || node.data.matchType)}</p>
              </div>
              <div className="rounded-xl border border-border/45 bg-secondary/40 px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Confidence</p>
                <p className="mt-1 text-xs font-bold text-foreground">{formatConfidence(node.data.match_confidence || node.data.matchConfidence) || "n/a"}</p>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Action / Step Label</Label>
            <Input defaultValue={node.data.subtitle as string} className="bg-secondary/50 border-border/50 h-9 text-sm"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(node.id, { ...node.data, subtitle: e.target.value })} />
          </div>
          {node.data.selection_reason && (
            <div className="space-y-2 rounded-xl border border-primary/15 bg-primary/5 p-3">
              <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Routing rationale</Label>
              <p className="text-xs leading-5 text-foreground/75">{node.data.selection_reason as string}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Model</Label>
            <Select defaultValue={(node.data.model as string) || "gpt-4o"} onValueChange={(val) => onUpdate(node.id, { ...node.data, model: val })}>
              <SelectTrigger className="bg-secondary/50 border-border/50 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                <SelectItem value="claude-3.5-sonnet">Claude 3.5 Sonnet</SelectItem>
                <SelectItem value="gemini-pro">Gemini Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Temperature: {((node.data.temperature as number) || 0.5).toFixed(1)}</Label>
            <Slider defaultValue={[(node.data.temperature as number) || 0.5]} max={1} step={0.1}
              onValueChange={([val]) => onUpdate(node.id, { ...node.data, temperature: val })} />
          </div>

          <div className="flex items-center justify-between py-2 border-y border-border/30 my-2">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium text-foreground">Reset Context</Label>
              <p className="text-[10px] text-muted-foreground">Clear conversation history before this node runs. Required for complex engineering tasks.</p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Switch
                    checked={node.data.reset_context !== false}
                    onCheckedChange={(checked) => onUpdate(node.id, { ...node.data, reset_context: checked })}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">When on, only a structured summary is passed to the next agent — no raw conversation history. Use `&lbrace;&lbrace;Node.output&rbrace;&rbrace;` bindings to explicitly inject full code.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">System Prompt</Label>
            <Textarea defaultValue={(node.data.prompt as string) || ""} className="bg-secondary/50 border-border/50 min-h-[100px] text-sm"
              placeholder="Enter system prompt..."
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdate(node.id, { ...node.data, prompt: e.target.value })} />
          </div>

          <div className="space-y-2 pt-2 border-t border-border/30">
            <Label className="text-xs font-medium text-foreground">Verification Commands (ADR-3)</Label>
            <p className="text-[10px] text-muted-foreground mb-2">Run deterministic checks after agent execution. E.g., `npm test`, `pytest`. One command per line.</p>
            <Textarea
              defaultValue={Array.isArray(node.data.verification_commands) ? node.data.verification_commands.join('\n') : (node.data.verification_commands as string) || ""}
              className="bg-secondary/50 border-border/50 min-h-[60px] text-xs font-mono"
              placeholder="pytest\nflake8 ."
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdate(node.id, { ...node.data, verification_commands: e.target.value.split('\n').filter(c => c.trim()) })}
            />
          </div>
        </div>
      </ScrollArea>
    </motion.div>
  );
}

// --- Empty State ---
function CanvasEmptyState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4 pointer-events-auto max-w-md text-center px-6"
      >
        <div className="relative">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center border border-primary/10">
            <Sparkles className="h-8 w-8 text-primary/70" />
          </div>
        </div>
        <div className="text-center">
          <h3 className="text-base font-semibold text-foreground mb-1">Start with a clean canvas</h3>
          <p className="text-xs text-muted-foreground leading-5">
            Add a specialist manually or generate a workflow from a single prompt. Keep it simple, then refine.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// --- Main Editor ---
function WorkflowEditorInner() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const { openApp } = useTabContext();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [availableAgents, setAvailableAgents] = useState<AgentSkill[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [workflowName, setWorkflowName] = useState("New Workflow");
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const [magicWandOpen, setMagicWandOpen] = useState(false);
  const [isGeneratingWorkflow, setIsGeneratingWorkflow] = useState(false);
  const [executionPanelOpen, setExecutionPanelOpen] = useState(false);
  const [initialTask, setInitialTask] = useState("");
  const [storedOutput, setStoredOutput] = useState<any>(null);
  const [workflowPlan, setWorkflowPlan] = useState<any>(null);
  const [pendingWorkflowDraft, setPendingWorkflowDraft] = useState<any>(null);
  const [revealPrivateChannels, setRevealPrivateChannels] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const reactFlowInstance = useReactFlow();

  const nodeTypes = useMemo(() => ({ agentNode: AgentNode }), []);

  const filteredAgents = availableAgents.filter(
    (a) => a.name.toLowerCase().includes(search.toLowerCase()) || a.description.toLowerCase().includes(search.toLowerCase())
  );

  const groupedAgents = useMemo(() => {
    const groups: Record<string, AgentSkill[]> = {};
    filteredAgents.forEach(agent => {
      const cat = agent.category || "General";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(agent);
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredAgents]);

  const workflowValidation = useMemo(() => validateWorkflowGraph(nodes, edges), [nodes, edges]);
  const workflowMode = workflowPlan?.workflow_mode || workflowPlan?.workflowMode || "dag";
  const outputType = workflowPlan?.final_output_type || workflowPlan?.finalOutputType || (workflowPlan ? "auto package" : "manual");
  const canRunWorkflow = nodes.length > 0;
  const edgeStats = useMemo(() => {
    const privateEdges = edges.filter((edge: any) => edge?.data?.visibility === "private" || edge?.visibility === "private");
    const auditHiddenEdges = edges.filter((edge: any) => edge?.data?.visibility === "hidden_until_audit" || edge?.visibility === "hidden_until_audit");
    const messageEdges = edges.filter((edge: any) => edge?.data?.kind === "message" || edge?.kind === "message");
    const signalEdges = edges.filter((edge: any) => edge?.data?.kind === "signal" || edge?.kind === "signal");
    return { privateEdges: privateEdges.length, auditHiddenEdges: auditHiddenEdges.length, messageEdges: messageEdges.length, signalEdges: signalEdges.length };
  }, [edges]);

  const applyPendingWorkflowDraft = useCallback(() => {
    if (!pendingWorkflowDraft) return;

    setNodes((pendingWorkflowDraft.nodes || []).map((node: Node, index: number) => ({
      ...node,
      data: {
        ...node.data,
        workflow_mode: pendingWorkflowDraft.metadata?.workflow_mode || node.data?.workflow_mode,
        timing_policy: node.data?.timing_policy || (pendingWorkflowDraft.metadata?.workflow_mode === "simulation"
          ? { type: index === (pendingWorkflowDraft.nodes?.length || 1) - 1 ? "on_finalization" : "every_cycle" }
          : { type: "dependency" }),
        visibility: node.data?.visibility || "public",
      },
    })));
    setEdges(pendingWorkflowDraft.edges || []);
    setWorkflowPlan(pendingWorkflowDraft.metadata || null);
    setPendingWorkflowDraft(null);
    setSelectedNode(null);
    setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 100);
    toast.success("Recommended route applied to the canvas.");
  }, [pendingWorkflowDraft, reactFlowInstance, setEdges, setNodes]);

  useEffect(() => {
    const init = async () => {
      try {
        const agents = await getAgents();
        setAvailableAgents(agents);
        setAgentsLoading(false);
        if (routeId && routeId !== "new") {
          const wf = await getWorkflow(routeId);
          setWorkflowName(wf.name);
          const graph = JSON.parse(wf.graph_json);
          setWorkflowPlan(graph?.metadata || null);
          setPendingWorkflowDraft(null);
          const loadedNodes = graph.nodes || [];
          const loadedEdges = (graph.edges || []).map((edge: Edge) => {
            const targetNode = loadedNodes.find((n: Node) => n.id === edge.target);
            const isSummaryEdge = targetNode?.data?.reset_context !== false;
            return {
              ...edge,
              animated: !isSummaryEdge,
              style: { stroke: isSummaryEdge ? "hsl(210, 100%, 80%)" : "hsl(195, 90%, 50%)", strokeDasharray: isSummaryEdge ? "5 5" : undefined },
              label: isSummaryEdge ? "📋" : undefined,
            };
          });
          setNodes(loadedNodes);
          setEdges(loadedEdges);
          restoreStoredOutput(routeId);

          // Check if this is a rerun — pre-fill previous task details
          try {
            const rerunData = sessionStorage.getItem(`rerun_${routeId}`);
            if (rerunData) {
              const prev = JSON.parse(rerunData);
              if (prev.lastOutput) {
                setInitialTask(prev.lastOutput);
              }
              setExecutionPanelOpen(true);
              sessionStorage.removeItem(`rerun_${routeId}`);
            }
          } catch { /* ignore if no rerun data */ }
        } else {
          // A fresh canvas must not inherit the prior workflow's graph, output, or task.
          setWorkflowName("New Workflow");
          setWorkflowPlan(null);
          setPendingWorkflowDraft(null);
          setInitialTask("");
          setStoredOutput(null);
          setSelectedNode(null);
          setNodes([]);
          setEdges([]);
          setExecutionPanelOpen(false);
        }
      } catch (e) {
        console.error("Failed to load workflow data:", e);
        setAgentsLoading(false);
      }
    };
    init();
  }, [routeId, setNodes, setEdges]);

  // Re-check localStorage when window regains focus (e.g., after switching tabs/models)
  const restoreStoredOutput = useCallback((id: string) => {
    // Check workflow_run_* (running/complete state) FIRST to prioritize active runs over old cache
    try {
      const runRaw = localStorage.getItem(`workflow_run_${id}`);
      if (runRaw) {
        const runState = JSON.parse(runRaw);
        if (runState.phase === "running") {
          // If the task is running, don't clobber state that's actively being modified in the background. Just open it.
          if (runState.task) setInitialTask(runState.task);
          setStoredOutput(null); // Force clear old output so it shows running
          // Only force open if we aren't already actively looking at it to prevent render loops
          setExecutionPanelOpen((prev) => prev || true);
          return;
        }
        if (runState.phase === "complete") {
          if (runState.task) setInitialTask(runState.task);
          if (runState.output) setStoredOutput(runState);
          setExecutionPanelOpen((prev) => prev || true);
          return;
        }
      }
    } catch { /* ignore */ }

    // Check ensemble_workflow_outputs (completed runs) ONLY if not actively running
    try {
      const raw = localStorage.getItem("ensemble_workflow_outputs");
      if (raw) {
        const parsed = JSON.parse(raw);
        const stored = parsed[id];
        if (stored?.output?.markdown) {
          setStoredOutput(stored);
          if (stored.task) setInitialTask(stored.task);
          setExecutionPanelOpen((prev) => prev || true);
          return;
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const onFocus = () => {
      if (routeId && routeId !== "new") {
        restoreStoredOutput(routeId);
      }
    };
    
    const onWorkflowComplete = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.runId === routeId) {
        restoreStoredOutput(routeId);
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === `workflow_run_${routeId}`) {
        restoreStoredOutput(routeId);
      }
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("workflow_complete", onWorkflowComplete);
    window.addEventListener("storage", onStorage);
    
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("workflow_complete", onWorkflowComplete);
      window.removeEventListener("storage", onStorage);
    };
  }, [routeId, restoreStoredOutput]);

  const { updateCurrentTabUrl } = useTabContext();

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const graphJson = JSON.stringify({ nodes, edges, metadata: workflowPlan });
      const result = await saveWorkflow(workflowName, graphJson, routeId !== "new" ? routeId : undefined);
      if (routeId === "new" && result.id) {
        navigate(`/workflows/${result.id}`, { replace: true });
        // Update the tab context so TopBar doesn't get confused
        updateCurrentTabUrl(`/workflows/${result.id}`, workflowName, "workflows");
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      console.error("Save failed:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      if (selectedNode?.id === nodeId) setSelectedNode(null);
    },
    [setNodes, setEdges, selectedNode]
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.nodeId) deleteNode(detail.nodeId);
    };
    window.addEventListener("delete-node", handler);
    return () => window.removeEventListener("delete-node", handler);
  }, [deleteNode]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const targetNode = nodes.find(n => n.id === connection.target);
      const isSummaryEdge = targetNode?.data?.reset_context !== false;
      const newEdge = {
        ...connection,
        animated: !isSummaryEdge,
        style: { stroke: isSummaryEdge ? "hsl(210, 100%, 80%)" : "hsl(195, 90%, 50%)", strokeDasharray: isSummaryEdge ? "5 5" : undefined },
        label: isSummaryEdge ? "📋" : undefined,
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges, nodes]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNode(node), []);
  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  const handleUpdateNodeData = useCallback(
    (nodeId: string, newData: Record<string, unknown>) => {
      setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: newData } : n)));
    },
    [setNodes]
  );

  useEffect(() => {
    const onWorkflowRunStatus = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || (detail.workflowId !== routeId && detail.runId !== routeId) || !Array.isArray(detail.nodeStatuses)) return;

      const statusByNode = new Map<string, any>();
      detail.nodeStatuses.forEach((item: any) => {
        if (item?.node_id) statusByNode.set(item.node_id, item);
      });

      setNodes((prev) =>
        prev.map((node, index) => {
          const nodeStatus = statusByNode.get(node.id);
          const status = String(nodeStatus?.status || "").toLowerCase();
          const runtimeStatus = status
            || (detail.currentNodeId === node.id && detail.status === "running" ? "running" : "")
            || (detail.status === "completed" || detail.status === "complete" ? "done" : "");
          if (!runtimeStatus) return node;
          return {
            ...node,
            data: {
              ...node.data,
              runtime_status: runtimeStatus,
              runtime_label: nodeStatus?.label || node.data?.label || `Step ${index + 1}`,
            },
          };
        })
      );
    };

    window.addEventListener("workflow_run_status", onWorkflowRunStatus);
    return () => window.removeEventListener("workflow_run_status", onWorkflowRunStatus);
  }, [routeId, setNodes]);

  const handleMagicGenerate = useCallback(
    async (prompt: string, options: { agentCount: number; mode?: string; outputType?: string; maxCycles?: number; seed?: string; manualControl?: boolean }) => {
      setIsGeneratingWorkflow(true);
      try {
        await new Promise((r) => setTimeout(r, 1200));
        const result = await generateWorkflowFromPrompt(prompt, availableAgents, options);
        const promptLower = prompt.toLowerCase();
        const explicitlyDag = /\bdag\b|dag mode|run in series|series mode|sequential|passes its output to the next/.test(promptLower);
        const explicitlySimulation = /\bsimulation mode\b|\bevented simulation\b|\blogical cycle\b|\bmanual stepping\b/.test(promptLower);
        const selectedMode = options.mode && options.mode !== "auto"
          ? options.mode
          : explicitlyDag
            ? "dag"
            : explicitlySimulation || /chaos|inventory|broadcast|private|sabotage|banana/i.test(prompt)
            ? "simulation"
            : "dag";
        const selectedOutputType = options.outputType && options.outputType !== "auto"
          ? options.outputType
          : /plain text|text log|log with|report|email chain|investigative|document|no web app|no html/i.test(prompt)
            ? "document"
            : /website|web app|html|css|javascript|preview/i.test(prompt)
              ? "web_app"
              : "auto";
        const enrichedMetadata = {
          ...((result as any)?.metadata || {}),
          workflow_mode: selectedMode,
          final_output_type: selectedOutputType,
          simulation_defaults: selectedMode === "simulation" ? {
            cycle_type: "logical_tick",
            speed_mode: "max",
            soft_max_cycles: options.maxCycles || 8,
            hard_max_cycles: 20,
            random_seed: options.seed || null,
            checkpoint_interval_cycles: 1,
            manual_control: Boolean(options.manualControl),
          } : undefined,
        };
        setWorkflowName(result.name);
        setWorkflowPlan(enrichedMetadata);
        setPendingWorkflowDraft({
          name: result.name,
          nodes: result.nodes,
          edges: result.edges,
          metadata: enrichedMetadata,
        });
        setNodes([]);
        setEdges([]);
        setMagicWandOpen(false);
        setSelectedNode(null);
        setInitialTask(prompt);
        setExecutionPanelOpen(false);
        toast.info("Draft route ready", {
          description: "Review the recommended agents, then apply the route to place it on the canvas.",
        });
        setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 100);
      } catch (error: any) {
        console.error("AI workflow generation failed:", error);
        toast.error("Failed to generate workflow", {
          description: error?.message || "Please try a more specific prompt.",
        });
      } finally {
        setIsGeneratingWorkflow(false);
      }
    },
    [availableAgents, reactFlowInstance, setEdges, setNodes]
  );

  const handleAddAgent = useCallback(
    (agent: AgentSkill) => {
      const viewport = reactFlowInstance.getViewport();
      const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
      const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;
      const newNode: Node = {
        id: `${agent.id}-${Date.now()}`,
        type: "agentNode",
        position: { x: centerX + (Math.random() - 0.5) * 100, y: centerY + (Math.random() - 0.5) * 100 },
        data: {
          label: `${agent.emoji || "🤖"} ${agent.name}`,
          subtitle: agent.description,
          model: "gemini-2.5-flash",
          temperature: 0.5,
          prompt: "",
          // Critical: These fields are read by the DAG engine
          role: agent.id,  // Skill file identifier
          instruction: agent.description  // Fallback instruction
        },
      };
      setNodes((nds) => [...nds, newNode]);
      setAddOpen(false);
      setSearch("");
    },
    [setNodes, reactFlowInstance]
  );

  useEffect(() => {
    if (selectedNode) {
      const updated = nodes.find((n) => n.id === selectedNode.id);
      if (updated && updated !== selectedNode) setSelectedNode(updated);
    }
  }, [nodes, selectedNode]);

  return (
    <div className="flex h-full flex-col bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.10),transparent_28%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_20%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--background))_100%)] text-foreground">
      <div className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-2xl">
        <div className="px-5 py-4 xl:px-7">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
            <div className="min-w-0 max-w-5xl">
              <div className="flex items-center gap-3">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.35rem] border border-primary/20 bg-primary/10 shadow-sm">
                  <div className="absolute inset-0 rounded-[1.35rem] bg-primary/15 blur-xl" />
                  <Sparkles className="relative h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Workflow Studio</p>
                    <Badge variant="outline" className="border-primary/20 bg-primary/10 px-2 py-0 text-[9px] font-black uppercase tracking-[0.18em] text-primary">
                      Board governed
                    </Badge>
                  </div>
                  <h1 className="truncate text-2xl font-black tracking-[-0.04em] text-foreground">{workflowName}</h1>
                </div>
              </div>
              <p className="ml-[60px] mt-1.5 max-w-4xl truncate text-sm font-medium text-foreground/65">
                Design the route, prove it with validation, run it through the ledger, then package the output for preview and audit.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="h-9 gap-2 rounded-xl border-border/60 font-bold" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Add Agent
              </Button>
              <Button variant="outline" size="sm" className="h-9 gap-2 rounded-xl border-primary/20 bg-primary/5 font-bold text-primary hover:bg-primary/10" onClick={() => setMagicWandOpen(true)}>
                <Wand2 className="h-4 w-4" /> Magic Flow
              </Button>
              <Button variant="outline" size="sm" className="h-9 gap-2 rounded-xl font-bold" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : saveStatus === "saved" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Save className="h-4 w-4" />}
                {saveStatus === "saved" ? "Saved" : "Save"}
              </Button>
              <Button size="sm" className="h-9 gap-2 rounded-xl px-4 font-bold shadow-[0_16px_36px_rgba(14,165,233,0.20)]" onClick={() => setExecutionPanelOpen(true)} disabled={!canRunWorkflow}>
                <Play className="h-4 w-4 fill-current" /> Run
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.2fr] 2xl:grid-cols-[0.85fr_1.15fr]">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { label: "Agents", value: nodes.length, icon: Bot },
                { label: "Routes", value: edges.length, icon: Radio },
                { label: "Private", value: edgeStats.privateEdges + edgeStats.auditHiddenEdges, icon: EyeOff },
                { label: "Mode", value: String(workflowMode).replace(/_/g, " "), icon: Activity },
                { label: "Output", value: String(outputType).replace(/_/g, " "), icon: FileText },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-2xl border border-border/55 bg-card/70 px-3 py-2.5 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="mt-1 truncate text-sm font-black text-foreground">{item.value}</p>
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border border-border/55 bg-card/70 p-3 shadow-sm">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">Production lifecycle</p>
                  </div>
                  <p className="mt-1 truncate text-xs font-semibold text-foreground/75">
                    {workflowValidation.isValid ? "Graph is clear to execute" : `${workflowValidation.errors.length} errors and ${workflowValidation.warnings.length} warnings need review`}
                  </p>
                </div>
                <div className="flex gap-1 overflow-x-auto pb-1 xl:pb-0">
                  {STUDIO_STAGES.map((stage, index) => (
                    <div key={stage} className="flex shrink-0 items-center gap-1">
                      <div className={`rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] ${
                        index <= 4
                          ? "border-primary/25 bg-primary/10 text-primary"
                          : "border-border/55 bg-background/70 text-muted-foreground"
                      }`}>
                        {stage}
                      </div>
                      {index < STUDIO_STAGES.length - 1 && <div className="h-px w-3 bg-border/70" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Canvas */}
        <div className="flex-1 relative">
          {nodes.length === 0 && (
            <CanvasEmptyState />
          )}
          <div className="absolute left-5 top-16 z-30 hidden w-[300px] rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 text-slate-100 shadow-2xl backdrop-blur-2xl lg:block">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-300">Studio 2.0</p>
                <h3 className="mt-1 text-sm font-semibold">Canvas orchestration board</h3>
              </div>
              <Layers3 className="h-5 w-5 text-sky-300" />
            </div>
            <div className="mt-4 grid gap-2">
              {[
                { icon: GitBranch, label: "Canvas", value: `${nodes.length} agents` },
                { icon: Radio, label: "Edges", value: `${edges.length} routes` },
                { icon: Activity, label: "Mode", value: String(workflowMode).replace(/_/g, " ") },
                { icon: ShieldCheck, label: "Validation", value: workflowValidation.isValid ? "ready" : "review" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.035] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-sky-300" />
                      <span className="text-[11px] font-semibold text-slate-300">{item.label}</span>
                    </div>
                    <span className="text-[11px] font-bold text-slate-100">{item.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {nodes.length > 0 && (workflowValidation.errors.length > 0 || workflowValidation.warnings.length > 0) && (
            <div className="absolute top-4 left-4 z-40 w-[min(19rem,calc(100%-2rem))] pointer-events-none opacity-95 lg:left-[325px]">
              <WorkflowValidationSummary validation={workflowValidation} compact />
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            proOptions={{ hideAttribution: true }}
            style={{ background: "hsl(220, 20%, 7%)" }}
          >
            {workflowPlan && (
              <div className="absolute top-4 right-4 z-40 max-w-[390px] rounded-[1.5rem] border border-border/45 bg-card/90 p-4 shadow-2xl backdrop-blur-2xl pointer-events-none">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary/80">Planner Route</p>
                    </div>
                    <h3 className="mt-1 truncate text-sm font-semibold text-foreground">
                      {workflowPlan.domain_title || "Generated Workflow"}
                    </h3>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-bold uppercase tracking-[0.16em]">
                      {workflowPlan.planner_source || "LangChain"}
                    </Badge>
	                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-bold uppercase tracking-[0.16em] text-primary border-primary/20">
	                      {String(workflowPlan.output_type || outputType).replace(/_/g, " ")}
	                    </Badge>
	                    {(workflowPlan.route_quality || workflowPlan.routeQuality) && (
	                      <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-bold uppercase tracking-[0.16em] ${matchBadgeClass((workflowPlan.route_quality || workflowPlan.routeQuality) === "adapted" ? "adapted" : (workflowPlan.route_quality || workflowPlan.routeQuality) === "gap" ? "missing" : "exact")}`}>
	                        {String(workflowPlan.route_quality || workflowPlan.routeQuality).replace(/_/g, " ")}
	                      </Badge>
	                    )}
	                  </div>
	                </div>

                <p className="mt-2 text-xs leading-5 text-muted-foreground line-clamp-4">
                  {workflowPlan.routing_reason}
                </p>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-border/45 bg-background/60 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Requested</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{workflowPlan.requested_agents || nodes.length}</p>
                  </div>
                  <div className="rounded-xl border border-border/45 bg-background/60 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Planned</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{workflowPlan.generated_agents || nodes.length}</p>
                  </div>
                  <div className="rounded-xl border border-border/45 bg-background/60 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Mode</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{String(workflowMode).replace(/_/g, " ")}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Array.isArray(workflowPlan.route_evidence) && workflowPlan.route_evidence.slice(0, 4).map((item: string) => (
                    <Badge key={item} variant="outline" className="text-[10px] px-2 py-0.5 border-primary/20 text-primary">
                      {item}
                    </Badge>
                  ))}
                </div>

                {workflowPlan.route_confirmation_required && (
                  <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] leading-5 text-foreground/80">
                    Route draft ready. Review the recommended agents below, then apply the route to place it on the canvas.
                  </div>
                )}

                {Array.isArray(workflowPlan.stage_plan) && workflowPlan.stage_plan.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.22em] text-muted-foreground">Stage plan</p>
                    <div className="space-y-2">
                      {workflowPlan.stage_plan.slice(0, 4).map((stage: any, index: number) => (
                        <div key={`${stage.agent_id || index}`} className="rounded-xl border border-border/45 bg-background/60 px-3 py-2">
	                          <div className="flex items-center justify-between gap-2">
	                            <p className="truncate text-xs font-semibold text-foreground">{stage.stage || stage.label || `Stage ${index + 1}`}</p>
	                            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 font-bold uppercase tracking-[0.16em] ${matchBadgeClass(stage.match_type || stage.matchType)}`}>
	                              {formatMatchType(stage.match_type || stage.matchType)}
	                            </Badge>
	                          </div>
	                          <p className="mt-1 truncate text-[10px] font-semibold text-foreground/70">{stage.requested_role || stage.agent_name || stage.agent_id}</p>
	                          <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{stage.selection_reason || stage.reason}</p>
                            {Array.isArray(stage.candidate_agents) && stage.candidate_agents.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {stage.candidate_agents.slice(0, 3).map((candidate: any) => (
                                  <Badge key={candidate.agent_id} variant="outline" className="text-[9px] px-1.5 py-0 font-bold uppercase tracking-[0.14em] text-primary border-primary/15 bg-primary/5">
                                    {candidate.display_name || candidate.agent_name} · {candidate.match_score ?? candidate.match_confidence}
                                  </Badge>
                                ))}
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 left-4 z-50 h-9 w-9 text-muted-foreground hover:text-foreground bg-card/40 backdrop-blur-md rounded-full border border-border/40 shadow-lg"
              onClick={() => navigate("/workflows")}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="absolute bottom-5 left-5 z-40 hidden max-w-[520px] items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/75 px-3 py-2 text-slate-100 shadow-2xl backdrop-blur-2xl lg:flex">
              <Badge variant="outline" className="border-sky-400/20 bg-sky-400/10 text-[10px] font-black uppercase tracking-[0.18em] text-sky-200">
                logical board
              </Badge>
              <Badge variant="outline" className="border-white/10 bg-white/[0.035] text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                {edgeStats.messageEdges} message routes
              </Badge>
              <Badge variant="outline" className="border-white/10 bg-white/[0.035] text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                {edgeStats.signalEdges} signals
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 rounded-xl px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-200 hover:bg-white/10"
                onClick={() => setRevealPrivateChannels((value) => !value)}
              >
                {revealPrivateChannels ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {edgeStats.privateEdges + edgeStats.auditHiddenEdges} hidden channels
              </Button>
            </div>
            <Background color="hsl(220, 14%, 16%)" gap={20} size={1} />
            <Controls
              style={{
                background: "hsl(220, 16%, 11%)",
                border: "1px solid hsl(220, 14%, 16%)",
                borderRadius: "0.75rem",
              }}
            />
          </ReactFlow>

          {/* Floating Toolbar */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex items-center gap-2 px-3 py-2 rounded-[1.15rem] bg-card/75 backdrop-blur-2xl border border-border/40 shadow-2xl"
            >
              <Input
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                className="bg-transparent border-none font-semibold text-sm focus-visible:ring-0 w-[160px] px-2 h-8"
              />
              <div className="w-px h-5 bg-border/50" />
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 text-xs text-primary hover:bg-primary/10"
                onClick={() => setAddOpen(true)}
                title={agentsLoading ? "Loading agents..." : "Add specialist"}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Agent
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 text-xs text-primary hover:bg-primary/10"
                onClick={() => setMagicWandOpen(true)}
                title={agentsLoading ? "Loading agents..." : "Create with Magic Flow"}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Magic Flow
              </Button>
              <div className="w-px h-5 bg-border/50" />
              <Dialog open={addOpen} onOpenChange={(isOpen) => { setAddOpen(isOpen); if (!isOpen) setSearch(""); }}>
                <DialogContent className="sm:max-w-[520px] p-0 gap-0 glass border-primary/20 bg-card/95 backdrop-blur-2xl rounded-[2.5rem] overflow-hidden shadow-2xl">
                  {/* Header */}
                  <div className="relative overflow-hidden pt-8 px-8 pb-6 border-b border-border/30">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                      <Bot className="h-24 w-24" />
                    </div>
                    <div className="relative z-10">
                      <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
                          <Plus className="h-4 w-4 text-primary" />
                        </div>
                        Add Specialist
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground mt-1.5 font-medium">
                        Search and select an agent to join your workflow pipeline
                      </DialogDescription>
                    </div>

                    {/* Search Bar */}
                    <div className="relative mt-6">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                      <Input
                        ref={searchRef}
                        value={search}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                        placeholder="Search agents by name, role or expertise..."
                        className="h-11 pl-10 pr-10 bg-secondary/30 border-border/40 rounded-xl focus-visible:ring-primary/20 text-sm"
                        autoFocus
                      />
                      {search && (
                        <button 
                          onClick={() => setSearch("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full bg-muted hover:bg-border transition-colors"
                        >
                          <X className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Agent List */}
                  <ScrollArea className="h-[450px] px-4 py-2">
                    <div className="space-y-6 py-4">
                      {groupedAgents.map(([category, agents]) => (
                        <div key={category} className="space-y-2">
                          <div className="flex items-center gap-2 px-3 mb-1">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
                              {category}
                            </h4>
                            <div className="h-px flex-1 bg-border/20" />
                          </div>
                          <div className="grid grid-cols-1 gap-1.5">
                            {agents.map((agent) => (
                              <button
                                key={agent.id}
                                onClick={() => handleAddAgent(agent)}
                                className="w-full text-left rounded-2xl p-3 transition-all duration-200 hover:bg-primary/5 hover:border-primary/20 border border-transparent group flex items-center gap-4"
                              >
                                <div className="h-12 w-12 rounded-xl bg-secondary/50 flex items-center justify-center text-2xl shrink-0 group-hover:scale-110 transition-transform border border-border/20 shadow-sm">
                                  {agent.emoji || "🤖"}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                                    {agent.name}
                                    {agent.is_native && <Badge variant="outline" className="text-[8px] px-1 py-0 uppercase tracking-tighter opacity-50 font-black">Native</Badge>}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5 font-medium leading-relaxed italic opacity-80">
                                    {agent.description}
                                  </div>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                                    <Plus className="h-3.5 w-3.5 text-primary" />
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {filteredAgents.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="h-16 w-16 rounded-full bg-secondary/30 flex items-center justify-center mb-4">
                          <Search className="h-8 w-8 text-muted-foreground/20" />
                        </div>
                        <p className="text-sm font-bold text-foreground opacity-60 tracking-tight">No agents found</p>
                        <p className="text-xs text-muted-foreground mt-1.5">Try a different search term or category</p>
                      </div>
                    )}
                  </ScrollArea>

                  {/* Footer */}
                  <div className="px-8 py-4 border-t border-border/30 bg-secondary/10 flex items-center justify-between">
                    <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-2">
                      <Sparkles className="h-3 w-3 text-primary" />
                      {availableAgents.length} Specialists Available
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)} className="h-8 text-[10px] font-bold uppercase tracking-widest px-4 rounded-lg border border-border/40 hover:bg-secondary/50">
                      Done
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saveStatus === "saved" ? <CheckCircle2 className="h-3.5 w-3.5 text-badge-green" /> : <Save className="h-3.5 w-3.5" />}
                {saveStatus === "saved" ? "Saved" : "Save"}
              </Button>
              {storedOutput && (storedOutput.output?.markdown || (Array.isArray(storedOutput.output?.files) && storedOutput.output.files.length > 0)) && routeId && (
                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => {
                  const outputId = storedOutput?.workflowId || routeId;
                  openApp({
                    id: `workflow-output-${outputId}`,
                    title: `${workflowName} — Output`,
                    url: `/workflow-output/${outputId}`,
                    icon: FileText,
                    description: "Workflow execution results",
                  });
                  navigate(`/workflow-output/${outputId}`);
                  }}>
                  <FileText className="h-3.5 w-3.5" /> View Output
                </Button>
              )}
              <Button size="sm" className="gap-1.5 h-8 text-xs font-semibold" onClick={() => setExecutionPanelOpen(true)} disabled={!canRunWorkflow}>
                <Play className="h-3.5 w-3.5 fill-current" /> Run
              </Button>
            </motion.div>
          </div>
        </div>
      </div>

      {pendingWorkflowDraft && (
        <div className="absolute bottom-[88px] left-1/2 z-30 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-[1.2rem] border border-primary/20 bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary/80">Route draft ready</p>
                <p className="text-xs font-semibold text-foreground/80">
                  {pendingWorkflowDraft.metadata?.generated_agents || pendingWorkflowDraft.nodes?.length || 0} agent(s) matched. Review then apply.
                </p>
              </div>
            </div>
            <Button size="sm" className="h-8 rounded-xl px-4 text-xs font-bold" onClick={applyPendingWorkflowDraft}>
              Apply route
            </Button>
          </div>
        </div>
      )}

      {/* Node Inspector */}
      <AnimatePresence>
        {selectedNode && !executionPanelOpen && (
          <NodeInspector node={selectedNode} onClose={() => setSelectedNode(null)} onUpdate={handleUpdateNodeData} />
        )}
      </AnimatePresence>

      {/* Execution Panel */}
      <AnimatePresence>
        {executionPanelOpen && (
          <WorkflowExecutionPanel 
            nodes={nodes} 
            edges={edges} 
            onClose={() => setExecutionPanelOpen(false)} 
            initialTask={initialTask} 
            workflowId={routeId || "new"} 
            workflowName={workflowName} 
            workflowPlan={workflowPlan}
            storedOutput={sessionStorage.getItem(`rerun_${routeId}`) ? undefined : storedOutput} 
          />
        )}
      </AnimatePresence>

      <MagicWandDialog
        open={magicWandOpen}
        onOpenChange={setMagicWandOpen}
        onGenerate={handleMagicGenerate}
        isGenerating={isGeneratingWorkflow}
      />
    </div>
    </div>
  );
}

const WorkflowEditor = () => (
  <ReactFlowProvider>
    <WorkflowEditorInner />
  </ReactFlowProvider>
);

export default WorkflowEditor;
