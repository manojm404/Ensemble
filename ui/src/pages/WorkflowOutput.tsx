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
import { FileText, Clock, Bot } from "lucide-react";

export default function WorkflowOutput() {
  const { id } = useParams<{ id: string }>();
  const { getOutput } = useWorkflowOutput();
  const data = id ? getOutput(id) : undefined;

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
    <div className="flex flex-col h-full">
      {/* Header — workflow title + metadata */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-foreground">{data.title}</h1>
          <p className="text-xs text-muted-foreground line-clamp-1 max-w-lg">
            {data.task}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-xs gap-1.5">
            <Bot className="h-3 w-3" />
            {data.agentCount} agents
          </Badge>
          <Badge variant="outline" className="text-xs gap-1.5 text-muted-foreground">
            <Clock className="h-3 w-3" />
            {data.completedAt.toLocaleTimeString()}
          </Badge>
        </div>
      </div>

      {/* Full-width output viewer */}
      <div className="flex-1 min-h-0">
        <OutputViewer output={data.output} />
      </div>
    </div>
  );
}
