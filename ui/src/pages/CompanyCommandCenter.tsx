import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Users, FolderKanban, Activity, Shield, ChevronRight, Plus, Briefcase, Bot, Loader2, CheckCircle, Clock, AlertCircle, Search, MoreVertical, Building2, UserMinus, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getCompanyById, getTeamById, hireAgent, createIssue, getAgentsByTeam, getIssuesByTeam, getIssuesByCompany, getActivityByCompany, getTeamsByCompany, getAgentsByCompany, createTeam, getCompanyOperations } from "@/lib/company-data";
import { getAgents, AgentSkill } from "@/lib/api";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";
import { hydrateCompanyFromBackend } from "@/lib/company-data";
import { useScrollMemory } from "@/lib/use-scroll-memory";

// --- Design Tokens ---
const FONTS = {
  heading: 'Space Grotesk, sans-serif',
  body: 'Inter, sans-serif',
};
const COLORS = {
  bg: '#0a0a0f',
  card: '#1a1a2e',
  accent: '#00adb5',
  border: 'rgba(255,255,255,0.1)',
};

// --- Data Fetching ---
const fetchCompanyHierarchy = async (companyId: string) => {
  const company = getCompanyById(companyId);
  if (!company) throw new Error("Company not found");

  const teams = getTeamsByCompany(companyId);
  const allAgents = getAgentsByCompany(companyId);

  const ceo = allAgents.find(a => a.isCEO) || { id: "agent-ceo", name: "CEO", role: "CEO", emoji: "👑", status: "idle" };

  return {
    id: company.id,
    name: company.name,
    emoji: company.emoji,
    ceo,
    teams: teams.map(t => ({
      ...t,
      agents: allAgents.filter(a => a.teamId === t.id)
    }))
  };
};

const MCP_TOOLS = [
  { id: "web_search", name: "Web Search Access" }, 
  { id: "python_interpreter", name: "Python Execution" }, 
  { id: "file_io", name: "Local File I/O" },
  { id: "github_integration", name: "GitHub Access" }
];

