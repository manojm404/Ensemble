/**
 * WorkflowOutput.tsx — Full-Width Workflow Output Page
 * 
 * Opens as a tab when users click "Open in Tab" from the execution panel.
 * Renders the same OutputViewer component but at full width for better
 * readability of documents, file exploration, and live previews.
 * 
 * Reads output data from WorkflowOutputContext by workflow ID (from URL param).
 * 
 * DO NOT CHANGE:
 * - The route param pattern (:id)
 * - The header layout (title + metadata + actions)
 */

import { useParams } from "react-router-dom";
import { useWorkflowOutput } from "@/lib/workflow-output-context";
import { OutputViewer } from "@/components/workflow/OutputViewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Clock, Bot } from "lucide-react";

const STORAGE_KEY = "ensemble_workflow_outputs";

function loadStoredOutput(id: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const data = parsed[id];
    if (data?.output?.markdown) {
      return { ...data, completedAt: new Date(data.completedAt) };
    }
    return null;
  } catch {
    return null;
  }
}

export default function WorkflowOutput() {
  const { id } = useParams<{ id: string }>();
  const { getOutput } = useWorkflowOutput();
  let data = id ? getOutput(id) : undefined;

  // Fallback: load from localStorage directly (handles page refresh)
  if (!data && id) {
    data = loadStoredOutput(id) || undefined;
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <FileText className="h-12 w-12 text-muted-foreground/20" />
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-foreground">No output found</p>
          <p className="text-xs text-muted-foreground">
            Run a workflow to see results here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header — workflow title + metadata */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-border/40 bg-card/30 backdrop-blur-sm sticky top-0 z-30">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-3">
             <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
               <FileText className="h-5 w-5 text-primary" />
             </div>
             <h1 className="text-xl font-bold text-foreground truncate tracking-tight">{data.title}</h1>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1 max-w-2xl font-medium ml-[52px]">
            {data.task}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-9 px-4 gap-2 font-semibold border-primary/20 hover:bg-primary/5 hover:text-primary transition-all shadow-sm"
            onClick={() => {
              // Set the rerun flag for the editor to pick up
              sessionStorage.setItem(`rerun_${id}`, JSON.stringify({ lastOutput: data.task }));
              window.location.href = `/workflows/${id}`;
            }}
          >
            <Bot className="h-4 w-4" />
            Modify & Rerun
          </Button>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider gap-1.5 px-2 py-0.5 bg-secondary/50">
                <Bot className="h-3 w-3" />
                {data.agentCount} agents
              </Badge>
              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider gap-1.5 px-2 py-0.5 text-muted-foreground border-border/50">
                <Clock className="h-3 w-3" />
                {data.completedAt.toLocaleTimeString()}
              </Badge>
            </div>
            <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-[0.2em] opacity-40">Workflow Execution Result</span>
          </div>
        </div>
      </div>

      {/* Full-width output viewer */}
      <div className="flex-1 min-h-0">
        <OutputViewer output={data.output} />
      </div>
    </div>
  );
}
