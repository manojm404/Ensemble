import { useParams, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Save, Undo, Redo, X, Search, Plus, Settings2, Loader2, CheckCircle2, Wand2, Sparkles, FileText, Bot } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { getWorkflow, saveWorkflow, getAgents, type AgentSkill } from "@/lib/api";
import { categoryColors } from "@/lib/agent-metadata";
import { MagicWandDialog } from "@/components/workflow/MagicWandDialog";
import { generateWorkflowFromPrompt } from "@/lib/workflow-generator";
import { WorkflowExecutionPanel } from "@/components/workflow/WorkflowExecutionPanel";
import { useTabContext, allApps } from "@/lib/tab-context";

// --- Agent Node ---
const nodeStyle = {
  background: "hsl(220, 16%, 11%)",
  border: "1px solid hsl(220, 14%, 16%)",
  borderRadius: "0.75rem",
  color: "hsl(210, 20%, 92%)",
  padding: "0",
  fontSize: "12px",
  minWidth: "160px",
};

function AgentNode({ id, data, selected }: NodeProps) {
  return (
    <div className={`relative group ${selected ? "ring-2 ring-primary rounded-xl" : ""}`} style={nodeStyle}>
      <Handle type="target" position={Position.Left} style={{ background: "hsl(195, 90%, 50%)", border: "none", width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: "hsl(195, 90%, 50%)", border: "none", width: 8, height: 8 }} />
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
      <div className="px-4 py-3">
        <div className="font-medium text-[13px]">{data.label}</div>
        <div className="text-[11px] mt-0.5" style={{ color: "hsl(215, 15%, 55%)" }}>{data.subtitle || "New Step"}</div>
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
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Action / Step Label</Label>
            <Input defaultValue={node.data.subtitle as string} className="bg-secondary/50 border-border/50 h-9 text-sm"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(node.id, { ...node.data, subtitle: e.target.value })} />
          </div>
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
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">System Prompt</Label>
            <Textarea defaultValue={(node.data.prompt as string) || ""} className="bg-secondary/50 border-border/50 min-h-[100px] text-sm"
              placeholder="Enter system prompt..."
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdate(node.id, { ...node.data, prompt: e.target.value })} />
          </div>
        </div>
      </ScrollArea>
    </motion.div>
  );
}

