import { useState } from "react";
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
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

/** MOCKED DATA */
const stats = [
  { label: "Active Workflows", value: "12", change: "+3", trend: "up" as const, icon: GitBranch, color: "text-primary", bgColor: "bg-primary/10" },
  { label: "Agents Running", value: "8", change: "+2", trend: "up" as const, icon: Bot, color: "text-emerald-400", bgColor: "bg-emerald-400/10" },
  { label: "Tokens Today", value: "48.2K", change: "+12K", trend: "up" as const, icon: Coins, color: "text-amber-400", bgColor: "bg-amber-400/10" },
  { label: "Monthly Cost", value: "$24.50", change: "+$3.20", trend: "down" as const, icon: DollarSign, color: "text-rose-400", bgColor: "bg-rose-400/10" },
];

const livePipelines = [
  { id: "1", name: "Code Review", step: 3, totalSteps: 4, agents: 4, status: "running" as const, time: "2m ago" },
  { id: "2", name: "Content Generator", step: 5, totalSteps: 5, agents: 3, status: "completed" as const, time: "8m ago" },
  { id: "3", name: "Bug Triage", step: 1, totalSteps: 3, agents: 2, status: "running" as const, time: "30s ago" },
];

const activityFeed = [
  { id: 1, icon: Play, iconColor: "text-primary", message: "Code Review pipeline started", time: "2m ago", isError: false },
  { id: 2, icon: CheckCircle2, iconColor: "text-emerald-400", message: "Content Generator completed successfully", time: "8m ago", isError: false },
  { id: 3, icon: AlertCircle, iconColor: "text-rose-400", message: "API Doc Writer failed at step 2", time: "12m ago", isError: true },
  { id: 4, icon: MessageSquare, iconColor: "text-amber-400", message: "New chat message in Design Channel", time: "25m ago", isError: false },
  { id: 5, icon: Plus, iconColor: "text-primary", message: "Data Analyzer workflow created", time: "1h ago", isError: false },
  { id: 6, icon: Clock, iconColor: "text-muted-foreground", message: "System maintenance scheduled", time: "2h ago", isError: false },
  { id: 7, icon: CheckCircle2, iconColor: "text-emerald-400", message: "Bug Triage completed successfully", time: "3h ago", isError: false },
];

const topAgents = [
  { rank: 1, emoji: "🤖", name: "CodeBot", category: "Programming", runs: 340 },
  { rank: 2, emoji: "📝", name: "DocWriter", category: "Writing", runs: 128 },
  { rank: 3, emoji: "🧪", name: "TestPilot", category: "Programming", runs: 89 },
  { rank: 4, emoji: "🐛", name: "Debugger", category: "Programming", runs: 56 },
  { rank: 5, emoji: "🎨", name: "PixelPro", category: "Design", runs: 34 },
];

const tokenUsage = [
  { day: "Mon", tokens: 32.4 },
  { day: "Tue", tokens: 41.2 },
  { day: "Wed", tokens: 58.1 },
  { day: "Thu", tokens: 45.8 },
  { day: "Fri", tokens: 62.3 },
  { day: "Sat", tokens: 28.9 },
  { day: "Sun", tokens: 48.2 },
];
const maxTokens = Math.max(...tokenUsage.map((t) => t.tokens));

const recentWorkflows = [
  { id: "1", name: "Code Review", agents: 4, runs: 128, status: "active", lastRun: "2m" },
  { id: "2", name: "Content Generator", agents: 3, runs: 56, status: "active", lastRun: "15m" },
  { id: "3", name: "Bug Triage", agents: 2, runs: 89, status: "idle", lastRun: "1h" },
  { id: "4", name: "API Doc Writer", agents: 3, runs: 34, status: "active", lastRun: "5m" },
  { id: "5", name: "Data Analyzer", agents: 5, runs: 22, status: "idle", lastRun: "3h" },
];

import InboxView from "./Inbox";

