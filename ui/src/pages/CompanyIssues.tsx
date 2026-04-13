import { useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Search, X, Play, Eye, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyContext } from "@/lib/company-context";
import { getCompanyById, getIssuesByCompany, createIssue, setIssueOutput, updateIssueStatus, getAgentsByCompany, getTeamsByCompany } from "@/lib/company-data";
import { OutputViewer } from "@/components/workflow/OutputViewer";
import { API_BASE_URL, fetchApi } from "@/lib/api";
import { toast } from "sonner";

export default function CompanyIssues() {
  const { id } = useParams<{ id: string }>();
  const { currentCompany, setCurrentCompanyId } = useCompanyContext();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOutput, setViewOutput] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");

  const company = getCompanyById(id || currentCompany?.id || "") || currentCompany;
  if (!company) return <div className="flex items-center justify-center h-full text-muted-foreground">No company selected</div>;

  const issues = getIssuesByCompany(company.id);
  const agents = getAgentsByCompany(company.id);
  const teams = getTeamsByCompany(company.id);

  const filtered = issues.filter(i => {
    const matchesSearch = i.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || i.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreate = () => {
    if (!title.trim()) return;
    createIssue(company.id, {
      title, description: desc, priority, teamId: selectedTeam || teams[0]?.id || "",
      agentId: selectedAgent || agents[0]?.id || "",
    });
    setCreateOpen(false);
    setTitle(""); setDesc(""); setSelectedAgent(""); setSelectedTeam(""); setPriority("medium");
  };

  const handleRun = async (issueId: string, agentId: string, issueTitle: string, issueDesc?: string) => {
    setRunning(issueId);
    updateIssueStatus(company.id, issueId, "in_progress");
    try {
      const agent = agents.find(a => a.id === agentId);
      const data = await fetchApi('/api/chat/generate', {
        method: "POST",
        body: JSON.stringify({
          messages: [
            { role: "system", content: `You are ${agent?.name || 'an agent'} acting as a ${agent?.role || 'helpful assistant'}. Complete the task thoroughly and provide your answer directly.` },
            { role: "user", content: `${issueTitle}${issueDesc ? `\n\nDetails: ${issueDesc}` : ''}\n\nPlease complete this task and provide the output as a direct text response.` }
          ],
        }),
      });

      // Extract the actual text response (backend returns {text: str, usage: dict})
      const output = data?.text || data?.response || data?.message || data?.content || data?.output;

      if (!output || typeof output !== "string" || output.trim().length === 0) {
        // Response was empty or not usable — mark as failed
        const rawOutput = output || JSON.stringify(data);
        setIssueOutput(company.id, issueId, `⚠️ Agent returned an empty or unparseable response.\n\nRaw response:\n\`\`\`json\n${rawOutput.slice(0, 500)}\n\`\`\``);
        updateIssueStatus(company.id, issueId, "failed");
        toast.error("Agent returned an empty response");
      } else {
        setIssueOutput(company.id, issueId, output);
        updateIssueStatus(company.id, issueId, "completed");
        toast.success(`Issue "${issueTitle}" resolved`);
      }
    } catch (err: any) {
      const errorMsg = err?.message || "Unknown error";
      setIssueOutput(company.id, issueId, `❌ Issue execution failed\n\nError: ${errorMsg}\n\nThe agent could not be reached. Please try again.`);
      updateIssueStatus(company.id, issueId, "failed");
      toast.error(`Failed to run issue: ${errorMsg}`);
    }
    setRunning(null);
  };

  const statusCounts = {
    all: issues.length,
    in_progress: issues.filter(i => i.status === "in_progress").length,
    queued: issues.filter(i => i.status === "queued").length,
    completed: issues.filter(i => i.status === "completed").length,
    failed: issues.filter(i => i.status === "failed").length,
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-border/40 bg-card/30 backdrop-blur-sm">
        <div>
          <h1 className="text-xl font-bold text-foreground">{company.emoji} {company.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{issues.length} total issues</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search issues..." className="h-8 pl-8 pr-8 w-48 text-xs bg-secondary/30 border-border/40 rounded-lg" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="h-3 w-3 text-muted-foreground/40" /></button>}
          </div>
          {["all", "in_progress", "queued", "completed", "failed"].map(s => (
            <Button key={s} variant={statusFilter === s ? "default" : "ghost"} size="sm" className="h-7 text-[10px] font-bold uppercase tracking-wider px-2.5" onClick={() => setStatusFilter(s)}>
              {s === "all" ? "All" : s.replace("_", " ")} ({statusCounts[s as keyof typeof statusCounts]})
            </Button>
          ))}
          <Button size="sm" className="gap-1.5 h-8" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> New Issue</Button>
        </div>
      </div>

      {/* Issues List */}
      <div className="flex-1 p-8">
        <div className="space-y-2">
          {filtered.map((issue, i) => (
            <motion.div key={issue.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
              <Card className="border-border/20 hover:border-border/40 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">{issue.agentEmoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-foreground">{issue.title}</p>
                        <StatusBadge status={issue.status} />
                        <PriorityBadge priority={issue.priority} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">{issue.teamName} · {issue.agentName} · {issue.created}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {issue.status !== "completed" && issue.status !== "in_progress" && (
                        <Button size="sm" className="h-7 text-[10px] gap-1 px-2.5" disabled={running === issue.id} onClick={() => handleRun(issue.id, issue.agentId, issue.title, issue.description)}>
                          {running === issue.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Run
                        </Button>
                      )}
                      {issue.output && (
                        <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 px-2.5" onClick={() => setViewOutput(issue.id)}><Eye className="h-3 w-3" /> View</Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-semibold text-foreground/60">No issues found</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Issue</DialogTitle><DialogDescription>Create an issue for {company.name}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fix authentication bug" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="min-h-[60px]" placeholder="Describe the issue..." /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Team</Label>
                <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                  <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                  <SelectContent>{teams.map(t => <SelectItem key={t.id} value={t.id}>{t.emoji} {t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Agent</Label>
                <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                  <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                  <SelectContent>{agents.map(a => <SelectItem key={a.id} value={a.id}>{a.emoji} {a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(["low", "medium", "high", "critical"] as const).map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!title.trim()}>Create Issue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Output Viewer */}
      <Dialog open={!!viewOutput} onOpenChange={() => setViewOutput(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader><DialogTitle>Issue Output</DialogTitle></DialogHeader>
          {viewOutput && <OutputViewer output={issues.find(i => i.id === viewOutput)?.output || ""} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", in_progress: "bg-amber-500/10 text-amber-500 border-amber-500/20", queued: "bg-blue-500/10 text-blue-500 border-blue-500/20", failed: "bg-red-500/10 text-red-500 border-red-500/20", blocked: "bg-orange-500/10 text-orange-500 border-orange-500/20" };
  const labels: Record<string, string> = { completed: "Resolved", in_progress: "Running", queued: "Queued", failed: "Failed", blocked: "Blocked" };
  return <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${colors[status] || colors.queued}`}>{labels[status] || status}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = { low: "bg-gray-500/10 text-gray-500", medium: "bg-blue-500/10 text-blue-500", high: "bg-orange-500/10 text-orange-500", critical: "bg-red-500/10 text-red-500" };
  return <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${colors[priority] || colors.medium}`}>{priority}</span>;
}