// --- Empty State ---
function CanvasEmptyState({ onAddAgent, onMagicGenerate }: { onAddAgent: () => void; onMagicGenerate: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-5 pointer-events-auto"
      >
        <div className="relative">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-primary/60" />
          </div>
          <div className="absolute inset-0 h-20 w-20 rounded-full bg-primary/5 animate-ping" />
        </div>
        <div className="text-center">
          <h3 className="text-base font-semibold text-foreground mb-1">Build Your Workflow</h3>
          <p className="text-xs text-muted-foreground max-w-[240px]">Add agents, connect them, then run with a task</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={onAddAgent}>
            <Plus className="h-3.5 w-3.5" /> Add Agent
          </Button>
          <Button size="sm" className="gap-1.5 h-9" onClick={onMagicGenerate}>
            <Wand2 className="h-3.5 w-3.5" /> AI Generate
          </Button>
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

  useEffect(() => {
    const init = async () => {
      try {
        const agents = await getAgents();
        setAvailableAgents(agents);
        if (routeId && routeId !== "new") {
          const wf = await getWorkflow(routeId);
          setWorkflowName(wf.name);
          const graph = JSON.parse(wf.graph_json);
          setNodes(graph.nodes || []);
          setEdges(graph.edges || []);
          restoreStoredOutput(routeId);
        }
      } catch (e) {
        console.error("Failed to load workflow data:", e);
      }
    };
    init();
  }, [routeId, setNodes, setEdges]);

  // Re-check localStorage when window regains focus (e.g., after switching tabs/models)
  useEffect(() => {
    const onFocus = () => {
      if (routeId && routeId !== "new") {
        restoreStoredOutput(routeId);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [routeId]);

  const restoreStoredOutput = useCallback((id: string) => {
    // Check ensemble_workflow_outputs (completed runs)
    try {
      const raw = localStorage.getItem("ensemble_workflow_outputs");
      if (raw) {
        const parsed = JSON.parse(raw);
        const stored = parsed[id];
        if (stored?.output?.markdown) {
          setStoredOutput(stored);
          if (stored.task) setInitialTask(stored.task);
          setExecutionPanelOpen(true);
          return;
        }
      }
    } catch { /* ignore */ }

    // Check workflow_run_* (running/complete state)
    try {
      const runRaw = localStorage.getItem(`workflow_run_${id}`);
      if (runRaw) {
        const runState = JSON.parse(runRaw);
        if (runState.phase === "running" || runState.phase === "complete") {
          if (runState.task) setInitialTask(runState.task);
          if (runState.output) setStoredOutput(runState);
          setExecutionPanelOpen(true);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const graphJson = JSON.stringify({ nodes, edges });
      const result = await saveWorkflow(workflowName, graphJson, routeId !== "new" ? routeId : undefined);
      if (routeId === "new" && result.id) navigate(`/workflows/${result.id}`, { replace: true });
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
    (connection: Connection) =>
      setEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: "hsl(195, 90%, 50%)" } }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNode(node), []);
  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  const handleUpdateNodeData = useCallback(
    (nodeId: string, newData: Record<string, unknown>) => {
      setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: newData } : n)));
    },
    [setNodes]
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

  const handleMagicGenerate = useCallback(
    async (prompt: string) => {
      setIsGeneratingWorkflow(true);
      await new Promise((r) => setTimeout(r, 1200));
      const result = await generateWorkflowFromPrompt(prompt, availableAgents);
      setWorkflowName(result.name);
      setNodes(result.nodes);
      setEdges(result.edges);
      setIsGeneratingWorkflow(false);
      setMagicWandOpen(false);
      setSelectedNode(null);
      /* Auto-open execution panel with the prompt pre-filled */
      setInitialTask(prompt);
      setExecutionPanelOpen(true);
      setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 100);
    },
    [availableAgents, setNodes, setEdges, reactFlowInstance]
  );

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Canvas */}
        <div className="flex-1 relative">
          {nodes.length === 0 && (
            <CanvasEmptyState onAddAgent={() => setAddOpen(true)} onMagicGenerate={() => setMagicWandOpen(true)} />
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
            <Background color="hsl(220, 14%, 16%)" gap={20} size={1} />
            <Controls
              style={{
                background: "hsl(220, 16%, 11%)",
                border: "1px solid hsl(220, 14%, 16%)",
                borderRadius: "0.75rem",
              }}
            />
            <MiniMap
              style={{
                background: "hsl(220, 16%, 11%)",
                border: "1px solid hsl(220, 14%, 16%)",
                borderRadius: "0.75rem",
              }}
              nodeColor="hsl(195, 90%, 50%)"
              maskColor="hsla(220, 20%, 7%, 0.8)"
            />
          </ReactFlow>

          {/* Floating Toolbar */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-card/70 backdrop-blur-2xl border border-border/40 shadow-2xl"
            >
              <Input
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                className="bg-transparent border-none font-semibold text-sm focus-visible:ring-0 w-[140px] px-2 h-8"
              />
              <div className="w-px h-5 bg-border/50" />
              <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs text-primary hover:bg-primary/10" onClick={() => setMagicWandOpen(true)}>
                <Wand2 className="h-3.5 w-3.5" /> AI
              </Button>

              <Dialog open={addOpen} onOpenChange={(isOpen) => { setAddOpen(isOpen); if (!isOpen) setSearch(""); }}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs">
                    <Plus className="h-3.5 w-3.5" /> Agent
                  </Button>
                </DialogTrigger>
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
                    <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)} className="h-8 text-[10px] font-bold uppercase tracking-widest px-4 rounded-lg border border-border/40 hover:bg-white/5">
                      Cancel
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <div className="w-px h-5 bg-border/50" />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => toast.info("Undo", { description: "Nothing to undo" })}><Undo className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => toast.info("Redo", { description: "Nothing to redo" })}><Redo className="h-4 w-4" /></Button>
              <div className="w-px h-5 bg-border/50" />
              <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saveStatus === "saved" ? <CheckCircle2 className="h-3.5 w-3.5 text-badge-green" /> : <Save className="h-3.5 w-3.5" />}
                {saveStatus === "saved" ? "Saved" : "Save"}
              </Button>
              {storedOutput && storedOutput.output?.markdown && routeId && (
                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => {
                  openApp({
                    id: `workflow-output-${routeId}`,
                    title: `${workflowName} — Output`,
                    url: `/workflow-output/${routeId}`,
                    icon: FileText,
                    description: "Workflow execution results",
                  });
                  navigate(`/workflow-output/${routeId}`);
                }}>
                  <FileText className="h-3.5 w-3.5" /> View Output
                </Button>
              )}
              <Button size="sm" className="gap-1.5 h-8 text-xs font-semibold" onClick={() => setExecutionPanelOpen(true)}>
                <Play className="h-3.5 w-3.5 fill-current" /> Run
              </Button>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Node Inspector */}
      <AnimatePresence>
        {selectedNode && !executionPanelOpen && (
          <NodeInspector node={selectedNode} onClose={() => setSelectedNode(null)} onUpdate={handleUpdateNodeData} />
        )}
      </AnimatePresence>

      {/* Execution Panel */}
      <AnimatePresence>
        {executionPanelOpen && (
          <WorkflowExecutionPanel nodes={nodes} edges={edges} onClose={() => setExecutionPanelOpen(false)} initialTask={initialTask} workflowId={routeId || "new"} workflowName={workflowName} storedOutput={storedOutput} />
        )}
      </AnimatePresence>

      <MagicWandDialog open={magicWandOpen} onOpenChange={setMagicWandOpen} onGenerate={handleMagicGenerate} isGenerating={isGeneratingWorkflow} />
    </div>
  );
}

const WorkflowEditor = () => (
  <ReactFlowProvider>
    <WorkflowEditorInner />
  </ReactFlowProvider>
);

export default WorkflowEditor;