const Index = () => {
  const navigate = useNavigate();
  const { openApp } = useTabContext();
  const [activeSubTab, setActiveSubTab] = useState("dashboard");

  const handleAppOpen = (appId: string) => {
    const app = allApps.find((a) => a.id === appId);
    if (app) {
      openApp(app);
      navigate(app.url);
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="max-w-7xl mx-auto flex gap-8">
        
        {/* SIDEBAR NAVIGATION (Within Tab) */}
        <aside className="w-64 hidden xl:flex flex-col gap-8 shrink-0">
          <div className="space-y-4">
             <Button variant="default" className="w-full justify-start gap-3 h-10 px-4 rounded-xl shadow-lg border border-primary/20">
                <Plus className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-widest">New Issue</span>
             </Button>

              <div className="space-y-1">
                <NavButton 
                  icon={Inbox} 
                  label="Inbox" 
                  active={activeSubTab === "inbox"} 
                  onClick={() => setActiveSubTab("inbox")} 
                />
                <NavButton 
                  icon={LayoutGrid} 
                  label="Dashboard" 
                  active={activeSubTab === "dashboard"} 
                  onClick={() => setActiveSubTab("dashboard")} 
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
             <div className="flex items-center justify-between px-3">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/30">Your Projects</h3>
                <Plus className="h-3 w-3 text-muted-foreground/40 cursor-pointer hover:text-primary transition-colors" />
             </div>
             <div className="space-y-0.5">
                {[
                  { name: "Code Review Bot", color: "bg-emerald-400" },
                  { name: "Content Pipeline", color: "bg-blue-400" },
                  { name: "Bug Triage", color: "bg-orange-400" },
                  { name: "ORG", color: "bg-primary", isOrg: true },
                ].map(p => (
                   <button 
                    key={p.name} 
                    onClick={() => p.isOrg ? handleAppOpen("orgs") : {}}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-xs font-bold text-muted-foreground/60 hover:text-foreground hover:bg-white/5 transition-all group"
                   >
                      <div className={`h-2 w-2 rounded-full ${p.color}`} />
                      <span className="truncate">{p.name}</span>
                   </button>
                ))}
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
                  <p className="text-sm text-muted-foreground mt-0.5 font-medium italic opacity-60">System status: Optimizing agent throughput</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="default" className="h-9 px-4 rounded-xl shadow-lg font-bold uppercase tracking-widest text-[9px]" onClick={() => handleAppOpen("workflows")}>
                    <Zap className="h-3.5 w-3.5 mr-2" />
                    Active Run
                  </Button>
                </div>
              </motion.div>

              {/* 2. Stats Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map((stat, i) => {
                const Icon = stat.icon;
                const TrendIcon = stat.trend === "up" ? ArrowUpRight : ArrowDownRight;
                const trendColor = stat.label === "Monthly Cost"
                  ? stat.trend === "up" ? "text-rose-400" : "text-emerald-400"
                  : stat.trend === "up" ? "text-emerald-400" : "text-rose-400";
                
                return (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15 + i * 0.05 }}
                    className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-4 hover:border-border/60 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`h-9 w-9 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                        <Icon className={`h-4.5 w-4.5 ${stat.color}`} />
                      </div>
                      <div className={`flex items-center gap-0.5 text-xs font-medium ${trendColor}`}>
                        <TrendIcon className="h-3 w-3" />
                        {stat.change}
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                  </motion.div>
                );
              })}
            </div>

            {/* 3. Live Pipelines + Activity Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left — Live Pipelines */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
                className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Workflow className="h-4 w-4 text-primary" />
                    Live Pipelines
                  </div>
                  <Badge variant="secondary" className="font-normal">
                    {livePipelines.filter(p => p.status === "running").length} Running
                  </Badge>
                </div>
                <div className="space-y-3">
                  {livePipelines.map((pipeline) => (
                    <button
                      key={pipeline.id}
                      onClick={() => handleAppOpen("workflows")}
                      className="w-full text-left rounded-lg border border-border/30 bg-background/50 p-3 hover:border-border/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground">{pipeline.name}</span>
                        <Badge variant={pipeline.status === "running" ? "default" : "secondary"} className="text-[10px] uppercase tracking-wider">
                          {pipeline.status === "running" ? "Running" : "Done ✓"}
                        </Badge>
                      </div>
                      <Progress value={(pipeline.step / pipeline.totalSteps) * 100} className="h-1.5 mb-2" />
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Step {pipeline.step}/{pipeline.totalSteps} · {pipeline.agents} agents</span>
                        <span>{pipeline.time}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>

              {/* Right — Recent Activity Feed */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.35 }}
                className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-5"
              >
                <h2 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h2>
                <div className="max-h-[240px] overflow-y-auto pr-1 space-y-1">
                  {activityFeed.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 rounded-md px-2 py-2 text-sm transition-colors ${
                          item.isError ? "bg-rose-500/5" : "hover:bg-muted/50"
                        }`}
                      >
                        <div className={`mt-0.5 ${item.iconColor}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <p className={`text-xs ${item.isError ? "text-rose-400" : "text-foreground/80"}`}>
                            {item.message}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{item.time}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                <div className="space-y-1">
                  {topAgents.map((agent) => (
                    <div key={agent.name} className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted/30 transition-colors">
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
                  <Badge variant="outline" className="bg-emerald-400/10 text-emerald-400 border-emerald-400/20 font-medium">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    +18%
                  </Badge>
                </div>
                
                <div className="flex items-end gap-2 h-28 mb-3">
                  {tokenUsage.map((item, i) => (
                    <div key={item.day} className="flex-1 flex flex-col justify-end h-full relative group">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${(item.tokens / maxTokens) * 100}%` }}
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
                  {tokenUsage.map((item) => (
                    <span key={item.day} className="text-[9px] text-muted-foreground flex-1 text-center">
                      {item.day}
                    </span>
                  ))}
                </div>
                
                <div className="flex items-center justify-between text-xs border-t border-border/30 pt-3">
                  <span className="text-foreground font-medium">Total: 316.9K tokens</span>
                  <span className="text-muted-foreground">Avg: 45.3K/day</span>
                </div>
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
              <div className="divide-y divide-border/20">
                {recentWorkflows.map((wf) => (
                  <button
                    key={wf.name}
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
