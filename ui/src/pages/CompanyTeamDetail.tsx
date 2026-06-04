import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Plus, Search, Bot, Briefcase, CheckCircle, Clock, AlertCircle, Users, Play, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanyContext } from "@/lib/company-context";
import { getCompanyById, getTeamById, hireAgent, createIssue, updateIssueStatus, getCEO } from "@/lib/company-data";
import { getAgents, fetchApi, AgentSkill } from "@/lib/api";
import { useEventContext } from "@/lib/EventContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Main Component
export default function CompanyTeamDetail() {
  const { id, teamId } = useParams<{ id: string; teamId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentCompany } = useCompanyContext();
  const queryClient = useQueryClient();

  const [hireOpen, setHireOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);

  const companyId = id || currentCompany?.id || "";
  const activeTab = searchParams.get("tab") || "agents";

  const { data: company } = useQuery({ queryKey: ['company', companyId], queryFn: () => getCompanyById(companyId) });
  const { data: team } = useQuery({ queryKey: ['team', teamId], queryFn: () => getTeamById(teamId) });
  const { data: agents, refetch: refetchAgents } = useQuery({ queryKey: ['agents', teamId], queryFn: () => getAgentsByTeam(teamId || "") });
  const { data: issues, refetch: refetchIssues } = useQuery({ queryKey: ['issues', teamId], queryFn: () => getIssuesByTeam(teamId || "") });
  const { data: ceo } = useQuery({ queryKey: ['ceo', companyId], queryFn: () => getCEO(companyId) });
  const { data: registryAgents } = useQuery<AgentSkill[]>({ queryKey: ['registryAgents'], queryFn: getAgents });
  
  const { lastEvent } = useEventContext();

  useEffect(() => {
    if (lastEvent) {
      if (lastEvent.type === 'agent_state_update' || lastEvent.type === 'audit_event') {
        refetchAgents();
        refetchIssues();
      }
    }
  }, [lastEvent, refetchAgents, refetchIssues]);
  
  const handleHire = (agent: AgentSkill) => {
    if (!company || !team) return;
    hireAgent(company.id, {
      name: agent.name, role: agent.description, model: "gemini-2.5-flash", 
      emoji: agent.emoji, skills: [], teamId: team.id,
    });
    setHireOpen(false);
    toast.success(`Hired ${agent.emoji} ${agent.name} into ${team.name}`);
    queryClient.invalidateQueries({ queryKey: ['agents', teamId] });
  };
  
  const handleCreateIssue = (title: string, description: string, agentId: string) => {
    if (!company || !team) return;
    createIssue(company.id, { title, description, priority: "medium", teamId: team.id, agentId });
    toast.success(`Issue "${title}" created and assigned.`);
    queryClient.invalidateQueries({ queryKey: ['issues', teamId] });
  };
  
  if (!company || !team) return <div className="p-8 text-muted-foreground">Company or Team not found.</div>;

  const stats = [
    { name: "Total Agents", value: agents?.length || 0, icon: Users },
    { name: "Active Issues", value: issues?.filter(i => i.status === "in_progress").length || 0, icon: Play },
    { name: "Queued Issues", value: issues?.filter(i => i.status === "queued").length || 0, icon: Clock },
    { name: "Completed Issues", value: issues?.filter(i => i.status === "completed").length || 0, icon: CheckCircle },
  ];

  return (
    <>
      <div className="flex flex-col h-full bg-background">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">{company.emoji}</div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold text-foreground">{company.name}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
              <span className="text-muted-foreground font-medium">{team.emoji} {team.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setHireOpen(true)}><Briefcase className="h-3.5 w-3.5" /> Hire Agent</Button>
            <Button size="sm" className="gap-1.5" onClick={() => setIssueOpen(true)}><Plus className="h-3.5 w-3.5" /> Create Issue</Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat, i) => (
              <motion.div key={stat.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                <Card className="bg-card/50 border-border/30">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-xs font-medium uppercase text-muted-foreground">{stat.name}</CardTitle>
                    <stat.icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent><div className="text-2xl font-bold">{stat.value}</div></CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <Tabs value={activeTab} onValueChange={(value) => setSearchParams({ tab: value })}>
            <TabsList>
              <TabsTrigger value="agents">Agents</TabsTrigger>
              <TabsTrigger value="issues">Issues</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="agents" className="mt-4"><AgentsPanel agents={agents || []} ceo={ceo} /></TabsContent>
            <TabsContent value="issues" className="mt-4"><IssuesPanel issues={issues || []} agents={agents || []} companyId={company.id} /></TabsContent>
            <TabsContent value="activity" className="mt-4"><ActivityPanel /></TabsContent>
          </Tabs>
        </main>
      </div>
      
      <HireAgentDialog open={hireOpen} onOpenChange={setHireOpen} onHire={handleHire} registryAgents={registryAgents || []} />
      <CreateIssueDialog open={issueOpen} onOpenChange={setIssueOpen} agents={agents || []} onCreate={handleCreateIssue} />
    </>
  );
}

// Sub-components

function AgentsPanel({ agents, ceo }: { agents: any[], ceo: any }) {
  return (
    <div className="space-y-4">
      {ceo && (
        <Card className="bg-card/80 border-primary/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-2xl">{ceo.emoji}</div>
            <div className="flex-1">
              <p className="font-bold text-foreground">{ceo.name}</p>
              <p className="text-xs text-muted-foreground">{ceo.role}</p>
            </div>
            <Badge>CEO</Badge>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(agent => (
          <Card key={agent.id} className="bg-card/50 border-border/30">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-secondary/50 flex items-center justify-center text-xl">{agent.emoji}</div>
              <div>
                <p className="text-sm font-semibold text-foreground">{agent.name}</p>
                <p className="text-xs text-muted-foreground">{agent.role}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function IssuesPanel({ issues, agents, companyId }: { issues: any[], agents: any[], companyId: string }) {
  const queryClient = useQueryClient();
  const runIssue = async (issue: any) => {
    updateIssueStatus(companyId, issue.id, "in_progress");
    queryClient.invalidateQueries({ queryKey: ['issues'] });
    try {
      const agent = agents.find(a => a.id === issue.agentId);
      await fetchApi('/api/chat/generate', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'system', content: `You are ${agent?.name}. Role: ${agent?.role}.` }, { role: 'user', content: `Task: ${issue.title}

Details: ${issue.description}` }]
        })
      });
      updateIssueStatus(companyId, issue.id, "completed");
      toast.success(`Issue "${issue.title}" completed.`);
    } catch (e) {
      updateIssueStatus(companyId, issue.id, "failed");
      toast.error(`Issue "${issue.title}" failed.`);
    }
    queryClient.invalidateQueries({ queryKey: ['issues'] });
  };

  const columns = {
    queued: issues.filter(i => i.status === 'queued'),
    in_progress: issues.filter(i => i.status === 'in_progress'),
    completed: issues.filter(i => i.status === 'completed'),
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {(Object.keys(columns) as Array<keyof typeof columns>).map(status => (
        <div key={status}>
          <h3 className="text-sm font-semibold mb-2 capitalize">{status.replace('_', ' ')}</h3>
          <div className="space-y-2">
            {columns[status].map(issue => (
              <Card key={issue.id} className="bg-card/50 border-border/30">
                <CardContent className="p-3">
                  <p className="text-sm font-medium">{issue.title}</p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-lg">{issue.agentEmoji}</span>
                      <span>{issue.agentName}</span>
                    </div>
                    {issue.status === 'queued' && <Button size="xs" variant="ghost" onClick={() => runIssue(issue)}><Play className="h-3 w-3 mr-1" /> Run</Button>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityPanel() {
  const { lastEvent } = useEventContext();
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    if (lastEvent) {
      setEvents(prev => [lastEvent, ...prev.slice(0, 99)]);
    }
  }, [lastEvent]);

  return (
    <Card className="bg-card/50 border-border/30">
      <CardContent className="p-4 space-y-4">
        {events.length > 0 ? events.map((event, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="mt-1"><Activity className="h-4 w-4 text-muted-foreground" /></div>
            <div>
              <p className="text-sm font-medium">{event.type}</p>
              <p className="text-xs text-muted-foreground">{JSON.stringify(event.payload)}</p>
            </div>
          </div>
        )) : <p className="text-sm text-muted-foreground text-center py-8">No real-time events yet. Start a task to see updates.</p>}
      </CardContent>
    </Card>
  );
}

function HireAgentDialog({ open, onOpenChange, onHire, registryAgents }: { open: boolean, onOpenChange: (open: boolean) => void, onHire: (agent: any) => void, registryAgents: any[] }) {
  const [search, setSearch] = useState("");
  const filtered = registryAgents.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Hire Agent from Registry</DialogTitle></DialogHeader>
        <div className="relative my-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search for agents by name, skill, or category..." className="pl-10" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto">
          {filtered.map(agent => (
            <Card key={agent.id} className="p-3 flex flex-col items-center text-center cursor-pointer hover:bg-muted/50" onClick={() => onHire(agent)}>
              <div className="text-3xl mb-2">{agent.emoji || "🤖"}</div>
              <p className="text-xs font-bold">{agent.name}</p>
              <p className="text-[10px] text-muted-foreground line-clamp-2">{agent.description}</p>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateIssueDialog({ open, onOpenChange, agents, onCreate }: { open: boolean, onOpenChange: (open: boolean) => void, agents: any[], onCreate: (title: string, desc: string, agentId: string) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [agentId, setAgentId] = useState("");

  const handleSubmit = () => {
    if (!title.trim() || !agentId) {
      toast.error("Title and an assigned agent are required.");
      return;
    }
    onCreate(title, description, agentId);
    onOpenChange(false);
    setTitle("");
    setDescription("");
    setAgentId("");
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create a New Issue</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Develop new landing page" /></div>
          <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Provide details about the task..." /></div>
          <div className="space-y-2">
            <Label>Assign Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger><SelectValue placeholder="Select an agent..." /></SelectTrigger>
              <SelectContent>{agents.map(a => <SelectItem key={a.id} value={a.id}>{a.emoji} {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>Create Issue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
