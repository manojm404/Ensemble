import { useState, useEffect } from "react";
import { Plus, Search, GitBranch, Clock, Bot, Trash2, RotateCcw, CheckCircle2, AlertCircle, FileText, Sparkles, Play, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { useTabContext } from "@/lib/tab-context";
import { fetchApi, deleteWorkflow } from "@/lib/api";
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

interface WorkflowOutput {
  title: string;
  task: string;
  agentCount: number;
  output: {
    markdown?: string;
    files?: Array<{ name: string; content: string }>;
  };
  completedAt: string;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  agentCount: number;
  lastEdited: string;
  status: "draft" | "active" | "archived";
  graphJson?: string;
  runStatus: "success" | "failed" | "none";
  lastOutput?: WorkflowOutput | null;
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
  const navigate = useNavigate();
  const { updateCurrentTabUrl } = useTabContext();

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
          
          const allOutputs = { ...backendOutputs, ...lsOutputs };
          
          const loaded = wfData.map((w: any) => {
            let lastEditedStr = 'Unknown';
            if (w.updated_at) {
              const d = new Date(w.updated_at);
              lastEditedStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            let agentCount = 0;
            try {
              const graph = typeof w.graph_json === 'string' ? JSON.parse(w.graph_json) : w.graph_json;
              agentCount = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
            } catch { agentCount = 0; }

            // Merge outputs: trust server data if available, fallback to localStorage
            const serverOutput = backendOutputs[w.id];
            const lsOutput = lsOutputs[w.id];
            const finalOutput = serverOutput || lsOutput;
            const hasOutput = !!finalOutput?.output?.markdown;
            
            return {
              id: w.id,
              name: w.name,
              description: "Custom Ensemble Workflow",
              agentCount,
              lastEdited: lastEditedStr,
              status: "active" as const,
              graphJson: w.graph_json,
              runStatus: hasOutput ? "success" : "none",
              lastOutput: hasOutput ? finalOutput : null,
              hasOutputsAvailable: hasOutput
            };
          });
          setWorkflows(loaded);
        }
      })
      .catch(console.error);
  }, []);

  const filtered = workflows.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase())
  );

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

  const handleRerun = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const wf = workflows.find(w => w.id === id);
    if (wf) {
      // Store previous task details so the editor can pre-fill them
      const prevTask = {
        title: wf.name,
        lastOutput: wf.lastOutput?.task || "",
        completedAt: wf.lastOutput?.completedAt || "",
      };
      sessionStorage.setItem(`rerun_${id}`, JSON.stringify(prevTask));
      updateCurrentTabUrl(`/workflows/${id}`, wf.name);
      navigate(`/workflows/${id}`);
      toast.info(`🔄 Opening "${wf.name}" for rerun with previous details`);
    }
  };

  const handleViewOutput = (e: React.MouseEvent, wf: Workflow) => {
    e.stopPropagation();
    
    // Only show output if we have one from localStorage
    if (wf.lastOutput?.output?.markdown) {
      setViewingOutput(wf);
    } else {
      toast.warning("No output found for this workflow. Run it to generate output.");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-border/50">
        <div className="flex-1" />
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search workflows..." className="pl-9 bg-secondary/50 border-border/50" />
        </div>
        <div className="flex-1 flex justify-end">
          <Button size="sm" className="gap-1.5" onClick={() => navigate("/workflows/new")}>
            <Plus className="h-4 w-4" /> New Workflow
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <StaggerContainer className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((wf) => {
            const statusGlow = wf.runStatus === "success"
              ? "ring-1 ring-emerald-400/40 shadow-[0_0_20px_rgba(52,211,153,0.1)]"
              : wf.runStatus === "failed"
                ? "ring-1 ring-rose-400/40 shadow-[0_0_20px_rgba(251,113,133,0.1)]"
                : "";

            return (
              <StaggerItem key={wf.id}>
                <MotionCard
                  className={`p-5 group relative transition-all duration-300 hover:shadow-lg min-h-[200px] flex flex-col justify-between ${statusGlow}`}
                  onClick={() => {
                    updateCurrentTabUrl(`/workflows/${wf.id}`, wf.name);
                    navigate(`/workflows/${wf.id}`);
                  }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <GitBranch className="h-4 w-4 text-primary" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">{wf.name}</h3>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Badge variant="secondary" className={`text-[10px] ${statusColors[wf.status]}`}>{wf.status}</Badge>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{wf.description}</p>

                  {/* Stats Row */}
                  <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Bot className="h-3 w-3" /> {wf.agentCount} agents</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {wf.lastEdited}</span>
                  </div>

                  {/* Status & Action Buttons */}
                  <div className="flex items-center justify-between pt-3 border-t border-border/30">
                    {/* Status Indicator */}
                    <div className="flex items-center gap-1">
                      {wf.runStatus === "success" ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span className="font-medium">Completed</span>
                        </span>
                      ) : wf.runStatus === "failed" ? (
                        <span className="flex items-center gap-1 text-rose-400 text-xs">
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span className="font-medium">Failed</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground text-xs">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Not run</span>
                        </span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5">
                      {wf.runStatus === "success" && (
                        <button
                          onClick={(e) => handleViewOutput(e, wf)}
                          className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-xs font-medium transition-all hover:scale-105"
                          title="View output"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Output</span>
                        </button>
                      )}
                      {wf.runStatus === "none" ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCurrentTabUrl(`/workflows/${wf.id}`, wf.name);
                            navigate(`/workflows/${wf.id}`);
                            toast.info(`Opening "${wf.name}" to run`);
                          }}
                          className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-xs font-medium transition-all hover:scale-105 group/btn"
                          title="Run workflow"
                        >
                          <Play className="h-3.5 w-3.5 transition-transform group-hover/btn:scale-110 duration-300" />
                          <span className="hidden sm:inline">Run</span>
                        </button>
                      ) : (
                        <button
                          onClick={(e) => handleRerun(e, wf.id)}
                          className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-xs font-medium transition-all hover:scale-105 group/btn"
                          title="Rerun workflow"
                        >
                          <RotateCcw className="h-3.5 w-3.5 transition-transform group-hover/btn:-rotate-180 duration-500" />
                          <span className="hidden sm:inline">Rerun</span>
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(e, wf.id, wf.name)}
                        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
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
      </ScrollArea>

      {/* 🆕 Output Viewing Dialog */}
      <Dialog open={!!viewingOutput} onOpenChange={(open) => !open && setViewingOutput(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] p-0 overflow-hidden border-primary/20">
          <div className="bg-gradient-to-br from-primary/5 via-transparent to-transparent p-6 pb-4 border-b border-border/30">
            <DialogHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <DialogTitle className="text-xl flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-emerald-400" />
                    </div>
                    {viewingOutput?.name} — Output
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground max-w-2xl line-clamp-2">
                    {viewingOutput?.lastOutput?.task}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs gap-1.5">
                    <Bot className="h-3 w-3" />
                    {viewingOutput?.lastOutput?.agentCount || viewingOutput?.agentCount} agents
                  </Badge>
                  {viewingOutput?.lastOutput?.completedAt && (
                    <Badge variant="outline" className="text-xs gap-1.5 text-muted-foreground">
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
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-20">
                <FileText className="h-12 w-12 opacity-20" />
                <p className="text-sm font-medium">Loading output...</p>
                <p className="text-xs">Fetching from server</p>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-border/30 bg-secondary/10 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              💡 Output is read-only. To modify and rerun, close this dialog and click the workflow card.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                if (viewingOutput) {
                  setViewingOutput(null);
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
