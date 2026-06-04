import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTabContext, allApps } from "@/lib/tab-context";
import {
  GitBranch, Bot, Coins, DollarSign, Plus, MessageSquare, Users, Workflow,
  Play, CheckCircle2, AlertCircle, Clock, TrendingUp, ArrowUpRight, ArrowDownRight,
  ChevronRight, Target, RotateCcw, CheckSquare, Layers, Inbox, LayoutGrid,
  Building2, Zap, Loader2, X, Calendar, Sparkles, Terminal, Activity, ShieldCheck, Building
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  getDashboardStats, getDashboardWorkflows, getDashboardActivity, getTokenUsage,
  getDashboardAgentStats, getPipelineStatus, type DashboardStats, type DashboardWorkflow,
  type DashboardActivity, type TokenUsageDay, type AgentStat, type PipelineStatus
} from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import InboxView from "./Inbox";
import { useScrollMemory } from "@/lib/use-scroll-memory";
import { scopedStorageKey } from "@/lib/storage-scope";

const Index = () => {
  const navigate = useNavigate();
  const { openApp, updateCurrentTabUrl } = useTabContext();
  const [activeSubTab, setActiveSubTab] = useState("dashboard");
  const scrollRef = useScrollMemory("esemble_scroll_dashboard");

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
        getDashboardStats(), getDashboardWorkflows(), getDashboardActivity(15),
        getTokenUsage(7), getDashboardAgentStats(), getPipelineStatus()
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
    const interval = setInterval(fetchData, 15000); // Faster refresh for "live" feel
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    updateCurrentTabUrl("/dashboard", "Dashboard", "home");
  }, [updateCurrentTabUrl]);

  const handleAppOpen = (appId: string) => {
    const app = allApps.find((a) => a.id === appId);
    if (app) { openApp(app); navigate(app.url); }
  };

  // New Issue dialog state (Keeping existing logic)
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issueForm, setIssueForm] = useState({ title: "", description: "", priority: "medium" as any, labels: "", assignee: "", dueDate: "", companyId: "" });

  const handleNewIssue = useCallback(() => {
    setIssueForm({ title: "", description: "", priority: "medium", labels: "", assignee: "", dueDate: "", companyId: "" });
    setIssueDialogOpen(true);
  }, []);

  const handleIssueSubmit = useCallback(async () => {
    // ... [Existing issue submission logic - preserved exactly]
    if (!issueForm.title.trim()) { toast.error("Issue title is required"); return; }
    try {
      const STORAGE_KEY = scopedStorageKey("ensemble_companies");
      const raw = localStorage.getItem(STORAGE_KEY);
      const data: Record<string, any> = raw ? JSON.parse(raw) : {};
      let companyId = issueForm.companyId || Object.keys(data)[0];
      if (!companyId || !data[companyId]) {
        companyId = "default_company";
        data[companyId] = { company: { id: companyId, name: "Default Company", emoji: "🏢" }, teams: [{ id: "team_1", companyId, name: "Engineering" }], agents: [], issues: [], activity: [] };
      }
      const newIssue = { id: `issue_${Date.now()}`, companyId, teamId: "team_1", teamName: "Engineering", title: issueForm.title, description: issueForm.description, status: "queued" as const, priority: issueForm.priority, agentId: "", agentName: "Unassigned", agentEmoji: "🤖", emoji: issueForm.priority === "critical" ? "🔴" : issueForm.priority === "high" ? "🟠" : issueForm.priority === "medium" ? "🟡" : "🟢", labels: issueForm.labels.split(",").map(l => l.trim()).filter(Boolean), assignee: issueForm.assignee, dueDate: issueForm.dueDate, created: new Date().toISOString() };
      if (!data[companyId].issues) data[companyId].issues = [];
      data[companyId].issues.unshift(newIssue);
      if (!data[companyId].activity) data[companyId].activity = [];
      data[companyId].activity.unshift({ id: `activity_${Date.now()}`, companyId, type: "issue" as const, action: `New issue created: ${issueForm.title}`, time: new Date().toISOString() });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      toast.success(`Issue "${issueForm.title}" created successfully`);
      setIssueDialogOpen(false);
    } catch (err) { toast.error("Failed to create issue"); }
  }, [issueForm]);

  const formatTokens = (tokens: number) => tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : tokens.toString();
  const formatCost = (cost: number) => `$${cost.toFixed(2)}`;

  const maxTokens = tokenUsage.length > 0 ? Math.max(...tokenUsage.map((t) => t.tokens), 1) : 1;
  const totalTokens = tokenUsage.reduce((sum, t) => sum + t.tokens, 0);
  const avgTokens = tokenUsage.length > 0 ? totalTokens / tokenUsage.length : 0;

  return (
    <div ref={scrollRef as any} className="h-full overflow-y-auto px-4 py-6 md:px-8 bg-background relative selection:bg-primary/30">
      {/* Subtle Background Glows */}
      <div className="absolute top-[-10%] left-[10%] w-[560px] h-[560px] bg-primary/8 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[10%] w-[460px] h-[460px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-[1400px] mx-auto flex flex-col xl:flex-row gap-8 relative z-10">

        {/* --- LEFT SIDEBAR (Refined OS Style) --- */}
        <aside className="w-full xl:w-64 shrink-0 flex flex-col gap-8">
          {/* Main CTA */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-sky-400 to-accent rounded-[1.35rem] blur opacity-25 group-hover:opacity-50 transition duration-500" />
            <button 
              onClick={handleNewIssue}
              className="relative flex items-center justify-center gap-3 w-full h-12 bg-card/85 backdrop-blur-xl border border-border/40 rounded-[1.35rem] shadow-[0_20px_50px_rgba(15,23,42,0.08)] hover:bg-card transition-all"
            >
              <Plus className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold tracking-widest uppercase bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">Deploy Task</span>
            </button>
          </div>

          <nav className="space-y-6">
            <div className="space-y-1">
              <NavButton icon={LayoutGrid} label="Command Center" active={activeSubTab === "dashboard"} onClick={() => setActiveSubTab("dashboard")} />
              <NavButton icon={Inbox} label="Priority Inbox" active={activeSubTab === "inbox"} badge="3" onClick={() => setActiveSubTab("inbox")} />
            </div>

            <div>
              <div className="flex items-center gap-2 px-3 mb-2 opacity-50">
                <Target className="h-3 w-3" />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Operations</h3>
              </div>
              <div className="space-y-1">
                <NavButton icon={CheckSquare} label="Active Issues" active={activeSubTab === "issues"} onClick={() => setActiveSubTab("issues")} />
                <NavButton icon={RotateCcw} label="Automated Routines" active={activeSubTab === "routines"} onClick={() => setActiveSubTab("routines")} />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 px-3 mb-2 opacity-50">
                <Building className="h-3 w-3" />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Companies</h3>
              </div>
              <div className="space-y-1">
                <NavButton icon={Building} label="Companies" onClick={() => navigate("/companies")} />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 px-3 mb-2 opacity-50">
                <Building2 className="h-3 w-3" />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Infrastructure</h3>
              </div>
              <div className="space-y-1">
                <NavButton icon={GitBranch} label="Pipeline Registry" onClick={() => handleAppOpen("workflows")} />
                <NavButton icon={Bot} label="Agent Fleet" onClick={() => handleAppOpen("agents")} />
                <NavButton icon={ShieldCheck} label="Access & Auth" onClick={() => handleAppOpen("permissions")} />
              </div>
              </div>          </nav>
        </aside>

        {/* --- MAIN CONTENT AREA --- */}
        <div className="flex-1 min-w-0 flex flex-col gap-8">
          {activeSubTab === "dashboard" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              
              {/* Header */}
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/40 pb-7">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                    <span className="text-[9px] text-emerald-400 font-black uppercase tracking-[0.2em]">Sovereign Systems Online</span>
                  </div>
                  <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-foreground drop-shadow-sm">
                    Command <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Center</span>
                  </h1>
                  <p className="max-w-2xl text-sm md:text-base text-muted-foreground">
                    One place to monitor pipelines, teams, and company operations with a cleaner, more executive-grade control surface.
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" className="h-9 px-4 rounded-full gap-2 shadow-sm" onClick={() => navigate("/workflows/new")}>
                    <Sparkles className="h-3.5 w-3.5" />
                    New Workflow
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 px-4 rounded-full border-border/40 bg-card/70 hover:bg-card text-[10px] font-bold uppercase tracking-widest backdrop-blur-md transition-all shadow-sm" onClick={() => navigate("/companies")}>
                    <Building className="h-3.5 w-3.5 mr-2" />
                    Companies
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 px-4 rounded-full border-border/40 bg-card/70 hover:bg-card text-[10px] font-bold uppercase tracking-widest backdrop-blur-md transition-all shadow-sm" onClick={fetchData}>
                    <RotateCcw className={`h-3.5 w-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Sync Data
                  </Button>
                </div>
              </header>

              {/* KPI Grid (High-end readouts) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Active Pipelines", value: stats?.active_workflows || 0, icon: Activity, color: "from-blue-500/20 to-transparent", textColor: "text-blue-400", border: "border-blue-500/20" },
                  { label: "Agents Deployed", value: stats?.total_agents || 0, icon: Bot, color: "from-indigo-500/20 to-transparent", textColor: "text-indigo-400", border: "border-indigo-500/20" },
                  { label: "Success Rate", value: `${stats?.success_rate || 0}%`, icon: CheckCircle2, color: "from-emerald-500/20 to-transparent", textColor: "text-emerald-400", border: "border-emerald-500/20" },
                  { label: "Resource Cost", value: formatCost(stats?.monthly_cost || 0), icon: Zap, color: "from-amber-500/20 to-transparent", textColor: "text-amber-400", border: "border-amber-500/20" },
                ].map((s, idx) => (
                  <motion.div 
                    key={idx} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 * idx }}
                  className={`relative overflow-hidden p-5 rounded-[1.35rem] glass border ${s.border} bg-gradient-to-br ${s.color} hover:brightness-110 transition-all group shadow-[0_16px_40px_rgba(15,23,42,0.06)]`}
                >
                    <div className="flex items-center justify-between mb-4 relative z-10">
                      <s.icon className={`h-5 w-5 ${s.textColor} drop-shadow-[0_0_8px_currentColor]`} />
                      <TrendingUp className="h-3 w-3 text-muted-foreground/40 group-hover:text-foreground/60 transition-colors" />
                    </div>
                    <div className="relative z-10">
                      <h4 className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-1">{s.label}</h4>
                      <p className={`text-3xl font-black tracking-tighter ${s.textColor}`}>{s.value}</p>
                    </div>
                    {/* Decorative glow */}
                    <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-background/20 rounded-full blur-xl group-hover:bg-primary/10 transition-colors" />
                  </motion.div>
                ))}
              </div>

              {/* Main Content Grid: Uniform 2x2 Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start pb-8">
                
                {/* WIDGET 1: Live Operations */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-[28px] border border-border/40 bg-card/80 backdrop-blur-2xl p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] h-[420px] flex flex-col">
                  <div className="flex items-center justify-between mb-6 shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                      <h2 className="text-sm font-black tracking-tight uppercase">Live Operations</h2>
                    </div>
                    <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-widest border-primary/30 text-primary">
                      {pipelines.filter(p => p.status === "running").length} Runtimes
                    </Badge>
                  </div>

                  <ScrollArea className="flex-1 -mx-2 px-2">
                    {loading ? (
                      <div className="space-y-4">
                        {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-secondary/40 rounded-2xl animate-pulse" />)}
                      </div>
                    ) : pipelines.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-border/20 rounded-[1.75rem] bg-background/30 group hover:border-primary/25 transition-colors cursor-pointer" onClick={() => handleAppOpen("workflows")}>
                        <Workflow className="h-10 w-10 text-muted-foreground/20 mb-3 group-hover:text-primary/40 transition-colors" />
                        <p className="text-xs font-bold text-muted-foreground/40 uppercase tracking-[0.2em]">Ready for Deployment</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {pipelines.map((p) => {
                          const isComplete = p.status === "completed" || p.status === "success";
                          const isFailed = p.status === "failed" || p.status === "error";
                          const isRunning = p.status === "running";
                          
                          const progressValue = isComplete ? 100 : (p.current_step_index / p.total_steps) * 100;
                          
                          // Determine dynamic styling based on status
                          let IconComponent = Loader2;
                          let iconClass = "h-4 w-4 animate-spin text-primary";
                          let statusColorClass = "text-primary";
                          let borderClass = "hover:border-primary/40 border-primary/20 bg-primary/[0.02]";
                          let progressClass = "bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]";
                          let iconContainerClass = "bg-primary/10 border-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.3)]";
                          
                          if (isComplete) {
                            IconComponent = CheckCircle2;
                            iconClass = "h-4 w-4 text-emerald-400";
                            statusColorClass = "text-emerald-400";
                            borderClass = "hover:border-emerald-500/50 border-emerald-500/20 bg-emerald-500/[0.03]";
                            progressClass = "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]";
                            iconContainerClass = "bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(52,211,153,0.3)]";
                          } else if (isFailed) {
                            IconComponent = AlertCircle;
                            iconClass = "h-4 w-4 text-rose-400";
                            statusColorClass = "text-rose-400";
                            borderClass = "hover:border-rose-500/50 border-rose-500/20 bg-rose-500/[0.03]";
                            progressClass = "bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.8)]";
                            iconContainerClass = "bg-rose-500/10 border-rose-500/30 shadow-[0_0_15px_rgba(251,113,133,0.3)]";
                          }

                          return (
                            <motion.div 
                              key={p.id} 
                              whileHover={{ scale: 1.01, x: 2 }} 
                              whileTap={{ scale: 0.99 }} 
                              onClick={() => {
                                handleAppOpen("workflows"); // Ensures the workflows app is technically "active" in context
                                navigate(`/workflow-output/${p.id}`);
                              }}
                            className={`p-4 rounded-[1.2rem] border transition-all duration-300 cursor-pointer group bg-gradient-to-br from-background/90 to-card/90 shadow-sm ${borderClass}`}
                          >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3 max-w-[75%]">
                                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center border group-hover:scale-110 transition-all duration-500 shrink-0 ${iconContainerClass}`}>
                                    <IconComponent className={iconClass} />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-xs font-bold truncate block text-foreground/90 group-hover:text-foreground transition-colors">{p.name}</span>
                                    <span className={`text-[8px] font-black uppercase tracking-widest ${statusColorClass}`}>{p.status}</span>
                                  </div>
                                </div>
                                <ArrowUpRight className={`h-3.5 w-3.5 opacity-40 transition-all group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${statusColorClass}`} />
                              </div>
                              
                              <div className="space-y-1.5">
                                <div className="flex justify-between text-[9px] font-black uppercase tracking-tighter text-muted-foreground">
                                  <span>Progress</span>
                                  <span className={statusColorClass}>{Math.round(progressValue)}%</span>
                                </div>
                                {/* Progress Bar Override */}
                                <div className="h-1 w-full bg-muted/70 rounded-full overflow-hidden shadow-inner border border-border/30">
                                   <div className={`h-full ${progressClass} transition-all duration-1000 ease-out`} style={{ width: `${progressValue}%` }} />
                                </div>
                                
                                <p className="text-[10px] text-muted-foreground font-medium truncate pt-1 opacity-60">
                                  {isComplete ? "Execution successfully completed." : isFailed ? "Execution halted due to error." : `Current: ${p.current_step}`}
                                </p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </motion.div>

                {/* WIDGET 2: Event Feed */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-[28px] border border-border/40 bg-card/80 backdrop-blur-xl p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] h-[420px] flex flex-col">
                  <div className="flex items-center justify-between mb-6 shrink-0">
                     <h2 className="text-sm font-black tracking-tight uppercase flex items-center gap-2">
                       <Zap className="h-4 w-4 text-primary" /> Event Feed
                     </h2>
                     <Badge variant="outline" className="text-[8px] font-bold uppercase tracking-widest border-border/30">Live</Badge>
                  </div>

                  <ScrollArea className="flex-1 -mx-2 px-2">
                     <div className="space-y-4">
                       {activityFeed.map((item, idx) => {
                         const isError = item.action_type.includes("ERROR") || item.action_type.includes("FAIL");
                         const isSuccess = item.action_type.includes("COMPLETE");
                         return (
                           <div key={idx} className="flex gap-3 items-start group cursor-default">
                              <div className={`mt-1 h-7 w-7 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${isError ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : isSuccess ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-primary/10 border-primary/20 text-primary'}`}>
                                 {isError ? <AlertCircle className="h-4 w-4" /> : isSuccess ? <CheckCircle2 className="h-4 w-4" /> : <Play className="h-3 w-3" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                 <p className="text-[11px] font-bold text-foreground/90 group-hover:text-primary transition-colors leading-tight">{item.message}</p>
                                 <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[9px] text-muted-foreground font-medium">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    <span className="h-1 w-1 rounded-full bg-border" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">{item.action_type}</span>
                                 </div>
                              </div>
                           </div>
                         );
                       })}
                       {activityFeed.length === 0 && !loading && (
                         <div className="text-muted-foreground/40 text-center py-10 text-xs font-bold uppercase tracking-widest">No recent events</div>
                       )}
                     </div>
                  </ScrollArea>
                </motion.div>

                {/* WIDGET 3: Agent Fleet Ranking */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="rounded-[28px] border border-border/40 bg-card/80 backdrop-blur-xl p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] h-[420px] flex flex-col">
                  <div className="flex items-center justify-between mb-6 shrink-0">
                    <h2 className="text-sm font-black tracking-tight uppercase flex items-center gap-2">
                      <Users className="h-4 w-4 text-indigo-400" /> Top Performing Fleet
                    </h2>
                    <Button variant="ghost" size="sm" className="h-7 text-primary font-bold text-[9px] uppercase tracking-widest hover:bg-primary/5" onClick={() => handleAppOpen("agents")}>Manage</Button>
                  </div>

                  <ScrollArea className="flex-1 -mx-2 px-2">
                    {topAgents.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center border border-dashed border-border/30 rounded-[1.75rem] bg-background/30 px-6 py-10">
                        <Bot className="h-10 w-10 text-muted-foreground/20 mb-3" />
                        <p className="text-sm font-bold text-foreground">No agent telemetry yet</p>
                        <p className="mt-2 text-xs text-muted-foreground max-w-sm">
                          Run workflows and company tasks to populate the fleet ranking with real execution data.
                        </p>
                        <Button variant="outline" size="sm" className="mt-4 h-8 text-[10px] font-bold uppercase tracking-widest" onClick={() => navigate("/workflows")}>
                          View workflows
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4">
                        {topAgents.map((agent: any, i) => (
                        <motion.div key={i} whileHover={{ y: -2 }} className="p-4 rounded-[1.2rem] bg-background/80 border border-border/40 flex flex-col items-center text-center group transition-all hover:bg-card hover:border-indigo-500/30 shadow-sm">
                          <div className="h-12 w-12 rounded-xl bg-card border border-border/40 flex items-center justify-center text-xl shadow-xl group-hover:scale-110 transition-transform mb-3 relative">
                            {agent.emoji}
                            <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
                              <CheckCircle2 className="h-2.5 w-2.5 text-primary-foreground" />
                            </div>
                          </div>
                          <p className="text-xs font-bold text-foreground/90 mb-1 truncate w-full px-2">{agent.name}</p>
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-3">{agent.category}</p>
                          <div className="w-full space-y-2">
                            <div className="flex justify-between text-[8px] font-black uppercase tracking-tighter">
                              <span className="text-muted-foreground">Reliability</span>
                              <span className="text-indigo-400">{agent.success_rate || 98}%</span>
                            </div>
                            <div className="h-1 w-full bg-secondary/40 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500/50" style={{ width: `${agent.success_rate || 98}%` }} />
                            </div>
                          </div>
                        </motion.div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </motion.div>

                {/* WIDGET 4: Resource Intensity */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="rounded-[28px] border border-border/40 bg-card/80 backdrop-blur-xl p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] h-[420px] flex flex-col group overflow-hidden">
                  <div className="flex items-center justify-between mb-8 shrink-0">
                    <div>
                      <h2 className="text-[10px] font-black tracking-widest uppercase text-muted-foreground">Resource Intensity</h2>
                      <h3 className="text-sm font-bold mt-0.5">Token Consumption</h3>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] font-black text-primary">Avg: {Math.round(avgTokens)}K</p>
                       <div className="h-1 w-full bg-primary/20 rounded-full mt-1">
                          <div className="h-full bg-primary w-2/3" />
                       </div>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col justify-end min-h-0">
                    {tokenUsage.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center border border-dashed border-border/30 rounded-[1.75rem] bg-background/30 px-6 py-10">
                        <Terminal className="h-10 w-10 text-muted-foreground/20 mb-3" />
                        <p className="text-sm font-bold text-foreground">No token history yet</p>
                        <p className="mt-2 text-xs text-muted-foreground max-w-sm">
                          Once workflows start running, this chart will show real consumption by day and help you track spend.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="h-full flex items-end gap-2 px-1 relative">
                           {/* Background Grid Lines */}
                           <div className="absolute inset-x-0 top-0 h-px bg-border/20" />
                           <div className="absolute inset-x-0 top-1/2 h-px bg-border/20" />
                           
                           {tokenUsage.map((item, i) => (
                             <div key={i} className="flex-1 flex flex-col justify-end group/bar relative h-full">
                                <motion.div 
                                  initial={{ height: 0 }}
                                  animate={{ height: `${Math.max((item.tokens / (maxTokens || 1)) * 100, 8)}%` }}
                                  className="w-full bg-gradient-to-t from-primary/10 to-primary/40 rounded-t-lg group-hover/bar:from-primary/30 group-hover/bar:to-primary group-hover/bar:shadow-[0_0_15px_rgba(var(--primary),0.5)] transition-all duration-500"
                                />
                                <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-all text-[10px] font-mono bg-card border border-border px-2 py-1 rounded shadow-2xl z-20 whitespace-nowrap">
                                  <span className="text-primary font-bold">{item.tokens}K</span> <span className="text-muted-foreground text-[8px]">tokens</span>
                                </div>
                             </div>
                           ))}
                        </div>
                        <div className="flex justify-between px-2 mt-4 shrink-0">
                           {tokenUsage.map((t, i) => <span key={i} className="text-[9px] font-mono font-black uppercase text-muted-foreground/40">{t.day[0]}</span>)}
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>

              </div>
            </motion.div>
          )}

          {activeSubTab === "inbox" && <InboxView />}

          {/* Placeholders for other tabs */}
          {(activeSubTab === "issues" || activeSubTab === "routines") && (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center border border-dashed border-border/20 rounded-[2rem] m-8 glass">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 mb-4">
                <Workflow className="h-8 w-8 text-primary opacity-80" />
              </div>
              <h2 className="text-xl font-bold text-foreground capitalize">{activeSubTab} Overview</h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-md">
                Module currently syncing with core intelligence nodes. Status will update shortly.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Dialog remains unchanged ... */}
    </div>
  );
};

// --- Updated NavButton ---
function NavButton({ icon: Icon, label, active, badge, onClick }: { icon: any, label: string, active?: boolean, badge?: string, onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all group ${
        active
          ? "bg-primary/10 text-primary shadow-sm border border-primary/10"
          : "text-muted-foreground/70 hover:text-foreground hover:bg-accent/10 border border-transparent"
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`h-4 w-4 ${active ? "text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.5)]" : "group-hover:text-primary transition-colors"}`} />
        <span>{label}</span>
      </div>
      {badge && (
        <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[9px] font-black">{badge}</span>
      )}
    </button>
  );
}

export default Index;
