import { useParams, useNavigate } from "react-router-dom";
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
  Search,
  MoreVertical,
  Activity,
  Cpu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  if (!org) return <div>Org not found</div>;

  const mockWeeklyTasks = [12, 18, 15, 24, 21, 14, 19];
  const maxWeeklyTasks = Math.max(...mockWeeklyTasks);

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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />} label="Tasks Completed" value="312" trend="+12.4%" trendColor="text-emerald-400" />
          <StatCard icon={<TrendingUp className="h-5 w-5 text-primary" />} label="Average Success" value="94.2%" trend="+0.8%" trendColor="text-emerald-400" />
          <StatCard icon={<Zap className="h-5 w-5 text-amber-400" />} label="Token Usage" value="48.2K" trend="Within budget" trendColor="text-muted-foreground" />
          <StatCard icon={<Monitor className="h-5 w-5 text-primary" />} label="Agent Hours" value="1,240" trend="+42h this week" trendColor="text-emerald-400" />
        </div>

        {/* CHARTS SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart Card 1 — Task Completion (Bar Chart) */}
          <motion.div variants={itemVariants}>
            <Card className="p-5 bg-card/50 backdrop-blur-sm border border-border/40 rounded-2xl hover:border-primary/20 transition-all group">
              <h3 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground/60 mb-6 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Task Completion — 7 Days
              </h3>
              
              <div className="flex items-end gap-2 h-32 px-4">
                {mockWeeklyTasks.map((val, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 group/bar">
                     <div 
                        className="w-full rounded-t-md bg-primary/40 border-x border-t border-primary/20 group-hover/bar:bg-primary/60 group-hover/bar:shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-all relative"
                        style={{ height: `${(val / maxWeeklyTasks) * 100}%` }}
                     >
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity text-[10px] font-mono font-bold text-primary">
                          {val}
                        </div>
                     </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 px-4 mt-3 border-t border-white/5 pt-3">
                 {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                   <span key={day} className="flex-1 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground/30 font-mono italic">
                      {day}
                   </span>
                 ))}
              </div>
            </Card>
          </motion.div>

          {/* Chart Card 2 — Agent Performance (Horizontal bars) */}
          <motion.div variants={itemVariants}>
            <Card className="p-5 bg-card/50 backdrop-blur-sm border border-border/40 rounded-2xl hover:border-primary/20 transition-all">
              <h3 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground/60 mb-6 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" /> Agent Resonance Profile
              </h3>
              <div className="space-y-4">
                 {agents.sort((a,b) => b.tasksCompleted - a.tasksCompleted).slice(0, 5).map((agent) => (
                    <div key={agent.id} className="space-y-1.5 group cursor-pointer">
                       <div className="flex items-center justify-between px-1">
                          <span className="text-xs font-bold text-foreground/80 group-hover:text-primary transition-colors">{agent.emoji} {agent.name}</span>
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">{90 + Math.floor(Math.random() * 10)}%</span>
                       </div>
                       <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner">
                          <motion.div 
                             initial={{ width: 0 }}
                             animate={{ width: `${90 + Math.floor(Math.random() * 10)}%` }}
                             className="h-full bg-primary/60 group-hover:bg-primary transition-colors shadow-[0_0_8px_rgba(34,211,238,0.2)]"
                          />
                       </div>
                    </div>
                 ))}
              </div>
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
             <div className="overflow-x-auto scrollbar-thin">
                <Table>
                   <TableHeader className="border-b border-white-border/5">
                      <TableRow className="hover:bg-transparent border-b border-white/5">
                         <TableHead className="h-10 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 italic">Department</TableHead>
                         <TableHead className="h-10 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 italic text-center">Agents</TableHead>
                         <TableHead className="h-10 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 italic text-center">Directives</TableHead>
                         <TableHead className="h-10 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 italic text-center">Resonance</TableHead>
                         <TableHead className="h-10 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 italic text-right pr-4">Intel Spend</TableHead>
                      </TableRow>
                   </TableHeader>
                   <TableBody>
                      {departments.map((dept) => (
                         <TableRow key={dept.id} className="hover:bg-white/5 border-b border-white/5 last:border-0 transition-all transition-colors group cursor-pointer h-14">
                            <TableCell className="font-bold text-sm text-foreground/90 group-hover:text-primary transition-colors">
                               <span className="mr-3 text-lg opacity-60 group-hover:opacity-100 transition-opacity">{dept.emoji}</span>
                               {dept.name}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs text-muted-foreground">{dept.agentCount}</TableCell>
                            <TableCell className="text-center font-mono text-xs text-muted-foreground">{dept.completedTaskCount}</TableCell>
                            <TableCell className="text-center font-black text-[11px] text-emerald-400">92%</TableCell>
                            <TableCell className="text-right pr-4 font-mono text-xs text-muted-foreground">${(Math.random() * 100).toFixed(2)}</TableCell>
                         </TableRow>
                      ))}
                   </TableBody>
                </Table>
             </div>
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