// --- Status Ring Component ---
const StatusRing = ({ status, pulse = false }: { status: string, pulse?: boolean }) => {
  const colors: Record<string, string> = {
    idle: "bg-[#22c55e] shadow-[0_0_8px_#22c55e]",
    running: "bg-[#00adb5] shadow-[0_0_8px_#00adb5]",
    approval: "bg-[#f97316] shadow-[0_0_8px_#f97316]",
    stopped: "bg-[#6b7280]"
  };
  const colorClass = colors[status] || colors.stopped;
  return (
    <div className="relative flex items-center justify-center h-2 w-2">
      {pulse && status === 'running' && <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-[#00adb5]`} />}
      <span className={`relative inline-flex rounded-full h-2 w-2 ${colorClass}`} />
    </div>
  );
};

// --- Main Page Component ---
export function CompanyCommandCenter() {
    const { id: companyIdParam, teamId: teamIdParam } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const companyId = companyIdParam || "";
    const goToCompanies = () => navigate("/companies");
  
    // Global State
    const [hireOpen, setHireOpen] = useState(false);
    const [issueOpen, setIssueOpen] = useState(false);
    const [createTeamOpen, setCreateTeamOpen] = useState(false);
    
    const [activeNode, setActiveNode] = useState<any>({ type: 'company', id: companyId });
  
    const { data: hierarchy, isLoading } = useQuery({
        queryKey: ['companyHierarchy', companyId],
        queryFn: async () => {
            const localCompany = getCompanyById(companyId);
            const localTeams = getTeamsByCompany(companyId);
            const localAgents = getAgentsByCompany(companyId);

            if (!localCompany || (localTeams.length === 0 && localAgents.length === 0)) {
                await hydrateCompanyFromBackend(companyId);
            }

            return fetchCompanyHierarchy(companyId);
        },
        enabled: !!companyId,
    });
  
    useEffect(() => {
        if (teamIdParam) setActiveNode({ type: 'team', id: teamIdParam });
        else setActiveNode({ type: 'company', id: companyId });
    }, [companyId, teamIdParam]);

    const company = getCompanyById(companyId);
    const companyIssues = getIssuesByCompany(companyId);
    const isTeam = activeNode.type === 'team';
    const isAgent = activeNode.type === 'agent';
    const activeTeamId = isTeam ? activeNode.id : (isAgent ? hierarchy?.teams.find((t:any) => t.agents.some((a:any) => a.id === activeNode.id))?.id : null);
    
    const teamData = getTeamById(activeTeamId || "");
    const teamAgents = getAgentsByTeam(activeTeamId || "");
    const teamIssues = getIssuesByTeam(activeTeamId || "");
    const activeAgentData = isAgent ? (hierarchy?.teams.flatMap((t:any) => t.agents).find((a:any) => a.id === activeNode.id) || hierarchy?.ceo) : null;

    const { data: registryAgents } = useQuery<AgentSkill[]>({ queryKey: ['registryAgents'], queryFn: getAgents });
    const { data: operations } = useQuery({
        queryKey: ['companyOperations', companyId],
        queryFn: () => getCompanyOperations(companyId),
        enabled: !!companyId,
        refetchInterval: 15000,
    });

    const handleNodeSelect = (type: 'company' | 'team' | 'agent', id: string) => {
        if (type === 'company') navigate(`/company/${id}`);
        else if (type === 'team') navigate(`/company/${companyId}/teams/${id}`);
        else setActiveNode({ type, id });
    };
    
    if (isLoading || !company || !hierarchy) return <div className="flex items-center justify-center h-full bg-background text-foreground"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  
    return (
      <div className="h-full w-full overflow-hidden bg-background text-foreground" style={{ fontFamily: FONTS.body }}>
        <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-sky-400/7 rounded-full blur-[150px] pointer-events-none" />
        <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/7 rounded-full blur-[150px] pointer-events-none" />
        
        <TooltipProvider>
          <ResizablePanelGroup direction="horizontal" className="h-full w-full relative z-10">
            <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="bg-card/70 backdrop-blur-2xl border-r border-border/50 shadow-[0_20px_60px_rgba(15,23,42,0.04)]">
              <OrgTreePanel hierarchy={hierarchy} activeNode={activeNode} onSelect={handleNodeSelect} onCreateTeam={() => setCreateTeamOpen(true)} />
            </ResizablePanel>
            
            <ResizableHandle withHandle className="bg-border/70" />
            
            <ResizablePanel defaultSize={55} className="bg-transparent flex flex-col relative overflow-hidden">
               <CenterPanel activeNode={activeNode} company={company} issues={companyIssues} operations={operations} team={teamData} teamIssues={teamIssues} agents={teamAgents} agent={activeAgentData} onCreateIssue={() => setIssueOpen(true)} onBackToCompanies={goToCompanies} />
            </ResizablePanel>
            
            <ResizableHandle withHandle className="bg-border/70" />
            
            <ResizablePanel defaultSize={25} minSize={20} maxSize={35} className="bg-card/70 backdrop-blur-2xl border-l border-border/50 shadow-[0_20px_60px_rgba(15,23,42,0.04)]">
              <InspectorPanel activeNode={activeNode} team={teamData} agent={activeAgentData} onHire={() => setHireOpen(true)} />
            </ResizablePanel>
          </ResizablePanelGroup>
          
          <HireAgentDialog open={hireOpen} onOpenChange={setHireOpen} team={teamData} registryAgents={registryAgents || []} onHire={(agent) => { if (company && teamData) { hireAgent(company.id, { ...agent, teamId: teamData.id }); toast.success(`Hired ${agent.name} to ${teamData.name}`); queryClient.invalidateQueries({ queryKey: ['companyData'] }); setHireOpen(false); } }} />
          <CreateIssueDialog open={issueOpen} onOpenChange={setIssueOpen} agents={teamAgents || []} onCreate={(title, desc, agentId) => { if (company && teamData) { createIssue(company.id, { title, description: desc, priority: "medium", teamId: teamData.id, agentId }); toast.success(`Issue "${title}" created`); queryClient.invalidateQueries({ queryKey: ['companyData'] }); setIssueOpen(false); } }} />
          <CreateTeamDialog open={createTeamOpen} onOpenChange={setCreateTeamOpen} onCreate={(name) => { if (company) { createTeam(company.id, { name, description: "Operational Unit", emoji: "👥" }); toast.success(`Team ${name} created!`); queryClient.invalidateQueries({ queryKey: ['companyHierarchy', company.id] }); setCreateTeamOpen(false); } }} />
        </TooltipProvider>
      </div>
    );
}

function OrgTreePanel({ hierarchy, activeNode, onSelect, onCreateTeam }: any) {
    return (
        <div className="flex flex-col h-full text-foreground">
            <div className="p-5 border-b border-border/50 bg-background/55">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-xl shadow-sm">{hierarchy.emoji}</div>
                    <div>
                      <h2 className="font-bold text-lg leading-tight" style={{fontFamily: FONTS.heading}}>{hierarchy.name}</h2>
                      <p className="text-[10px] text-primary uppercase tracking-widest font-semibold">Active Command</p>
                    </div>
                </div>
            </div>
            <ScrollArea className="flex-1 p-3">
                <div className="space-y-4">
                    <div className="space-y-1">
                        <TreeNode label="Company Overview" icon={<Building2 className="h-4 w-4" />} isSelected={activeNode.type === 'company'} onClick={() => onSelect('company', hierarchy.id)} />
                        <TreeNode label={`${hierarchy.ceo.name} (CEO)`} emoji={hierarchy.ceo.emoji} status={hierarchy.ceo.status} isSelected={activeNode.type === 'agent' && activeNode.id === hierarchy.ceo.id} onClick={() => onSelect('agent', hierarchy.ceo.id)} isSub={true} />
                    </div>
                    <div className="pt-2">
                        <div className="flex items-center justify-between px-2 mb-2 group"><h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Operational Teams</h3><button onClick={onCreateTeam} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all"><Plus className="h-3 w-3" /></button></div>
                        <div className="space-y-4">
                            {hierarchy.teams.map((team: any) => (
                                <div key={team.id} className="space-y-1">
                                    <TreeNode label={team.name} icon={<Users className="h-4 w-4" />} isSelected={activeNode.type === 'team' && activeNode.id === team.id} onClick={() => onSelect('team', team.id)} />
                                    <div className="pl-3 border-l border-border/60 ml-3 space-y-1">
                                        {team.agents.map((agent: any) => (
                                            <TreeNode key={agent.id} label={agent.name} emoji={agent.emoji} status={agent.status} isSelected={activeNode.type === 'agent' && activeNode.id === agent.id} onClick={() => onSelect('agent', agent.id)} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}

function TreeNode({ label, icon, emoji, status, isSelected, onClick }: any) {
    return (
        <button onClick={onClick} className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-sm ${isSelected ? 'bg-primary/10 text-foreground font-medium border border-primary/20 shadow-sm' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'}`}>
            {icon ? <span className={isSelected ? 'text-primary' : 'text-muted-foreground'}>{icon}</span> : <span className="text-base leading-none">{emoji}</span>}
            <span className="flex-1 truncate text-xs">{label}</span>
            {status && <StatusRing status={status} pulse={isSelected} />}
        </button>
    );
}

function CenterPanel({ activeNode, company, issues, operations, team, teamIssues, agents, agent, onCreateIssue, onBackToCompanies }: any) {
    const scrollRef = useScrollMemory(`esemble_scroll_company_${company?.id || "unknown"}_${activeNode.type}_${activeNode.id || "root"}`);
    return (
        <div className="flex-1 flex flex-col h-full relative">
            <ScrollArea ref={scrollRef} className="flex-1"><AnimatePresence mode="wait">
               {activeNode.type === 'company' && <motion.div key="comp" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0}} className="p-8"><CompanyOverview company={company} issues={issues} operations={operations} onBackToCompanies={onBackToCompanies} onCreateIssue={onCreateIssue} /></motion.div>}
                {activeNode.type === 'team' && <motion.div key="team" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0}} className="p-8 h-full flex flex-col"><TeamWorkspace team={team} issues={teamIssues} agents={agents} onCreateIssue={onCreateIssue} /></motion.div>}
                {activeNode.type === 'agent' && <motion.div key="agent" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0}} className="p-8"><AgentDetailView agent={agent} /></motion.div>}
            </AnimatePresence></ScrollArea>
        </div>
    );
}

function CompanyOverview({ company, issues = [], operations, onBackToCompanies, onCreateIssue }: any) {
    const navigate = useNavigate();
    const { data: activity } = useQuery({ queryKey: ['activity', company?.id], queryFn: () => getActivityByCompany(company?.id) });
    const issueStats = issues.reduce((acc: any, issue: any) => {
        acc[issue.status] = (acc[issue.status] || 0) + 1;
        return acc;
    }, {});
    const operationalCounts = operations?.counts;
    const operationalIssues = operationalCounts?.issues;
    const operationalWorkflows = operationalCounts?.workflows;
    const openIssues = operationalCounts?.open_issues ?? ((issueStats.queued || 0) + (issueStats.in_progress || 0) + (issueStats.blocked || 0));
    const completedIssues = operationalIssues?.completed ?? issueStats.completed ?? 0;
    const failedIssues = operationalIssues?.failed ?? issueStats.failed ?? 0;
    const blockedItems = operationalCounts?.blocked_items ?? issueStats.blocked ?? 0;
    const approvalsWaiting = operationalCounts?.approvals_waiting ?? 0;
    const failedRuns = operationalCounts?.failed_runs ?? 0;
    const runningRuns = operationalWorkflows?.running ?? 0;
    const evaluationPassRate = operationalCounts?.evaluation_pass_rate ?? (issues.length === 0 ? 100 : Math.round((completedIssues / Math.max(1, issues.length)) * 100));
    const healthScore = operationalCounts?.health_score ?? (issues.length === 0 ? 100 : Math.max(42, Math.min(100, 100 - (failedIssues * 18) - ((issueStats.blocked || 0) * 10) - ((issueStats.in_progress || 0) * 4))));
    const liveActivity = operations?.recent?.activity?.length ? operations.recent.activity : activity;
    const recentRuns = operations?.recent?.runs || [];
    const recentArtifacts = operations?.recent?.artifacts || [];
    const latestActivity = liveActivity?.[0];
    const directive = company?.mission?.trim()
      ? company.mission
      : latestActivity?.message || latestActivity?.action || "Operational workspace ready for new directives.";

    const exportReport = () => {
      const report = {
        company,
        issues,
        activity,
        generated_at: new Date().toISOString(),
        operations,
        summary: {
          total_agents: operationalCounts?.agents ?? company?.agentCount ?? 0,
          total_teams: operationalCounts?.teams ?? company?.teamCount ?? 0,
          open_issues: openIssues,
          completed_issues: completedIssues,
          failed_issues: failedIssues,
          blocked_items: blockedItems,
          failed_runs: failedRuns,
          approvals_waiting: approvalsWaiting,
          evaluation_pass_rate: evaluationPassRate,
          health_score: healthScore,
        },
      };

      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${company?.name?.toLowerCase().replace(/\s+/g, "-") || "company"}-report.json`;
      link.click();
      URL.revokeObjectURL(url);
    };
    return (
        <div className="max-w-5xl space-y-8">
            <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-br from-card via-background to-muted/40 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.08),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.05),transparent_28%)]" />
              <div className="relative p-8 md:p-10">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-4">
                    <Button variant="ghost" size="sm" onClick={onBackToCompanies} className="gap-2 rounded-full border border-border/60 bg-background/75 text-foreground shadow-sm hover:bg-background">
                      <ChevronLeft className="h-4 w-4" />
                      Back to companies
                    </Button>
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Workspace active
                      </div>
                      <h1 className="mt-4 text-4xl md:text-5xl font-black tracking-tighter text-foreground" style={{fontFamily: FONTS.heading}}>
                        {company?.emoji} {company?.name}
                      </h1>
                      <p className="mt-3 max-w-2xl text-sm md:text-base text-muted-foreground leading-relaxed">
                        Executive overview for your company workspace. Track teams, agents, issues, and activity from a cleaner, more premium control surface.
                      </p>
                    </div>
                  </div>
                  <div className="hidden lg:flex flex-col items-end gap-3">
                    <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/75 p-2 shadow-sm">
                      <Button size="sm" onClick={onCreateIssue} className="gap-2 rounded-xl">
                        <Plus className="h-4 w-4" />
                        New issue
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/company/${company.id}/reports`)} className="gap-2 rounded-xl bg-background/70">
                        Reports
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/company/${company.id}/activity`)} className="gap-2 rounded-xl">
                        Activity
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/75 px-4 py-3 shadow-sm">
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Health</p>
                        <p className="text-lg font-bold text-foreground">{healthScore}%</p>
                      </div>
                      <div className="h-12 w-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600">
                        <Activity className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-[1.5rem] border border-border/60 bg-card/80 p-2 shadow-sm backdrop-blur-xl lg:hidden">
              <Button size="sm" onClick={onCreateIssue} className="gap-2 rounded-xl">
                <Plus className="h-4 w-4" />
                New issue
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(`/company/${company.id}/reports`)} className="rounded-xl bg-background/70">
                Reports
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate(`/company/${company.id}/activity`)} className="rounded-xl">
                Activity
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard title="Total Agents" value={operationalCounts?.agents ?? company?.agentCount ?? 0} />
                <StatCard title="Active Issues" value={openIssues} />
                <StatCard title="Live Runs" value={runningRuns} />
                <StatCard title="Avg. Health" value={`${healthScore}%`} accent />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <SignalCard label="Approvals" value={approvalsWaiting} tone={approvalsWaiting > 0 ? "amber" : "neutral"} detail="Waiting for review" />
                <SignalCard label="Blocked Items" value={blockedItems} tone={blockedItems > 0 ? "amber" : "neutral"} detail="Issues or paused runs" />
                <SignalCard label="Failed Runs" value={failedRuns} tone={failedRuns > 0 ? "red" : "neutral"} detail="Needs investigation" />
                <SignalCard label="Eval Pass Rate" value={`${evaluationPassRate}%`} tone={evaluationPassRate < 80 ? "amber" : "green"} detail="Completed vs total signals" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
              <div className="xl:col-span-2 bg-card/85 backdrop-blur-xl border border-border/60 rounded-[1.75rem] p-6 shadow-[0_16px_50px_rgba(15,23,42,0.06)]">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-foreground" style={{fontFamily: FONTS.heading}}>
                  <Bot className="h-5 w-5 text-sky-600" /> CEO Directive
                </h2>
                <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
                  <p className="text-sm text-foreground leading-relaxed italic">
                    "{directive}"
                  </p>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <MiniMetric label="Teams" value={operationalCounts?.teams ?? company?.teams?.length ?? 0} />
                  <MiniMetric label="Agents" value={operationalCounts?.agents ?? company?.agentCount ?? 0} />
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" onClick={exportReport} className="gap-2">
                    Export report
                  </Button>
                </div>
              </div>

              <div className="xl:col-span-3 bg-card/85 backdrop-blur-xl border border-border/60 rounded-[1.75rem] p-6 shadow-[0_16px_50px_rgba(15,23,42,0.06)] flex flex-col h-[360px]">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold flex items-center gap-2 text-foreground" style={{fontFamily: FONTS.heading}}>
                    <Activity className="h-5 w-5 text-sky-600" /> Live Network Feed
                  </h2>
                  <span className="rounded-full border border-border/60 bg-muted/60 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                    Real-time
                  </span>
                </div>
                <ScrollArea className="flex-1 -mr-4 pr-4">
                  <div className="space-y-4">
                    {liveActivity?.slice(0, 10).map((a: any, i:number) => (
                      <div key={a.id || i} className="flex gap-3 text-sm rounded-2xl border border-border/60 bg-muted/35 p-3">
                        <div className="mt-0.5 h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                          <Play className="h-3 w-3" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-foreground font-medium">{a.message || a.action}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">{new Date(a.created_at || a.time).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                    {(!liveActivity || liveActivity.length === 0) && (
                      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-8 text-center text-xs text-muted-foreground">
                        No audit events yet. Create issues or run workflows to populate this feed.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {(recentRuns.length > 0 || recentArtifacts.length > 0) && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <OperationalList
                  title="Recent Workflow Runs"
                  empty="No linked workflow runs yet."
                  items={recentRuns.map((run: any) => ({
                    id: run.run_id,
                    title: run.workflow_id || run.run_id,
                    meta: `${run.status || "unknown"} · ${run.current_node || run.last_agent_id || "no active node"}`,
                  }))}
                />
                <OperationalList
                  title="Recent Artifacts"
                  empty="No report artifacts linked yet."
                  items={recentArtifacts.map((artifact: any) => ({
                    id: artifact.artifact_hash || artifact.run_id || artifact.issue_id,
                    title: artifact.title || artifact.workflow_id || "Workflow artifact",
                    meta: artifact.artifact_hash ? `Artifact ${artifact.artifact_hash}` : artifact.run_id || "Pending artifact",
                  }))}
                />
              </div>
            )}
        </div>
    );
}

function SignalCard({ label, value, detail, tone = "neutral" }: { label: string; value: string | number; detail: string; tone?: "neutral" | "green" | "amber" | "red" }) {
  const toneClass = {
    neutral: "border-border/60 bg-card/75 text-muted-foreground",
    green: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600",
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-600",
    red: "border-red-500/25 bg-red-500/10 text-red-600",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-[10px] uppercase tracking-[0.18em] font-black">{label}</p>
      <p className="mt-2 text-2xl font-black text-foreground" style={{fontFamily: FONTS.heading}}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 shadow-sm">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black text-foreground">{value}</p>
    </div>
  );
}

function OperationalList({ title, items, empty }: { title: string; items: Array<{ id: string; title: string; meta: string }>; empty: string }) {
  return (
    <div className="bg-card/85 backdrop-blur-xl border border-border/60 rounded-[1.75rem] p-6 shadow-[0_16px_50px_rgba(15,23,42,0.06)]">
      <h2 className="text-lg font-bold mb-4 text-foreground" style={{fontFamily: FONTS.heading}}>{title}</h2>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="rounded-2xl border border-border/60 bg-muted/35 p-4">
            <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
            <p className="mt-1 text-[11px] text-muted-foreground truncate">{item.meta}</p>
          </div>
        ))}
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-6 text-center text-xs text-muted-foreground">
            {empty}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamWorkspace({ team, issues, agents, onCreateIssue }: any) {
    if (!team) return <div className="flex items-center justify-center py-20 text-primary font-bold"><Loader2 className="animate-spin mr-2" /> Initializing Workspace...</div>;
    return (
        <div className="flex flex-col h-full min-h-[600px]">
        <div className="flex items-center justify-between mb-8">
                <div><h1 className="text-3xl font-bold flex items-center gap-3 text-foreground" style={{fontFamily: FONTS.heading}}>{team.name}</h1><p className="text-muted-foreground text-sm mt-1">Operational task board and agent management.</p></div>
                <Button onClick={onCreateIssue} className="bg-primary text-primary-foreground font-bold hover:bg-primary/90 gap-2 shadow-[0_0_15px_rgba(0,173,181,0.2)]"><Plus className="h-4 w-4" /> Deploy Task</Button>
            </div>
            <div className="flex-1 bg-card/70 rounded-2xl border border-border/50 p-4 overflow-hidden flex flex-col"><IssuesKanbanPanel issues={issues} agents={agents} teamId={team.id} /></div>
        </div>
    );
}

function AgentDetailView({ agent }: any) {
    if (!agent) return <div className="p-8 text-muted-foreground italic text-center">Operative profile hidden or not initialized.</div>;
    return (
        <div className="max-w-4xl">
             <div className="flex items-center gap-6 mb-10 pb-10 border-b border-border/50"><div className="h-24 w-24 rounded-2xl bg-card border border-border/50 flex items-center justify-center text-5xl shadow-2xl">{agent.emoji}</div>
                 <div><h1 className="text-4xl font-bold mb-1 text-foreground" style={{fontFamily: FONTS.heading}}>{agent.name}</h1><p className="text-primary font-medium tracking-wide">{agent.role || 'Specialist'}</p><div className="flex items-center gap-2 mt-3"><StatusRing status={agent.status} pulse={agent.status === 'running'} /><span className="text-xs text-muted-foreground uppercase tracking-widest">{agent.status}</span></div></div>
             </div>
             <h2 className="text-xl font-bold mb-4 text-foreground" style={{fontFamily: FONTS.heading}}>Task History</h2>
             <div className="bg-card/80 backdrop-blur-lg border border-border/50 rounded-xl overflow-hidden"><table className="w-full text-left text-sm"><thead className="bg-muted/40 border-b border-border/50"><tr><th className="p-4 font-semibold text-muted-foreground">Task</th><th className="p-4 font-semibold text-muted-foreground">Priority</th><th className="p-4 font-semibold text-muted-foreground">Status</th></tr></thead><tbody><tr className="border-b border-border/50 hover:bg-muted/30 transition-colors"><td className="p-4 text-foreground/90">Initialize neural engine</td><td className="p-4"><Badge className="bg-orange-500/20 text-orange-500 border-0">High</Badge></td><td className="p-4"><span className="flex items-center gap-2 text-primary"><Loader2 className="h-3 w-3 animate-spin" /> Running</span></td></tr></tbody></table></div>
        </div>
    );
}

function InspectorPanel({ activeNode, team, agent, onHire }: any) {
    if (activeNode.type === 'company') return <div className="p-6 h-full flex flex-col text-center justify-center items-center opacity-75 text-muted-foreground"><Shield className="h-10 w-10 mb-4" /><p className="text-sm px-10 leading-relaxed">Select a Team or Operative to initialize configuration protocols.</p></div>;
    if (activeNode.type === 'team' && team) return (
        <div className="p-6 h-full flex flex-col"><div className="mb-8"><h3 className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-black mb-2">Operational Node</h3><h4 className="text-xl font-bold text-foreground" style={{fontFamily: FONTS.heading}}>{team.name}</h4><p className="text-sm text-primary font-semibold mt-1">{team.agents?.length || 0} Operatives Active</p></div>
            <div className="mb-8 flex-1"><h5 className="text-[10px] font-black text-muted-foreground mb-4 uppercase tracking-[0.2em]">Contextual Access</h5><div className="space-y-2">{MCP_TOOLS.map(tool => (<div key={tool.id} className="flex items-center justify-between bg-muted/40 p-3 rounded-lg border border-border/50"><Label htmlFor={tool.id} className="text-xs cursor-pointer text-foreground">{tool.name}</Label><Switch id={tool.id} className="data-[state=checked]:bg-primary" /></div>))}</div></div>
            <div className="mt-auto space-y-3 pt-6 border-t border-border/50"><Button onClick={onHire} className="w-full bg-primary text-primary-foreground border border-primary/30 hover:bg-primary/90 shadow-[0_0_15px_rgba(0,173,181,0.1)] font-bold uppercase tracking-widest text-[10px] h-11"><Briefcase className="h-4 w-4 mr-2" /> Hire Operative</Button><Button variant="ghost" className="w-full text-destructive/70 hover:text-destructive hover:bg-destructive/5 text-[10px] font-bold uppercase tracking-widest">Decommission Unit</Button></div>
        </div>
    );
    if (activeNode.type === 'agent' && agent) return (
        <div className="p-6 h-full flex flex-col"><div className="mb-8"><h3 className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-black mb-2">Operative Profile</h3><div className="flex items-center gap-3"><div className="text-3xl">{agent.emoji}</div><div><h4 className="text-lg font-bold leading-tight text-foreground" style={{fontFamily: FONTS.heading}}>{agent.name}</h4><p className="text-xs text-primary">{agent.role}</p></div></div></div>
            <div className="mb-8"><h5 className="text-[10px] font-black text-muted-foreground mb-3 uppercase tracking-[0.2em]">Core Engine</h5><div className="bg-muted/40 p-3 rounded-lg border border-border/50 text-xs text-foreground/70 space-y-2"><div className="flex justify-between"><span>Compute:</span><span className="text-foreground">Gemini 2.5 Flash</span></div><div className="flex justify-between"><span>Status:</span><span className="text-primary uppercase font-bold tracking-tighter">Verified</span></div></div></div>
            <div className="mt-auto space-y-3 pt-6 border-t border-border/50"><Button variant="outline" className="w-full bg-background/60 border-border/40 font-bold uppercase tracking-widest text-[10px] h-11">View Audit Stream</Button><Button variant="ghost" className="w-full text-destructive/70 hover:text-destructive hover:bg-destructive/5 text-[10px] font-bold uppercase tracking-widest">Terminate Contract</Button></div>
        </div>
    );
    return null;
}

const StatCard = ({ title, value, accent }: any) => (
    <div className={`bg-card/85 backdrop-blur-lg border ${accent ? 'border-primary/25 shadow-[0_0_15px_rgba(14,165,233,0.08)]' : 'border-border/60'} rounded-2xl p-5 flex flex-col justify-center`}><h4 className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1">{title}</h4><p className={`text-4xl font-bold ${accent ? 'text-primary' : 'text-foreground'}`} style={{fontFamily: FONTS.heading}}>{value}</p></div>
);

function IssuesKanbanPanel({ issues, agents }: any) {
    const queryClient = useQueryClient();
    const handleDragEnd = (event: any) => { if (event.over) { toast.success(`Task shifted to ${event.over.id}`); queryClient.invalidateQueries({ queryKey: ['companyData'] }); } };
    const columns = [{ id: 'queued', title: 'Queued', color: 'bg-muted/60' }, { id: 'in_progress', title: 'Running', color: 'bg-primary/20 text-primary' }, { id: 'completed', title: 'Success', color: 'bg-green-500/20 text-green-600' }];
    return (<DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}><div className="grid grid-cols-3 gap-4 h-full">{columns.map(col => (<KanbanColumn key={col.id} id={col.id} title={col.title} headerColor={col.color} issues={issues?.filter((i:any) => i.status === col.id) || []} agents={agents} />))}</div></DndContext>);
}

function KanbanColumn({ id, title, headerColor, issues, agents }: any) {
    return (<div className="bg-card/70 rounded-xl border border-border/50 flex flex-col overflow-hidden h-full"><div className="p-3 border-b border-border/50 flex items-center justify-between"><h4 className="font-bold text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 text-foreground"><span className={`w-1.5 h-1.5 rounded-full ${headerColor.split(' ')[0]}`} /> {title}</h4><Badge className="bg-muted/60 text-muted-foreground border-0 text-[10px]">{issues.length}</Badge></div>
            <ScrollArea className="flex-1 p-2"><SortableContext id={id} items={issues.map((i: any) => i.id)} strategy={verticalListSortingStrategy}><div className="space-y-2 min-h-[100px]">{issues.map((issue: any) => <KanbanCard key={issue.id} issue={issue} agents={agents} />)}</div></SortableContext></ScrollArea></div>);
}

function KanbanCard({ issue, agents }: any) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: issue.id });
    const assignedAgent = agents?.find((a: any) => a.id === issue.agentId);
    return (<div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} className="bg-card border border-border/50 hover:border-primary/30 p-3 rounded-lg text-sm cursor-grab shadow-sm group transition-colors"><p className="font-medium text-foreground text-xs mb-3">{issue.title}</p>
            <div className="flex items-center justify-between">{assignedAgent ? (<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md"><span>{assignedAgent.emoji}</span><span>{assignedAgent.name}</span></div>) : (<div className="text-[10px] text-muted-foreground uppercase tracking-tighter">Pending Assign</div>)}{issue.status === 'queued' && <Play className="h-2.5 w-2.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />}</div></div>);
}

function HireAgentDialog({ open, onOpenChange, onHire, registryAgents, team }: any) {
    const [search, setSearch] = useState("");
    const filtered = registryAgents.filter((a: AgentSkill) => a.name.toLowerCase().includes(search.toLowerCase()));
    return (<Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-4xl bg-card/95 backdrop-blur-2xl border border-border/50 text-foreground p-0 overflow-hidden"><div className="p-6 border-b border-border/50 flex justify-between items-center bg-muted/30"><div><DialogTitle className="text-2xl" style={{fontFamily: FONTS.heading}}>Registry Access</DialogTitle><DialogDescription className="text-muted-foreground mt-1">Hire specialized operative into <strong className="text-primary">{team?.name}</strong>.</DialogDescription></div>
              <div className="relative w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter skills..." className="pl-8 bg-background/70 border-border/50 rounded-full h-8 text-xs" /></div></div>
          <ScrollArea className="h-[60vh] p-6 bg-background/50"><div className="grid grid-cols-3 gap-4">{filtered.map((agent: AgentSkill) => (<div key={agent.id} className="bg-card border border-border/50 p-4 rounded-xl hover:border-primary/40 transition-all cursor-pointer group" onClick={() => onHire(agent)}><div className="flex justify-between items-start mb-4"><div className="text-3xl bg-muted/60 h-12 w-12 rounded-xl flex items-center justify-center border border-border/50 group-hover:scale-110 transition-transform">{agent.emoji || "🤖"}</div><Badge className="bg-muted/60 text-muted-foreground text-[8px] uppercase tracking-widest border-0">{agent.category}</Badge></div><p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{agent.name}</p><p className="text-[10px] text-muted-foreground line-clamp-2 mt-2 leading-relaxed">{agent.description}</p></div>))}</div></ScrollArea></DialogContent></Dialog>);
}

function CreateIssueDialog({ open, onOpenChange, agents, onCreate }: any) {
    const [form, setForm] = useState({ title: "", desc: "", agentId: "" });
    return (<Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="bg-card/95 backdrop-blur-2xl border border-border/50 text-foreground p-6 shadow-2xl"><DialogHeader className="mb-4"><DialogTitle className="text-2xl" style={{fontFamily: FONTS.heading}}>Deploy Directive</DialogTitle><DialogDescription className="text-muted-foreground">Initialize operational tasking for unit operative.</DialogDescription></DialogHeader>
          <div className="space-y-5">
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Directive Designation</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Task ID / Description" className="bg-background/70 border-border/50 focus-visible:ring-primary h-10 text-sm" /></div>
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Intelligence Context</Label><Textarea value={form.desc} onChange={e => setForm({...form, desc: e.target.value})} placeholder="Instructional payload..." className="bg-background/70 border-border/50 focus-visible:ring-primary min-h-[100px] text-sm" /></div>
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Assigned Operative</Label>
              <Select value={form.agentId} onValueChange={id => setForm({...form, agentId: id})}><SelectTrigger className="bg-background/70 border-border/50 focus:ring-primary h-10 text-sm"><SelectValue placeholder="Select operative..." /></SelectTrigger><SelectContent className="bg-popover border border-border/50 text-popover-foreground">{agents?.map((a:any) => <SelectItem key={a.id} value={a.id} className="focus:bg-primary/20 focus:text-primary">{a.emoji} {a.name}</SelectItem>)}</SelectContent></Select></div></div>
          <DialogFooter className="mt-6 border-t border-border/50 pt-4"><Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground uppercase tracking-widest text-[10px] font-bold">Abort</Button><Button onClick={() => onCreate(form.title, form.desc, form.agentId)} className="bg-primary text-primary-foreground font-black uppercase tracking-widest text-[10px] h-10 px-8 shadow-[0_0_15px_rgba(0,173,181,0.2)]">Execute</Button></DialogFooter></DialogContent></Dialog>);
}

function CreateTeamDialog({ open, onOpenChange, onCreate }: any) {
    const [name, setName] = useState("");
    return (<Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="bg-card/95 backdrop-blur-2xl border border-border/50 text-foreground"><DialogHeader><DialogTitle style={{fontFamily: FONTS.heading}}>Initialize Operational Node</DialogTitle></DialogHeader>
                <div className="py-4"><Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 block">Team Designation</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. THREAT_INTEL" className="bg-background/70 border-border/50 focus-visible:ring-primary h-11 uppercase font-mono" /></div>
                <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[10px] font-bold uppercase">Abort</Button><Button onClick={() => onCreate(name)} className="bg-primary text-primary-foreground font-black uppercase tracking-widest text-[10px] h-11 px-8">Confirm Initialize</Button></DialogFooter></DialogContent></Dialog>);
}
