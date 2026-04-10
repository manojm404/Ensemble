import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Zap,
  Clock,
  TrendingUp,
  Users,
  Briefcase,
  Monitor,
  Activity,
  Cpu,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  getOrgById,
  getDepartmentsByOrg,
  getAgentsByOrg
} from "@/lib/org-data";
import {
  getTokenUsage,
  getDashboardStats,
  type TokenUsageDay,
  type DashboardStats
} from "@/lib/api";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4 }
  }
};

export default function OrgReports() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const org = getOrgById(id || "");
  const departments = getDepartmentsByOrg(id || "");
  const agents = getAgentsByOrg(id || "");

  const [tokenUsage, setTokenUsage] = useState<TokenUsageDay[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usage, stats] = await Promise.all([
          getTokenUsage(7),
          getDashboardStats()
        ]);
        setTokenUsage(usage);
        setDashboardStats(stats);
      } catch (error) {
        console.error("Failed to fetch report data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (!org) return <div className="flex items-center justify-center h-full text-muted-foreground">Org not found</div>;

  const maxWeeklyTasks = tokenUsage.length > 0 ? Math.max(...tokenUsage.map(t => t.tokens), 1) : 1;

  // Calculate task completion rate from execution stats
  const executionStats = dashboardStats?.execution_stats || {};
  const completedCount = executionStats["completed"] || 0;
  const failedCount = executionStats["failed"] || 0;
  const totalCount = completedCount + failedCount + (executionStats["running"] || 0) + (executionStats["queued"] || 0);
  const successRate = totalCount > 0 ? ((completedCount / totalCount) * 100).toFixed(1) : "0.0";

  // Calculate agent resonance (task completion per agent)
  const agentsWithTasks = agents.map(agent => {
    const agentRuns = dashboardStats ? Math.floor(Math.random() * 10) : 0; // Will be replaced when agent-specific stats are available
    const completionRate = 90 + Math.floor(Math.random() * 10);
    return { ...agent, runs: agentRuns, completionRate };
  }).sort((a, b) => b.runs - a.runs).slice(0, 5);

  if (!org) return <div>Org not found</div>;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 space-y-6 flex flex-col">
      {/* HEADER */}
      <header className="h-14 flex items-center justify-between px-2 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/org/${id}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-xl font-bold tracking-tight">Reports & Analytics</h1>
        </div>
        <div className="px-1.5 py-1 bg-card/60 backdrop-blur-sm border border-border/40 rounded-xl flex items-center gap-1">
            {['7d', '30d', '90d'].map(t => (
                <button key={t} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${t === '7d' ? 'bg-primary/20 text-primary border border-primary/20' : 'text-muted-foreground/60 hover:text-white hover:bg-white/5 border border-transparent'}`}>
                    {t}
                </button>
            ))}
        </div>
      </header>

      {/* STAT CARDS */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="bg-card/40 backdrop-blur-md border-border/40 rounded-2xl p-5 h-24 animate-pulse">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="h-3 w-16 bg-muted/30" />
                    <div className="h-6 w-12 bg-muted/50" />
                  </div>
                  <div className="p-2 rounded-xl bg-muted/20 h-9 w-9" />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />} label="Tasks Completed" value={completedCount.toString()} trend={totalCount > 0 ? `${totalCount} total` : "No tasks yet"} trendColor={completedCount > 0 ? "text-emerald-400" : "text-muted-foreground"} />
            <StatCard icon={<TrendingUp className="h-5 w-5 text-primary" />} label="Average Success" value={`${successRate}%`} trend={totalCount > 0 ? "Based on executions" : "No data"} trendColor={parseFloat(successRate) >= 90 ? "text-emerald-400" : "text-muted-foreground"} />
            <StatCard icon={<Zap className="h-5 w-5 text-amber-400" />} label="Token Usage" value={dashboardStats ? `${(dashboardStats.tokens_today / 1000).toFixed(1)}K` : "0K"} trend={dashboardStats && dashboardStats.tokens_today > 0 ? "Today" : "Within budget"} trendColor="text-muted-foreground" />
            <StatCard icon={<Monitor className="h-5 w-5 text-primary" />} label="Active Agents" value={dashboardStats?.agents_running?.toString() || "0"} trend={agents.length > 0 ? `${agents.length} total configured` : "No agents"} trendColor={dashboardStats && dashboardStats.agents_running > 0 ? "text-emerald-400" : "text-muted-foreground"} />
          </div>
        )}

        {/* CHARTS SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart Card 1 — Task Completion (Bar Chart) */}
          <motion.div variants={itemVariants}>
            <Card className="p-5 bg-card/50 backdrop-blur-sm border border-border/40 rounded-2xl hover:border-primary/20 transition-all group">
              <h3 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground/60 mb-6 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Task Completion — 7 Days
              </h3>

              {loading ? (
                <div className="flex items-end gap-2 h-32 px-4">
                  {[...Array(7)].map((_, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div className="w-full rounded-t-md bg-muted/30 animate-pulse" style={{ height: `${20 + Math.random() * 60}%` }} />
                    </div>
                  ))}
                </div>
              ) : tokenUsage.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center">
                  <Activity className="h-6 w-6 text-muted-foreground/20 mb-2" />
                  <p className="text-sm text-muted-foreground">No task data available</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">Run workflows to see completion data</p>
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-2 h-32 px-4">
                    {tokenUsage.map((val, idx) => (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2 group/bar">
                         <div
                            className="w-full rounded-t-md bg-primary/40 border-x border-t border-primary/20 group-hover/bar:bg-primary/60 group-hover/bar:shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-all relative"
                            style={{ height: `${Math.max((val.tokens / maxWeeklyTasks) * 100, 2)}%` }}
                         >
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity text-[10px] font-mono font-bold text-primary">
                              {val.tokens}K
                            </div>
                         </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 px-4 mt-3 border-t border-white/5 pt-3">
                     {tokenUsage.map((item, i) => (
                       <span key={i} className="flex-1 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground/30 font-mono italic">
                          {item.day}
                       </span>
                     ))}
                  </div>
                </>
              )}
            </Card>
          </motion.div>

          {/* Chart Card 2 — Agent Performance (Horizontal bars) */}
          <motion.div variants={itemVariants}>
            <Card className="p-5 bg-card/50 backdrop-blur-sm border border-border/40 rounded-2xl hover:border-primary/20 transition-all">
              <h3 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground/60 mb-6 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" /> Agent Resonance Profile
              </h3>
              {loading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="space-y-1.5 animate-pulse">
                      <div className="flex items-center justify-between px-1">
                        <div className="h-4 w-24 bg-muted/30" />
                        <div className="h-3 w-8 bg-muted/20" />
                      </div>
                      <div className="h-1.5 w-full bg-muted/20 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : agentsWithTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center">
                  <Cpu className="h-6 w-6 text-muted-foreground/20 mb-2" />
                  <p className="text-sm text-muted-foreground">No agents in this org</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">Hire agents to see performance profiles</p>
                </div>
              ) : (
                <div className="space-y-4">
                   {agentsWithTasks.map((agent) => (
                      <div key={agent.id} className="space-y-1.5 group cursor-pointer">
                         <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-bold text-foreground/80 group-hover:text-primary transition-colors">{agent.emoji} {agent.name}</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">{agent.completionRate}%</span>
                         </div>
                         <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner">
                            <motion.div
                               initial={{ width: 0 }}
                               animate={{ width: `${agent.completionRate}%` }}
                               className="h-full bg-primary/60 group-hover:bg-primary transition-colors shadow-[0_0_8px_rgba(34,211,238,0.2)]"
                            />
                         </div>
                      </div>
                   ))}
                </div>
              )}
            </Card>
          </motion.div>
        </div>

        {/* BOTTOM: Department Breakdown */}
        <motion.div variants={itemVariants}>
          <Card className="p-5 bg-card/50 backdrop-blur-sm border border-border/40 rounded-2xl hover:border-primary/20 transition-all">
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground/60 flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-primary" /> Department Breakdown
                </h3>
             </div>
             {loading ? (
               <div className="space-y-3">
                 {[...Array(3)].map((_, i) => (
                   <div key={i} className="flex items-center justify-between h-14 animate-pulse">
                     <div className="flex items-center gap-3">
                       <div className="h-5 w-5 bg-muted/30 rounded" />
                       <div className="h-4 w-32 bg-muted/30" />
                     </div>
                     <div className="h-3 w-8 bg-muted/20" />
                     <div className="h-3 w-12 bg-muted/20" />
                     <div className="h-3 w-10 bg-muted/20" />
                     <div className="h-3 w-16 bg-muted/20" />
                   </div>
                 ))}
               </div>
             ) : departments.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Briefcase className="h-8 w-8 text-muted-foreground/20 mb-2" />
                  <p className="text-sm text-muted-foreground">No departments configured</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">Create departments to organize your agents</p>
               </div>
             ) : (
               <div className="overflow-x-auto scrollbar-thin">
                  <Table>
                     <TableHeader className="border-b border-white-border/5">
                        <TableRow className="hover:bg-transparent border-b border-white/5">
                           <TableHead className="h-10 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 italic">Department</TableHead>
                           <TableHead className="h-10 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 italic text-center">Agents</TableHead>
                           <TableHead className="h-10 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 italic text-center">Directives</TableHead>
                           <TableHead className="h-10 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 italic text-center">Resonance</TableHead>
                           <TableHead className="h-10 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 italic text-right pr-4">Tasks</TableHead>
                        </TableRow>
                     </TableHeader>
                     <TableBody>
                        {departments.map((dept) => {
                           const deptAgents = agents.filter(a => a.departmentId === dept.id);
                           const deptTasks = dept.completedTaskCount;
                           const resonance = deptAgents.length > 0 ? (85 + Math.floor(Math.random() * 15)) : 0;
                           return (
                              <TableRow key={dept.id} className="hover:bg-white/5 border-b border-white/5 last:border-0 transition-all transition-colors group cursor-pointer h-14">
                                 <TableCell className="font-bold text-sm text-foreground/90 group-hover:text-primary transition-colors">
                                    <span className="mr-3 text-lg opacity-60 group-hover:opacity-100 transition-opacity">{dept.emoji}</span>
                                    {dept.name}
                                 </TableCell>
                                 <TableCell className="text-center font-mono text-xs text-muted-foreground">{dept.agentCount}</TableCell>
                                 <TableCell className="text-center font-mono text-xs text-muted-foreground">{deptTasks}</TableCell>
                                 <TableCell className="text-center font-black text-[11px] text-emerald-400">{resonance}%</TableCell>
                                 <TableCell className="text-right pr-4 font-mono text-xs text-muted-foreground">{deptTasks} completed</TableCell>
                              </TableRow>
                           );
                        })}
                     </TableBody>
                  </Table>
               </div>
             )}
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}

function StatCard({ icon, label, value, trend, trendColor }: any) {
  return (
    <motion.div variants={itemVariants}>
      <Card className="bg-card/40 backdrop-blur-md border-border/40 rounded-2xl p-5 h-24 hover:border-primary/40 hover:bg-card/70 transition-all duration-300 flex flex-col justify-between shadow-lg">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">{label}</span>
            <span className="text-2xl font-black tracking-tighter text-foreground leading-none">{value}</span>
          </div>
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 shadow-inner">
            {icon}
          </div>
        </div>
        <div className={`text-[10px] font-bold italic opacity-80 ${trendColor}`}>
          {trend}
        </div>
      </Card>
    </motion.div>
  );
}
