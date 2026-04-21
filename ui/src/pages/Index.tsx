import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTabContext, allApps } from "@/lib/tab-context";
import {
  GitBranch,
  Bot,
  Coins,
  DollarSign,
  Plus,
  MessageSquare,
  Users,
  Workflow,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Target,
  RotateCcw,
  CheckSquare,
  Layers,
  Inbox,
  LayoutGrid,
  Building2,
  Zap,
  Loader2,
  X,
  Calendar,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  getDashboardStats,
  getDashboardWorkflows,
  getDashboardActivity,
  getTokenUsage,
  getDashboardAgentStats,
  getPipelineStatus,
  type DashboardStats,
  type DashboardWorkflow,
  type DashboardActivity,
  type TokenUsageDay,
  type AgentStat,
  type PipelineStatus
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import InboxView from "./Inbox";



const Index = () => {
  const navigate = useNavigate();
  const { openApp } = useTabContext();
  const [activeSubTab, setActiveSubTab] = useState("dashboard");

  useEffect(() => {
    /* 
    // Check if onboarding is needed
    const companies = localStorage.getItem("ensemble_companies");
    if (!companies || Object.keys(JSON.parse(companies)).length === 0) {
      setWizardOpen(true);
    }
    */
  }, []);

  // Real data states
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [workflows, setWorkflows] = useState<DashboardWorkflow[]>([]);
  const [activityFeed, setActivityFeed] = useState<DashboardActivity[]>([]);
  const [topAgents, setTopAgents] = useState<AgentStat[]>([]);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageDay[]>([]);
  const [pipelines, setPipelines] = useState<PipelineStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [statsData, workflowsData, activityData, tokenData, agentsData, pipelinesData] = await Promise.all([
        getDashboardStats(),
        getDashboardWorkflows(),
        getDashboardActivity(10),
        getTokenUsage(7),
        getDashboardAgentStats(),
        getPipelineStatus()
      ]);
      setStats(statsData);
      setWorkflows(workflowsData);
      setActivityFeed(activityData);
      setTopAgents(agentsData);
      setTokenUsage(tokenData);
      setPipelines(pipelinesData);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const handleAppOpen = (appId: string) => {
    const app = allApps.find((a) => a.id === appId);
    if (app) {
      openApp(app);
      navigate(app.url);
    }
  };

  // New Issue dialog state
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issueForm, setIssueForm] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high" | "critical",
    labels: "",
    assignee: "",
    dueDate: "",
    companyId: "",
  });

  const handleNewIssue = useCallback(() => {
    setIssueForm({ title: "", description: "", priority: "medium", labels: "", assignee: "", dueDate: "", companyId: "" });
    setIssueDialogOpen(true);
  }, []);

  const handleIssueSubmit = useCallback(async () => {
    if (!issueForm.title.trim()) {
      toast.error("Issue title is required");
      return;
    }
    // Save issue to company-data localStorage
    try {
      const STORAGE_KEY = "ensemble_companies";
      const raw = localStorage.getItem(STORAGE_KEY);
      const data: Record<string, any> = raw ? JSON.parse(raw) : {};

      // Find or use default company
      let companyId = issueForm.companyId || Object.keys(data)[0];
      if (!companyId || !data[companyId]) {
        // Create default company if none exists
        companyId = "default_company";
        data[companyId] = {
          company: { id: companyId, name: "Default Company", mission: "Build great products", emoji: "🏢", status: "Active" as const, memberCount: 1, agentCount: 0, teamCount: 1 },
          teams: [{ id: "team_1", companyId, name: "Engineering", description: "Core engineering team", emoji: "⚙️", agentCount: 0, completedIssueCount: 0 }],
          agents: [],
          issues: [],
          activity: []
        };
      }

      const newIssue = {
        id: `issue_${Date.now()}`,
        companyId,
        teamId: "team_1",
        teamName: "Engineering",
        title: issueForm.title,
        description: issueForm.description,
        status: "queued" as const,
        priority: issueForm.priority,
        agentId: "",
        agentName: "Unassigned",
        agentEmoji: "🤖",
        emoji: issueForm.priority === "critical" ? "🔴" : issueForm.priority === "high" ? "🟠" : issueForm.priority === "medium" ? "🟡" : "🟢",
        labels: issueForm.labels.split(",").map(l => l.trim()).filter(Boolean),
        assignee: issueForm.assignee,
        dueDate: issueForm.dueDate,
        created: new Date().toISOString(),
      };

      if (!data[companyId].issues) data[companyId].issues = [];
      data[companyId].issues.unshift(newIssue);

      // Add activity
      if (!data[companyId].activity) data[companyId].activity = [];
      data[companyId].activity.unshift({
        id: `activity_${Date.now()}`,
        companyId,
        type: "issue" as const,
        action: `New issue created: ${issueForm.title}`,
        time: new Date().toISOString(),
      });

      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      toast.success(`Issue "${issueForm.title}" created successfully`);
      setIssueDialogOpen(false);
    } catch (err) {
      console.error("Failed to create issue:", err);
      toast.error("Failed to create issue");
    }
  }, [issueForm]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Format helpers
  const formatTokens = (tokens: number) => {
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  const formatCost = (cost: number) => `$${cost.toFixed(2)}`;

  // Activity icon mapping
  const getActivityIcon = (actionType: string) => {
    switch (actionType) {
      case "SOP_START":
      case "WORKFLOW_START":
        return Play;
      case "SOP_COMPLETE":
      case "WORKFLOW_COMPLETE":
      case "TASK_COMPLETE":
        return CheckCircle2;
      case "SOP_ERROR":
        return AlertCircle;
      case "USER_INPUT":
        return MessageSquare;
      case "APPROVAL_REQUEST":
        return Plus;
      default:
        return Clock;
    }
  };

  const getActivityIconColor = (actionType: string) => {
    if (actionType.includes("ERROR")) return "text-rose-400";
    if (actionType.includes("COMPLETE")) return "text-emerald-400";
    if (actionType.includes("APPROVAL")) return "text-amber-400";
    return "text-primary";
  };

  const maxTokens = tokenUsage.length > 0 ? Math.max(...tokenUsage.map((t) => t.tokens), 1) : 1;
  const totalTokens = tokenUsage.reduce((sum, t) => sum + t.tokens, 0);
  const avgTokens = tokenUsage.length > 0 ? totalTokens / tokenUsage.length : 0;

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="max-w-7xl mx-auto flex gap-8">

        {/* SIDEBAR NAVIGATION (Within Tab) */}
        <aside className="w-64 hidden xl:flex flex-col gap-8 shrink-0">
          <div className="space-y-4">
             <Button variant="default" className="w-full justify-start gap-3 h-10 px-4 rounded-xl shadow-lg border border-primary/20" onClick={handleNewIssue}>
                <Plus className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-widest">New Issue</span>
             </Button>

              <div className="space-y-1">
                <NavButton
                  icon={LayoutGrid}
                  label="Dashboard"
                  active={activeSubTab === "dashboard"}
                  onClick={() => setActiveSubTab("dashboard")}
                />
                <NavButton
                  icon={Inbox}
                  label="Inbox"
                  active={activeSubTab === "inbox"}
                  onClick={() => setActiveSubTab("inbox")}
                />
              </div>
          </div>

          <div className="space-y-3">
             <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/30 px-3">Work</h3>
              <div className="space-y-1">
                <NavButton icon={CheckSquare} label="Issues" active={activeSubTab === "issues"} onClick={() => setActiveSubTab("issues")} />
                <NavButton icon={RotateCcw} label="Routines" active={activeSubTab === "routines"} onClick={() => setActiveSubTab("routines")} />
                <NavButton icon={Target} label="Goals" active={activeSubTab === "goals"} onClick={() => setActiveSubTab("goals")} />
              </div>
          </div>

          <div className="space-y-3">
             <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/30 px-3">Resources</h3>
              <div className="space-y-1">
                <button
                   onClick={() => handleAppOpen("workflows")}
                   className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-xs font-bold text-muted-foreground/60 hover:text-foreground hover:bg-white/5 transition-all group"
                >
                   <GitBranch className="h-4 w-4" />
                   <span>Workflows</span>
                </button>
                <button
                   onClick={() => handleAppOpen("agents")}
                   className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-xs font-bold text-muted-foreground/60 hover:text-foreground hover:bg-white/5 transition-all group"
                >
                   <Bot className="h-4 w-4" />
                   <span>Agents</span>
                </button>
              </div>
          </div>

          <div className="space-y-3">
             <div className="flex items-center justify-between px-3">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/50 px-3">Organizations</h3>
                <Plus className="h-3.5 w-3.5 text-muted-foreground/40 cursor-pointer hover:text-primary transition-colors" onClick={() => handleAppOpen("companies")} />
             </div>
             <div className="space-y-0.5">
                <button
                   onClick={() => handleAppOpen("companies")}
                   className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-xs font-bold text-muted-foreground/60 hover:text-foreground hover:bg-white/5 transition-all group"
                >
                   <div className="h-2 w-2 rounded-full bg-primary" />
                   <span className="truncate">Manage Organizations</span>
                </button>
             </div>
          </div>
        </aside>

        {/* MAIN DASHBOARD CONTENT */}
        <div className="flex-1 min-w-0">
          {activeSubTab === "dashboard" && (
            <div className="space-y-8 animate-in fade-in duration-500">
              
              {/* 1. High-Performance Header */}
              <section className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[9px] font-black uppercase tracking-[0.2em] px-2">
                        Sovereign Platform V1.0
                      </Badge>
                      <div className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] text-emerald-500/80 font-bold uppercase tracking-wider">Core Systems Online</span>
                    </div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
                      Command <span className="text-primary italic">Center</span>
                    </h1>
                    <p className="text-sm text-muted-foreground/80 font-medium">
                      Autonomous Intelligence Dashboard · {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" className="h-10 rounded-xl border-border/40 bg-background/50 font-bold text-[10px] uppercase tracking-wider" onClick={fetchData}>
                      <RotateCcw className={`h-3.5 w-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                    <Button size="sm" className="h-10 px-5 rounded-xl shadow-lg shadow-primary/20 font-bold text-[10px] uppercase tracking-widest" onClick={() => handleAppOpen("chat")}>
                      <Bot className="h-4 w-4 mr-2" />
                      Deploy Agent
                    </Button>
                  </div>
                </div>

                {/* Compact Sovereign Mission Bar */}
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-1 md:grid-cols-3 gap-4 p-1 rounded-2xl bg-secondary/20 border border-border/30 backdrop-blur-md"
                >
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-background/40 border border-white/5 shadow-sm">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/10">
                      <Workflow className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground">Autonomous</h3>
                      <p className="text-[9px] text-muted-foreground font-medium">Auto-executing SOPs</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-background/40 border border-white/5 shadow-sm">
                    <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/10">
                      <Bot className="h-4 w-4 text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground">Specialist</h3>
                      <p className="text-[9px] text-muted-foreground font-medium">Deterministic Tool-sets</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-background/40 border border-white/5 shadow-sm">
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/10">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground">Auditable</h3>
                      <p className="text-[9px] text-muted-foreground font-medium">Immutable Trust Ledger</p>
                    </div>
                  </div>
                </motion.div>
              </section>

              {/* 2. Intelligence Metrics Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                
                {/* Left: Stats & Leaderboard */}
                <div className="xl:col-span-8 space-y-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Active Nodes", value: stats?.active_workflows || 0, icon: Workflow, color: "text-blue-400" },
                      { label: "Fleet Size", value: stats?.total_agents || 0, icon: Bot, color: "text-indigo-400" },
                      { label: "Precision", value: `${stats?.success_rate || 0}%`, icon: CheckCircle2, color: "text-emerald-400" },
                      { label: "Est. Spend", value: formatCost(stats?.monthly_cost || 0), icon: DollarSign, color: "text-rose-400" },
                    ].map((s, idx) => (
                      <motion.div 
                        key={idx}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 * idx }}
                        className="p-4 rounded-2xl border border-border/30 bg-card/40 backdrop-blur-sm shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <s.icon className={`h-4 w-4 ${s.color}`} />
                        </div>
                        <p className="text-2xl font-black tracking-tight">{s.value}</p>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-1">{s.label}</p>
                      </motion.div>
                    ))}
                  </div>

                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-[2.5rem] border border-border/40 bg-card/30 backdrop-blur-xl p-8 shadow-2xl relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                       <Bot className="h-32 w-32" />
                    </div>
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h2 className="text-xl font-black tracking-tight uppercase">Agent Performance</h2>
                        <p className="text-xs text-muted-foreground font-medium mt-1">Specialists ranked by execution volume</p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-primary font-bold text-[10px] uppercase tracking-widest" onClick={() => handleAppOpen("agents")}>
                        View Registry
                      </Button>
                    </div>

                    {loading ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted/20 rounded-2xl animate-pulse" />)}
                      </div>
                    ) : topAgents.length === 0 ? (
                      <div className="py-12 text-center border-2 border-dashed border-border/20 rounded-[2rem]">
                        <Bot className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                        <p className="text-sm font-bold text-muted-foreground/40">No Agent Activity Detected</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {topAgents.slice(0, 4).map((agent, i) => (
                          <div key={i} className="p-4 rounded-2xl bg-secondary/20 border border-white/5 flex items-center gap-4 hover:bg-secondary/30 transition-all">
                            <div className="h-12 w-12 rounded-xl bg-background/40 flex items-center justify-center text-2xl border border-white/5">
                              {agent.emoji}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate">{agent.name}</p>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{agent.category}</p>
                            </div>
                            <div className="text-right px-2">
                              <p className="text-lg font-black text-primary">{agent.runs}</p>
                              <p className="text-[9px] text-muted-foreground font-black uppercase tracking-tighter">Runs</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                </div>

                {/* Right Column: Activity Ledger */}
                <div className="xl:col-span-4 h-full">
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="rounded-[2rem] border border-border/40 bg-card/40 backdrop-blur-xl p-6 flex flex-col shadow-2xl h-[480px]"
                  >
                    <div className="flex items-center gap-2 mb-6">
                       <div className="h-2 w-2 rounded-full bg-primary" />
                       <h2 className="text-lg font-black tracking-tight uppercase">Audit Ledger</h2>
                    </div>

                    <ScrollArea className="flex-1 -mx-2 px-2">
                      {activityFeed.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center space-y-3 opacity-20">
                           <Layers className="h-10 w-10" />
                           <p className="text-[10px] font-black uppercase tracking-widest text-center">Ledger Empty</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {activityFeed.slice(0, 15).map((item, idx) => {
                            const isError = item.action_type.includes("ERROR") || item.action_type.includes("FAIL");
                            return (
                              <div key={idx} className="relative pl-6 space-y-1">
                                 <div className={`absolute left-0 top-1.5 h-2 w-2 rounded-full ${isError ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : 'bg-primary/40'}`} />
                                 <p className={`text-[11px] font-bold leading-tight ${isError ? 'text-rose-300' : 'text-foreground/80'}`}>
                                   {item.message}
                                 </p>
                                 <div className="flex items-center gap-2 text-[9px] text-muted-foreground font-bold uppercase tracking-tighter">
                                    <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    <span className="opacity-20">|</span>
                                    <span className="text-primary/60">{item.action_type}</span>
                                 </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                  </motion.div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === "inbox" && <InboxView />}

          {(activeSubTab === "issues" || activeSubTab === "routines" || activeSubTab === "goals") && (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
              <div className="h-16 w-16 rounded-3xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <Bot className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground capitalize">{activeSubTab} Tracking</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Our agents are currently scanning your connected repositories to populate this view.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Issue Dialog */}
      <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Create New Issue</DialogTitle>
            <DialogDescription>
              Fill in the details for the new issue. All fields except title are optional.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="issue-title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="issue-title"
                placeholder="Brief description of the issue"
                value={issueForm.title}
                onChange={(e) => setIssueForm(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="issue-description">Description</Label>
              <Textarea
                id="issue-description"
                placeholder="Detailed description of the issue"
                value={issueForm.description}
                onChange={(e) => setIssueForm(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="issue-priority">Priority</Label>
                <Select value={issueForm.priority} onValueChange={(val) => setIssueForm(prev => ({ ...prev, priority: val as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">🟢 Low</SelectItem>
                    <SelectItem value="medium">🟡 Medium</SelectItem>
                    <SelectItem value="high">🟠 High</SelectItem>
                    <SelectItem value="critical">🔴 Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="issue-assignee">Assignee</Label>
                <Input
                  id="issue-assignee"
                  placeholder="Assignee name"
                  value={issueForm.assignee}
                  onChange={(e) => setIssueForm(prev => ({ ...prev, assignee: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="issue-labels">Labels</Label>
                <Input
                  id="issue-labels"
                  placeholder="bug, frontend, urgent"
                  value={issueForm.labels}
                  onChange={(e) => setIssueForm(prev => ({ ...prev, labels: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="issue-due-date">Due Date</Label>
                <div className="relative">
                  <Input
                    id="issue-due-date"
                    type="date"
                    value={issueForm.dueDate}
                    onChange={(e) => setIssueForm(prev => ({ ...prev, dueDate: e.target.value }))}
                    className="pr-8"
                  />
                  <Calendar className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="issue-company">Company</Label>
              <Select value={issueForm.companyId} onValueChange={(val) => setIssueForm(prev => ({ ...prev, companyId: val }))}>
                <SelectTrigger><SelectValue placeholder="Select a company" /></SelectTrigger>
                <SelectContent>
                  {(() => {
                    try {
                      const raw = localStorage.getItem("ensemble_companies");
                      const data: Record<string, any> = raw ? JSON.parse(raw) : {};
                      const companies = Object.values(data).map((d: any) => d.company).filter(Boolean);
                      if (companies.length === 0) {
                        return <SelectItem value="default_company">Default Company</SelectItem>;
                      }
                      return companies.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.emoji} {c.name}</SelectItem>
                      ));
                    } catch {
                      return <SelectItem value="default_company">Default Company</SelectItem>;
                    }
                  })()}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleIssueSubmit}>Create Issue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function NavButton({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all group ${
        active
          ? "bg-primary/10 text-primary shadow-sm"
          : "text-muted-foreground/60 hover:text-foreground hover:bg-white/5"
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? "text-primary" : "group-hover:text-primary transition-colors"}`} />
      <span>{label}</span>
    </button>
  );
}

export default Index;
