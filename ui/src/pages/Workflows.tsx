import { useState, useEffect } from "react";
import { Plus, Search, GitBranch, Clock, Bot, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { fetchApi, deleteWorkflow } from "@/lib/api";
import { MotionCard, StaggerContainer, StaggerItem } from "@/components/ui/motion-card";
import { toast } from "sonner";

interface Workflow {
  id: string;
  name: string;
  description: string;
  agentCount: number;
  lastEdited: string;
  status: "draft" | "active" | "archived";
}



const statusColors: Record<string, string> = {
  active: "bg-badge-green/20 text-badge-green",
  draft: "bg-badge-orange/20 text-badge-orange",
  archived: "bg-muted text-muted-foreground",
};

const Workflows = () => {
  const [search, setSearch] = useState("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const navigate = useNavigate();

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
            
            return {
              id: w.id,
              name: w.name,
              description: "Custom Ensemble Workflow", 
              agentCount: 1, 
              lastEdited: lastEditedStr,
              status: "active" as const
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
    if (!confirm(`Delete workflow "${name}"? This cannot be undone.`)) return;
    try {
      await deleteWorkflow(id);
      setWorkflows(prev => prev.filter(w => w.id !== id));
      toast.success(`Deleted "${name}"`);
    } catch (err) {
      toast.error("Failed to delete workflow");
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
          {filtered.map((wf) => (
            <StaggerItem key={wf.id}>
              <MotionCard
                className="p-5 group relative"
                onClick={() => navigate(`/workflows/${wf.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{wf.name}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary" className={`text-[10px] ${statusColors[wf.status]}`}>{wf.status}</Badge>
                    <button
                      onClick={(e) => handleDelete(e, wf.id, wf.name)}
                      className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
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
                </div>
              </MotionCard>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </ScrollArea>
    </div>
  );
};

export default Workflows;
