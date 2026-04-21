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
        <div className="flex-1 space-y-6 min-w-0">
          {activeSubTab === "dashboard" && (
            <>
              {/* 1. Greeting + Quick Actions */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{greeting}</h1>
                  <p className="text-sm text-muted-foreground mt-0.5 font-medium italic opacity-60">
                    {loading ? "Loading system status..." :
                     stats && stats.total_agents > 0
                       ? `${stats.total_agents} agents ready · ${stats.total_workflows} workflows configured`
                       : "System status: Ready — no agents or workflows configured yet"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="default" className="h-9 px-4 rounded-xl shadow-lg font-bold uppercase tracking-widest text-[9px]" onClick={() => handleAppOpen("workflows")}>
                    <Zap className="h-3.5 w-3.5 mr-2" />
                    Active Run
                  </Button>
                </div>
              </motion.div>

              {/* Sovereign Framework Definitions */}
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="p-6 rounded-[2rem] bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 shadow-2xl shadow-primary/5 space-y-6"
              >
                <div className="flex items-center gap-3">
                   <div className="h-10 w-10 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30 shadow-inner">
                      <Sparkles className="h-5 w-5 text-primary" />
                   </div>
                   <div>
                      <h2 className="text-lg font-bold tracking-tight">Sovereign Intelligence Framework</h2>
                      <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-0.5">Automated Power · Deterministic Trust</p>
                   </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                       <Workflow className="h-3.5 w-3.5 text-primary opacity-60" />
                       <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Autonomous Workflows</h3>
                    </div>
                    <p className="text-[10px] text-muted-foreground/80 leading-relaxed font-semibold pr-2">
                       Ensemble executes complex multi-agent SOPs on automated schedules, eliminating human error in your operations.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                       <Bot className="h-3.5 w-3.5 text-primary opacity-60" />
                       <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Specialist Agents</h3>
                    </div>
                    <p className="text-[10px] text-muted-foreground/80 leading-relaxed font-semibold pr-2">
                       Specialized LLM units equipped with deterministic tool-sets, operating within high-intelligence constraints.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                       <CheckCircle2 className="h-3.5 w-3.5 text-primary opacity-60" />
                       <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Audit Ledger</h3>
                    </div>
                    <p className="text-[10px] text-muted-foreground/80 leading-relaxed font-semibold pr-2">
                      An immutable record of every agent action and cost, ensuring 100% transparency and professional accountability.
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* 2. Stats Row */}
              {loading ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-4 animate-pulse">
                      <div className="h-9 w-9 rounded-lg bg-muted/50 mb-3" />
                      <div className="h-8 w-16 bg-muted/50 mb-1" />
                      <div className="h-4 w-24 bg-muted/30" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  {[
                    { label: "Active Workflows", value: stats?.active_workflows?.toString() || "0", change: stats?.total_workflows ? `${stats.total_workflows} total` : "None", trend: "up", icon: Workflow, color: "text-blue-400", bgColor: "bg-blue-400/10" },
                    { label: "Agents Running", value: stats?.agents_running?.toString() || "0", change: stats?.total_agents ? `${stats.total_agents} total` : "None", trend: "up", icon: Bot, color: "text-indigo-400", bgColor: "bg-indigo-400/10" },
                    { label: "Success Rate", value: `${stats?.success_rate || 0}%`, change: "Avg per run", trend: (stats?.success_rate || 0) >= 90 ? "up" : "down", icon: CheckCircle2, color: "text-emerald-400", bgColor: "bg-emerald-400/10" },
                    { label: "Scheduled Today", value: stats?.scheduled_count?.toString() || "0", change: "Jobs in queue", trend: "up", icon: Calendar, color: "text-purple-400", bgColor: "bg-purple-400/10" },
                    { label: "Tokens Today", value: formatTokens(stats?.tokens_today || 0), change: "Approx sum", trend: "up", icon: Coins, color: "text-amber-400", bgColor: "bg-amber-400/10" },
                    { label: "Monthly Cost", value: formatCost(stats?.monthly_cost || 0), change: "Total spend", trend: "up", icon: DollarSign, color: "text-rose-400", bgColor: "bg-rose-400/10" },
                  ].map((stat, i) => {
                    const Icon = stat.icon;
                    const trendColor = stat.trend === "up" ? "text-emerald-400/60" : "text-rose-400/60";

                    return (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.15 + i * 0.05 }}
                        className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-4 hover:border-border/60 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className={`h-8 w-8 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                            <Icon className={`h-4 w-4 ${stat.color}`} />
                          </div>
                          <div className={`text-[10px] font-bold uppercase tracking-tight ${trendColor}`}>
                            {stat.change}
                          </div>
                        </div>
                        <p className="text-xl font-bold text-foreground">{stat.value}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mt-1">{stat.label}</p>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* 3. Live Pipelines + Activity Feed */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left — Live Pipelines */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                  className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-5 flex flex-col"
                >
                  <div className="flex items-center justify-between mb-4 shrink-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Workflow className="h-4 w-4 text-primary" />
                      {pipelines.length > 0 ? "Live Pipelines" : "Pipelines"}
                    </div>
                    <Badge variant="secondary" className="font-normal">
                      {loading ? "..." : pipelines.filter(p => p.status === "running").length} Running
                    </Badge>
                  </div>
                  {loading ? (
                    <div className="space-y-3">
                      {[...Array(2)].map((_, i) => (
                        <div key={i} className="rounded-lg border border-border/30 bg-background/50 p-3 animate-pulse">
                          <div className="h-4 w-24 bg-muted/50 mb-2" />
                          <div className="h-1.5 w-full bg-muted/30 rounded mb-2" />
                          <div className="h-3 w-32 bg-muted/30" />
                        </div>
                      ))}
                    </div>
                  ) : pipelines.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Workflow className="h-8 w-8 text-muted-foreground/20 mb-2" />
                      <p className="text-sm text-muted-foreground">No active pipelines</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">Run a workflow to see live status here</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto space-y-3 activity-feed-scroll">
                      {pipelines.slice(0, 5).map((pipeline) => (
                        <button
                          key={pipeline.id}
                          onClick={() => handleAppOpen("workflows")}
                          className="w-full text-left rounded-lg border border-border/30 bg-background/50 p-3 hover:border-border/50 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-foreground">{pipeline.name}</span>
                            <Badge variant={pipeline.status === "running" ? "default" : "secondary"} className="text-[10px] uppercase tracking-wider">
                              {pipeline.status === "running" ? "Running" : pipeline.status === "completed" ? "Done ✓" : pipeline.status}
                            </Badge>
                          </div>
                          <Progress value={pipeline.status === "completed" ? 100 : pipeline.status === "running" ? 50 : 10} className="h-1.5 mb-2" />
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>Step {pipeline.current_step}/{pipeline.total_steps}</span>
                            <span>{pipeline.time}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>

                {/* Right — Recent Activity Feed */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.35 }}
                  className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-5 flex flex-col"
                >
                  <h2 className="text-sm font-semibold text-foreground mb-4 shrink-0">Recent Activity</h2>
                  {loading ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-start gap-3 rounded-md px-2 py-2 animate-pulse">
                          <div className="h-4 w-4 bg-muted/50 rounded mt-0.5" />
                          <div className="flex-1">
                            <div className="h-3 w-48 bg-muted/30 mb-1" />
                            <div className="h-2 w-16 bg-muted/20" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : activityFeed.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Clock className="h-8 w-8 text-muted-foreground/20 mb-2" />
                      <p className="text-sm text-muted-foreground">No activity recorded</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">Agent actions will appear here in real-time</p>
                    </div>
                  ) : (
                    <div className="overflow-y-auto space-y-1 activity-feed-scroll">
                      {activityFeed.map((item, idx) => {
                        const Icon = getActivityIcon(item.action_type);
                        const iconColor = getActivityIconColor(item.action_type);
                        const isError = item.action_type.includes("ERROR") || item.action_type.includes("FAIL");
                        return (
                          <div
                            key={idx}
                            className={`flex items-start gap-3 rounded-md px-2 py-2 text-sm transition-colors ${
                              isError ? "bg-rose-500/5" : "hover:bg-muted/50"
                            }`}
                          >
                            <div className={`mt-0.5 ${iconColor}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1">
                              <p className={`text-xs ${isError ? "text-rose-400" : "text-foreground/80"}`}>
                                {item.message}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "just now"}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              </div>

              {/* 4. Top Agents + Token Usage */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left — Top Agents leaderboard */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.4 }}
                  className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-5"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-foreground">Top Agents</h2>
                    <button
                      onClick={() => handleAppOpen("agents")}
                      className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
                    >
                      View All <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                  {loading ? (
                    <div className="space-y-1">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3 px-2 py-2 animate-pulse">
                          <div className="h-3 w-3 bg-muted/30" />
                          <div className="h-4 w-4 bg-muted/30" />
                          <div className="flex-1">
                            <div className="h-4 w-24 bg-muted/30 mb-1" />
                            <div className="h-2 w-16 bg-muted/20" />
                          </div>
                          <div className="h-4 w-8 bg-muted/30" />
                        </div>
                      ))}
                    </div>
                  ) : topAgents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Users className="h-8 w-8 text-muted-foreground/20 mb-2" />
                      <p className="text-sm text-muted-foreground">No agent runs recorded</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">Agent performance will rank here</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {topAgents.slice(0, 5).map((agent) => (
                        <div key={agent.agent_id} className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted/30 transition-colors">
                          <span className="text-xs w-4 text-right text-muted-foreground">{agent.rank}</span>
                          <span className="text-base">{agent.emoji}</span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">{agent.name}</p>
                            <p className="text-[10px] text-muted-foreground">{agent.category}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-foreground">{agent.runs}</p>
                            <p className="text-[10px] text-muted-foreground">runs</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>

                {/* Right — Token Usage Chart */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.45 }}
                  className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-5"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Token Usage</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Last 7 days</p>
                    </div>
                    {tokenUsage.length > 1 && (
                      <Badge variant="outline" className={tokenUsage[tokenUsage.length - 1].tokens > tokenUsage[0].tokens ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20 font-medium" : "bg-muted/10 text-muted-foreground border-border/20 font-medium"}>
                        <TrendingUp className="h-3 w-3 mr-1" />
                        {tokenUsage[tokenUsage.length - 1].tokens > tokenUsage[0].tokens ? "+" : ""}{((tokenUsage[tokenUsage.length - 1].tokens - tokenUsage[0].tokens) / Math.max(tokenUsage[0].tokens, 0.001) * 100).toFixed(0)}%
                      </Badge>
                    )}
                  </div>

                  {loading ? (
                    <div className="flex items-end gap-2 h-28 mb-3">
                      {[...Array(7)].map((_, i) => (
                        <div key={i} className="flex-1 flex flex-col justify-end h-full">
                          <div className="w-full rounded-t-md bg-muted/30 animate-pulse" style={{ height: `${20 + Math.random() * 60}%` }} />
                        </div>
                      ))}
                    </div>
                  ) : tokenUsage.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-28 text-center">
                      <Coins className="h-6 w-6 text-muted-foreground/20 mb-1" />
                      <p className="text-xs text-muted-foreground">No token usage data</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-end gap-2 h-28 mb-3">
                        {tokenUsage.map((item, i) => (
                          <div key={item.day + i} className="flex-1 flex flex-col justify-end h-full relative group">
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: `${Math.max((item.tokens / maxTokens) * 100, 2)}%` }}
                              transition={{ delay: 0.5 + i * 0.05, duration: 0.5, ease: "easeOut" }}
                              className="w-full rounded-t-md bg-primary/20 group-hover:bg-primary/40 transition-colors"
                            />
                            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                              {item.tokens}K
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between px-1 mb-4">
                        {tokenUsage.map((item, i) => (
                          <span key={item.day + i} className="text-[9px] text-muted-foreground flex-1 text-center">
                            {item.day}
                          </span>
                        ))}
                      </div>
                    </>
                  )}

                  {tokenUsage.length > 0 && (
                    <div className="flex items-center justify-between text-xs border-t border-border/30 pt-3">
                      <span className="text-foreground font-medium">Total: {formatTokens(totalTokens)} tokens</span>
                      <span className="text-muted-foreground">Avg: {formatTokens(avgTokens)}/day</span>
                    </div>
                  )}
                </motion.div>
              </div>

              {/* 5. Recent Workflows table */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.5 }}
                className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between bg-card/50">
                  <h2 className="text-sm font-semibold text-foreground">Recent Workflows</h2>
                  <button
                    onClick={() => handleAppOpen("workflows")}
                    className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
                  >
                    View All <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                {loading ? (
                  <div className="divide-y divide-border/20">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between px-5 py-3 animate-pulse">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-2 rounded-full bg-muted/30" />
                          <div>
                            <div className="h-4 w-32 bg-muted/30 mb-1" />
                            <div className="h-3 w-20 bg-muted/20" />
                          </div>
                        </div>
                        <div className="h-3 w-8 bg-muted/20" />
                      </div>
                    ))}
                  </div>
                ) : workflows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <GitBranch className="h-8 w-8 text-muted-foreground/20 mb-2" />
                    <p className="text-sm text-muted-foreground">No workflows configured</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">Create workflows in the Studio to see them here</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/20">
                    {workflows.slice(0, 5).map((wf) => (
                      <button
                        key={wf.id || wf.name}
                        onClick={() => handleAppOpen("workflows")}
                        className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors w-full text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`h-2 w-2 rounded-full ${wf.status === "active" ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
                          <div>
                            <p className="text-sm font-medium text-foreground">{wf.name}</p>
                            <p className="text-xs text-muted-foreground">{wf.agents} agents · {wf.runs} runs</p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">{wf.lastRun} ago</span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            </>
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
