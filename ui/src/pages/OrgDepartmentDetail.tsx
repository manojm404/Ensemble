import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  ArrowLeft, 
  Plus, 
  Edit3, 
  Users, 
  Cpu, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  MoreVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  getOrgById, 
  MOCK_DEPARTMENTS, 
  getAgentsByDepartment, 
  getTasksByDepartment 
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

export default function OrgDepartmentDetail() {
  const { id, deptId } = useParams<{ id: string; deptId: string }>();
  const navigate = useNavigate();
  const org = getOrgById(id || "");
  const dept = MOCK_DEPARTMENTS.find(d => d.id === deptId && d.orgId === id);
  const agents = getAgentsByDepartment(deptId || "");
  const tasks = getTasksByDepartment(deptId || "");

  if (!org || !dept) return <div>Data not found</div>;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 space-y-6">
      {/* HEADER */}
      <header className="h-14 flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate(`/org/${id}/departments`)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-xl font-bold tracking-tight">
            <span className="mr-2">{dept.emoji}</span>
            {dept.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-9 hover:bg-white/5">
            <Edit3 className="h-4 w-4 mr-2" /> Edit
          </Button>
          <Button variant="default" size="sm" className="h-9 px-4 text-xs font-bold uppercase tracking-wider rounded-xl">
             <Plus className="h-4 w-4 mr-2" /> Add Agent
          </Button>
        </div>
      </header>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* SECTION 1 — Department Info Card */}
        <motion.div variants={itemVariants}>
          <Card className="p-6 bg-card/50 backdrop-blur-sm border-border/40 rounded-2xl">
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed font-medium">
              {dept.description}
            </p>
            <div className="flex gap-8">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Total Capacity</span>
                <p className="text-lg font-bold text-foreground">{dept.agentCount} <span className="text-primary">Agents</span></p>
              </div>
              <div className="h-10 w-px bg-white/5" />
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Throughput</span>
                <p className="text-lg font-bold text-foreground">{dept.completedTaskCount} <span className="text-primary">Tasks</span></p>
              </div>
              <div className="h-10 w-px bg-white/5" />
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Reliability</span>
                <p className="text-lg font-bold text-foreground">92% <span className="text-primary">Success</span></p>
              </div>
            </div>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* SECTION 2 — Agents in Department */}
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/50">Agents Cluster</h3>
              <span className="text-[10px] font-bold text-primary/60">{agents.length} Found</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
              {agents.map((agent) => (
                <div key={agent.id} className="h-20 p-4 flex items-center bg-white/5 border border-white/5 rounded-2xl hover:border-primary/30 hover:bg-white/10 transition-all group">
                  <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-lg border border-primary/20 group-hover:bg-primary/20 transition-colors mr-4">
                    {agent.emoji}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <p className="text-sm font-bold truncate text-foreground/90">{agent.name}</p>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider truncate">{agent.role}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                    <div className={`h-1.5 w-1.5 rounded-full ${agent.status === 'running' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]' : 'bg-muted'} group-hover:scale-110 transition-transform`} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{agent.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* SECTION 3 — Department Tasks */}
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/50">Directives Queue</h3>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] font-black uppercase tracking-widest text-primary/60 hover:text-primary transition-colors">
                 <Plus className="h-3 w-3 mr-1" /> Add Task
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {tasks.slice(0, 8).map((task) => (
                <div key={task.id} className="p-3 flex items-center gap-3 bg-white/5 border border-white/5 rounded-xl hover:border-primary/20 group cursor-pointer transition-all">
                  <div className="h-7 w-7 rounded-lg bg-white/5 flex items-center justify-center transition-colors">
                    {getTaskIcon(task.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground/90 truncate group-hover:text-primary transition-colors">{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-bold text-muted-foreground/40 uppercase">Task ID: {task.id.split('-').pop()}</span>
                      <span className="text-[10px] text-muted-foreground hover:text-white transition-colors">{task.agentEmoji} {task.agentName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${getPriorityColor(task.priority)}`}>
                      {task.priority}
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground/30 font-mono">{task.created}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

function getTaskIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    case "in_progress": return <Clock className="h-3.5 w-3.5 text-primary animate-pulse" />;
    case "failed": return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
    default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "critical": return "bg-red-400/10 text-red-400 border border-red-400/20";
    case "high": return "bg-amber-400/10 text-amber-400 border border-amber-400/20";
    case "medium": return "bg-primary/10 text-primary border border-primary/20";
    default: return "bg-white/5 text-muted-foreground/40 border border-white/10";
  }
}
