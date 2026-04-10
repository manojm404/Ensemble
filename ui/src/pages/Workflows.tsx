import { useState, useEffect } from "react";
import { Plus, Search, GitBranch, Clock, Bot, Trash2, RotateCcw, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { useTabContext } from "@/lib/tab-context";
import { fetchApi, deleteWorkflow } from "@/lib/api";
import { MotionCard, StaggerContainer, StaggerItem } from "@/components/ui/motion-card";
import { toast } from "sonner";

const STORAGE_KEY = "ensemble_workflow_outputs";

interface Workflow {
  id: string;
  name: string;
  description: string;
  agentCount: number;
  lastEdited: string;
  status: "draft" | "active" | "archived";
  graphJson?: string;
  runStatus: "success" | "failed" | "none";
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-400/20 text-emerald-400",
  draft: "bg-badge-orange/20 text-badge-orange",
  archived: "bg-muted text-muted-foreground",
};

const Workflows = () => {
  const [search, setSearch] = useState("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const navigate = useNavigate();
  const { updateCurrentTabUrl } = useTabContext();

  useEffect(() => {
    fetchApi('/api/workflows')
      .then(data => {
        if (data && Array.isArray(data)) {
          const loaded = data.map((w: any) => {
            let lastEditedStr = 'Unknown';
            if (w.updated_at) {
              const d = new Date(w.updated_at);
              lastEditedStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            // Count actual nodes from graph_json
            let agentCount = 0;
            try {
              const graph = typeof w.graph_json === 'string' ? JSON.parse(w.graph_json) : w.graph_json;
              agentCount = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
            } catch {
              agentCount = 0;
            }

            // Check localStorage for run status
            let runStatus: "success" | "failed" | "none" = "none";
            try {
              const raw = localStorage.getItem(STORAGE_KEY);
              if (raw) {
                const outputs = JSON.parse(raw);
                if (outputs[w.id]?.output?.markdown) {
                  runStatus = "success";
                }
              }
            } catch {
              // ignore
            }

            return {
              id: w.id,
              name: w.name,
              description: "Custom Ensemble Workflow",
              agentCount,
              lastEdited: lastEditedStr,
              status: "active" as const,
              graphJson: w.graph_json,
              runStatus,
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
    // Update the tab URL so switching back returns to this workflow
    const wf = workflows.find(w => w.id === id);
    if (wf) updateCurrentTabUrl(`/workflows/${id}`, wf.name);
    // Navigate to workflow and signal to auto-open execution panel
    sessionStorage.setItem(`rerun_${id}`, "true");
    navigate(`/workflows/${id}`);
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
                  className={`p-5 group relative transition-all duration-300 hover:shadow-lg min-h-[180px] flex flex-col justify-between ${statusGlow}`}
                  onClick={() => {
                    // Update the tab URL so switching back returns to this workflow
                    updateCurrentTabUrl(`/workflows/${wf.id}`, wf.name);
                    navigate(`/workflows/${wf.id}`);
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{wf.name}</h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className={`text-[10px] ${statusColors[wf.status]}`}>{wf.status}</Badge>
                      <button
                        onClick={(e) => handleRerun(e, wf.id)}
                        className="h-6 w-6 flex items-center justify-center rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                        title="Re-run workflow"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, wf.id, wf.name)}
                        className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        title="Delete workflow"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{wf.description}</p>
                  <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Bot className="h-3 w-3" /> {wf.agentCount} agents</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {wf.lastEdited}</span>
                    {wf.runStatus === "success" && (
                      <span className="flex items-center gap-0.5 text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Completed</span>
                    )}
                    {wf.runStatus === "failed" && (
                      <span className="flex items-center gap-0.5 text-rose-400"><AlertCircle className="h-3 w-3" /> Failed</span>
                    )}
                  </div>
                </MotionCard>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </ScrollArea>
    </div>
  );
};

export default Workflows;
