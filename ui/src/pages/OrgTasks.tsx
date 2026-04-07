import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  ArrowLeft, 
  Plus, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  PauseCircle, 
  ChevronRight,
  Target,
  MoreVertical,
  Activity,
  Briefcase
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getOrgById, getTasksByOrg } from "@/lib/org-data";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.4 }
  }
};

export default function OrgTasks() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const org = getOrgById(id || "");
  const tasks = getTasksByOrg(id || "");

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = task.title.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = activeTab === "all" || task.status === activeTab;
      return matchesSearch && matchesStatus;
    });
  }, [tasks, search, activeTab]);

  if (!org) return <div>Org not found</div>;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 space-y-8 flex flex-col">
      {/* HEADER SECTION (Matches Screenshot 5) */}
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate(`/org/${id}`)}
            className="w-fit p-0 h-6 text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 mr-1 group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
          </Button>
          <h1 className="text-2xl font-bold tracking-tight mt-2">Task Board</h1>
          <p className="text-sm text-muted-foreground font-medium uppercase tracking-widest text-[10px] opacity-60">
             {tasks.length} total tasks · {tasks.filter(t => t.status === 'in_progress').length} in progress
          </p>
        </div>
        <Button variant="default" size="lg" className="rounded-2xl h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-bold uppercase tracking-widest text-[11px] gap-2 shadow-xl border border-primary/20">
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </header>

      {/* TOOLBAR (Matches Screenshot 5) */}
      <div className="flex items-center justify-between gap-6 px-1">
        <div className="relative flex-1 max-w-lg group">
           <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
           <Input 
             placeholder="Search tasks..." 
             className="h-12 pl-12 bg-card/40 backdrop-blur-sm border-border/40 rounded-2xl focus-visible:ring-primary/20 font-medium text-sm transition-all focus:bg-card/60"
             value={search}
             onChange={(e) => setSearch(e.target.value)}
           />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
           <StatusFilterItem label="All" count={tasks.length} active={activeTab === "all"} onClick={() => setActiveTab("all")} />
           <StatusFilterItem label="In Progress" count={tasks.filter(t => t.status === 'in_progress').length} active={activeTab === "in_progress"} onClick={() => setActiveTab("in_progress")} />
           <StatusFilterItem label="Queued" count={tasks.filter(t => t.status === 'queued').length} active={activeTab === "queued"} onClick={() => setActiveTab("queued")} />
           <StatusFilterItem label="Completed" count={tasks.filter(t => t.status === 'completed').length} active={activeTab === "completed"} onClick={() => setActiveTab("completed")} />
           <StatusFilterItem label="Failed" count={tasks.filter(t => t.status === 'failed').length} active={activeTab === "failed"} onClick={() => setActiveTab("failed")} />
        </div>
      </div>

      {/* TASK LIST (Matches Screenshot 5) */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-3 pb-20"
      >
        {filteredTasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </motion.div>
    </div>
  );
}

function TaskRow({ task }: { task: any }) {
  return (
    <motion.div variants={itemVariants}>
      <Card className="p-5 flex items-center gap-5 bg-card/40 backdrop-blur-md border-border/40 rounded-2xl hover:border-primary/20 hover:bg-card/60 cursor-pointer transition-all duration-300 group shadow-lg relative overflow-hidden">
         <div className={`h-11 w-11 min-w-[44px] rounded-xl flex items-center justify-center border border-white/5 transition-colors shadow-inner ${getStatusBg(task.status)} group-hover:scale-105 duration-300`}>
            {getStatusIcon(task.status)}
         </div>
         <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
               <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/30 font-mono">TSK-{task.id.split('-').pop()}</span>
               <Badge variant="outline" className={`text-[9px] uppercase font-black tracking-widest px-2.5 h-5 ${getPriorityColor(task.priority)}`}>
                  {task.priority}
               </Badge>
               <span className="text-[9px] font-bold text-muted-foreground/40 italic uppercase tracking-widest">{task.departmentName}</span>
            </div>
            <h4 className="text-[15px] font-bold tracking-tight text-foreground/90 group-hover:text-primary transition-colors mt-2 mb-1 truncate leading-none">{task.title}</h4>
            <div className="flex items-center gap-3 mt-2">
               <span className="text-[11px] text-muted-foreground/50 font-bold group-hover:text-foreground/80 transition-colors">{task.agentEmoji} {task.agentName}</span>
               <div className="h-1 w-1 rounded-full bg-muted-foreground/20" />
               <div className="flex items-center gap-1 text-[11px] text-muted-foreground/30 font-bold italic font-mono transition-opacity group-hover:text-primary/40">
                  <Clock className="h-3 w-3" /> {task.created}
               </div>
            </div>
         </div>
         <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0">
            <ChevronRight className="h-5 w-5 text-muted-foreground/30 group-hover:text-primary" />
         </div>
      </Card>
    </motion.div>
  );
}

function StatusFilterItem({ label, count, active, onClick }: { label: string, count: number, active: boolean, onClick: () => void }) {
  return (
    <Button 
      variant={active ? "default" : "outline"} 
      size="sm" 
      onClick={onClick}
      className={`h-9 rounded-xl border border-border/40 gap-2 font-bold uppercase tracking-widest text-[9px] transition-all shadow-lg min-w-fit px-4 ${active ? 'bg-primary text-primary-foreground shadow-primary/20 scale-105' : 'bg-card/40 hover:bg-card/60 text-muted-foreground'}`}
    >
      {label} <span className={`font-mono text-[10px] ${active ? 'text-primary-foreground/60' : 'text-muted-foreground/30'}`}>({count})</span>
    </Button>
  );
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
    case "in_progress": return <Clock className="h-5 w-5 text-primary animate-pulse" />;
    case "failed": return <AlertCircle className="h-5 w-5 text-red-500" />;
    case "queued": return <PauseCircle className="h-5 w-5 text-amber-500/60" />;
    default: return <Clock className="h-5 w-5 text-muted-foreground" />;
  }
}

function getStatusBg(status: string) {
  switch (status) {
    case "completed": return "bg-emerald-400/10";
    case "in_progress": return "bg-primary/10";
    case "failed": return "bg-red-400/10";
    case "queued": return "bg-amber-400/10";
    default: return "bg-white/5";
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "critical": return "bg-red-400/10 text-red-500 border-red-400/20";
    case "high": return "bg-orange-400/10 text-orange-500 border-orange-400/20";
    case "medium": return "bg-primary/10 text-primary border-primary/20";
    default: return "bg-muted text-muted-foreground border-border/10";
  }
}
