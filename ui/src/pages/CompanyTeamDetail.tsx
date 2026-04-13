import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Plus, Search, X, Bot, Sparkles, Loader2, Play, RotateCcw, Square, Calendar, Eye, Trash2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyContext } from "@/lib/company-context";
import { getCompanyById, getTeamById, getAgentsByTeam, getIssuesByTeam, hireAgent, fireAgent, createIssue, setIssueOutput, updateIssueStatus, getAgentsByCompany, getCEO } from "@/lib/company-data";
import { getAgents, fetchApi } from "@/lib/api";
import { OutputViewer } from "@/components/workflow/OutputViewer";
import { toast } from "sonner";
import { availableAgents as localAgents, defaultAgent } from "@/lib/agents";

export default function CompanyTeamDetail() {
  const { id, teamId } = useParams<{ id: string; teamId: string }>();
  const navigate = useNavigate();
  const { currentCompany, setCurrentCompanyId } = useCompanyContext();
  const [search, setSearch] = useState("");
  const [hireOpen, setHireOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [viewOutput, setViewOutput] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [running, setRunning] = useState<string | null>(null);

  const company = getCompanyById(id || currentCompany?.id || "") || currentCompany;
  const team = getTeamById(teamId || "");
  const agents = getAgentsByTeam(teamId || "");
  const issues = getIssuesByTeam(teamId || "");
  const allAgents = getAgentsByCompany(company?.id || "");
  const ceo = getCEO(company?.id || "");
  const [registryAgents, setRegistryAgents] = useState<any[]>([]);

  useEffect(() => {
    // Fetch agents from backend, fallback to local list
    getAgents()
      .then(data => {
        if (data && data.length > 0) {
          setRegistryAgents(data);
        } else {
          // Backend returned empty — use local agents
          setRegistryAgents([defaultAgent]);
        }
      })
      .catch(() => {
        // Backend unavailable — use local agents
        setRegistryAgents([defaultAgent]);
      });
  }, []);

  if (!company || !team) return <div className="flex items-center justify-center h-full text-muted-foreground">Team not found</div>;

  const filteredAgents = agents.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
  const runningIssues = issues.filter(i => i.status === "in_progress");
  const completedIssues = issues.filter(i => i.status === "completed");

  const handleHire = (agent: any) => {
    hireAgent(company.id, {
      name: agent.name,
      role: agent.description || agent.name,
      model: "gemini-2.5-flash",
      emoji: agent.emoji || "🤖",
      skills: [],
      teamId: team.id,
    });
    setHireOpen(false);
    toast.success(`Hired ${agent.emoji || "🤖"} ${agent.name}`);
  };

  const handleTerminate = (agentId: string, agentName: string) => {
    fireAgent(company.id, agentId);
    toast.success(`Removed ${agentName} from ${team.name}`);
  };

  const handleCreateTask = () => {
    if (!taskTitle.trim()) return;
    createIssue(company.id, {
      title: taskTitle,
      description: taskDesc,
      priority: "medium",
      teamId: team.id,
      agentId: selectedAgent || agents[0]?.id || "",
    });
    setTaskOpen(false);
    setTaskTitle("");
    setTaskDesc("");
    setSelectedAgent("");
  };

  const handleRun = async (issueId: string, agentId: string, title: string, desc?: string) => {
    setRunning(issueId);
    updateIssueStatus(company.id, issueId, "in_progress");
    try {
      const agent = agents.find(a => a.id === agentId);
      const data = await fetchApi('/api/chat/generate', {
        method: "POST",
        body: JSON.stringify({
          messages: [
            { role: "system", content: `You are ${agent?.name || 'an agent'} acting as a ${agent?.role || 'helpful assistant'}. Complete the task thoroughly and provide your answer directly.` },
            { role: "user", content: `${title}${desc ? `\n\nDetails: ${desc}` : ''}\n\nPlease complete this task and provide the output as a direct text response.` }
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
        toast.success(`Issue "${title}" resolved`);
      }
    } catch (err: any) {
      const errorMsg = err?.message || "Unknown error";
      setIssueOutput(company.id, issueId, `❌ Issue execution failed\n\nError: ${errorMsg}\n\nThe agent could not be reached. Please try again.`);
      updateIssueStatus(company.id, issueId, "failed");
      toast.error(`Failed to run issue: ${errorMsg}`);
    }
    setRunning(null);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-border/40 bg-card/30 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl border border-primary/20">{company.emoji}</div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-foreground">{company.name}</span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
            <span className="text-muted-foreground">{team.emoji} {team.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setHireOpen(true)}><Plus className="h-3.5 w-3.5" /> Hire Agent</Button>
          <Button size="sm" className="gap-1.5 h-8" onClick={() => setTaskOpen(true)}><Plus className="h-3.5 w-3.5" /> Create Issue</Button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-6 px-8 py-6 min-h-0">
        {/* Agents */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Agents ({agents.length})</h3>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} className="h-7 pl-6 pr-3 w-40 text-xs bg-secondary/30 border-border/40 rounded-md" placeholder="Search..." />
            </div>
          </div>
          <div className="space-y-2">
            {filteredAgents.map((agent) => (
              <Card key={agent.id} className="border-border/20 group/agent hover:border-border/40 transition-colors">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-secondary/50 flex items-center justify-center text-lg">{agent.emoji}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">{agent.name}</p>
                    <p className="text-[10px] text-muted-foreground">{agent.role}</p>
                  </div>
                  <Badge variant="secondary" className="text-[9px] font-bold uppercase px-1.5 py-0">{agent.model?.split("-")[0]}</Badge>
                  {!agent.isCEO && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover/agent:opacity-100 transition-opacity"
                      onClick={() => handleTerminate(agent.id, agent.name)}
                      title="Remove agent"
                    >
                      <UserX className="h-3 w-3" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Registry agents to hire */}
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/30 mt-4">Available in Registry</h4>
          <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-auto">
            {registryAgents.slice(0, 12).map((agent: any) => (
              <Button key={agent.id} variant="outline" size="sm" className="h-auto py-2 px-2 justify-start gap-2 text-xs" onClick={() => handleHire(agent)}>
                <span className="text-sm">{agent.emoji || "🤖"}</span>
                <span className="truncate text-left">{agent.name}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Issues */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Issues</h3>
          <div className="space-y-2">
            {issues.map((issue) => (
              <Card key={issue.id} className="border-border/20">
                <CardContent className="p-3">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-sm mt-0.5">{issue.agentEmoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">{issue.title}</p>
                      {issue.description && <p className="text-[10px] text-muted-foreground line-clamp-1">{issue.description}</p>}
                    </div>
                    <Badge variant={issue.status === "completed" ? "default" : issue.status === "in_progress" ? "secondary" : "outline"} className="text-[9px] font-bold uppercase px-1.5 py-0">{issue.status.replace("_", " ")}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {issue.status !== "completed" && (
                      <Button size="sm" className="h-6 text-[10px] gap-1 px-2" disabled={running === issue.id} onClick={() => handleRun(issue.id, issue.agentId, issue.title, issue.description)}>
                        {running === issue.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Run
                      </Button>
                    )}
                    {issue.output && (
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={() => setViewOutput(issue.id)}>
                        <Eye className="h-3 w-3" /> View
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {issues.length === 0 && <p className="text-xs text-muted-foreground/40 text-center py-8">No issues yet</p>}
          </div>
        </div>
      </div>

      {/* Hire Dialog */}
      <Dialog open={hireOpen} onOpenChange={setHireOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Hire Agent from Registry</DialogTitle><DialogDescription>Choose an agent to add to {team.name}</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-auto">
            {registryAgents.map((agent: any) => (
              <Button key={agent.id} variant="outline" size="sm" className="h-auto py-3 px-3 justify-start gap-2 text-xs" onClick={() => handleHire(agent)}>
                <span className="text-lg">{agent.emoji || "🤖"}</span>
                <div className="text-left min-w-0">
                  <p className="text-xs font-semibold truncate">{agent.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{agent.description}</p>
                </div>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Issue Dialog */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Issue</DialogTitle><DialogDescription>Add a new issue for {team.name}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Title</Label><Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="e.g. Fix login bug" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} className="min-h-[60px]" placeholder="Describe the issue..." /></div>
            <div className="space-y-2">
              <Label>Assign Agent</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger><SelectValue placeholder="Select agent..." /></SelectTrigger>
                <SelectContent>
                  {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.emoji} {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTask} disabled={!taskTitle.trim()}>Create Issue</Button>
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
