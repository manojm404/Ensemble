import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  ArrowLeft, 
  Plus, 
  ChevronRight, 
  Settings, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Activity,
  Users,
  Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getOrgById, getDepartmentsByOrg, getTasksByDepartment } from "@/lib/org-data";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5 }
  }
};

export default function OrgDepartments() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const org = getOrgById(id || "");
  const departments = getDepartmentsByOrg(id || "");

  if (!org) return <div>Org not found</div>;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 space-y-10">
      {/* HEADER SECTION (Matches Screenshot 3) */}
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
          <h1 className="text-2xl font-bold tracking-tight mt-2">Departments</h1>
          <p className="text-sm text-muted-foreground font-medium uppercase tracking-widest text-[10px] opacity-60">
             {departments.length} departments configured
          </p>
        </div>
        <Button variant="default" size="lg" className="rounded-2xl h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-bold uppercase tracking-widest text-[11px] gap-2 shadow-xl border border-primary/20">
          <Plus className="h-4 w-4" /> New Department
        </Button>
      </header>

      {/* DEPARTMENTS LIST (Matches Screenshot 3) */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-8"
      >
        {departments.map((dept) => (
          <DepartmentDetailCard key={dept.id} dept={dept} orgId={id || ""} onClick={() => navigate(`/org/${id}/departments/${dept.id}`)} />
        ))}
      </motion.div>
    </div>
  );
}

function DepartmentDetailCard({ dept, orgId, onClick }: { dept: any, orgId: string, onClick: () => void }) {
  const tasks = getTasksByDepartment(dept.id).slice(0, 3);

  return (
    <motion.div variants={itemVariants}>
      <Card 
        className="p-8 bg-card/40 backdrop-blur-md border-border/40 rounded-[2.5rem] hover:border-primary/20 hover:bg-card/60 transition-all duration-300 cursor-pointer shadow-2xl relative overflow-hidden group"
        onClick={onClick}
      >
        <div className="flex items-start justify-between mb-8">
           <div className="flex items-center gap-6">
              <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5 group-hover:bg-primary/10 transition-all shadow-inner">
                <span className="text-2xl opacity-60 group-hover:opacity-100 transition-opacity">{dept.emoji}</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">{dept.name}</h2>
                    <Badge variant="secondary" className="bg-emerald-400/10 text-emerald-400 border-border/40 text-[9px] uppercase font-black tracking-widest px-2.5 h-5">Active</Badge>
                </div>
                <p className="text-sm text-muted-foreground/60 font-medium italic">{dept.description}</p>
                <div className="flex items-center gap-6 pt-1 opacity-50 group-hover:opacity-100 transition-opacity">
                   <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {dept.agentCount} agents</span>
                   <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> 3 active</span>
                   <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> {dept.completedTaskCount} completed</span>
                </div>
              </div>
           </div>
           <div className="self-center">
             <ChevronRight className="h-6 w-6 text-muted-foreground/20 group-hover:text-primary transition-all group-hover:translate-x-1" />
           </div>
        </div>

        {/* Progress Bar (Single line indicator) */}
        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 mb-8">
           <motion.div initial={{ width: 0 }} animate={{ width: "65%" }} className="h-full bg-primary/70 group-hover:bg-primary transition-colors shadow-[0_0_10px_rgba(34,211,238,0.2)]" />
        </div>

        {/* Active Tasks (List) */}
        <div className="space-y-4 px-2">
           <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/30 mb-4 px-1">Active Tasks</p>
           <div className="flex flex-col gap-2">
             {tasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between p-3.5 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors group/task border border-transparent hover:border-border/40 cursor-pointer">
                  <div className="flex items-center gap-4">
                     {task.emoji || '🎯'}
                     <span className="text-sm font-bold text-foreground/90 group-hover/task:text-primary transition-colors tracking-tight">{task.title}</span>
                  </div>
                  <div className="flex items-center gap-4">
                     <Badge variant="outline" className={`text-[9px] uppercase font-black tracking-widest px-2.5 h-5 ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                     </Badge>
                     <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/40 italic">
                        <Clock className="h-3 w-3" />
                        {task.created}
                     </div>
                  </div>
                </div>
             ))}
           </div>
        </div>
      </Card>
    </motion.div>
  );
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "critical": return "bg-red-400/10 text-red-500 border-red-400/20";
    case "high": return "bg-orange-400/10 text-orange-500 border-orange-400/20";
    case "medium": return "bg-primary/10 text-primary border-primary/20";
    default: return "bg-muted text-muted-foreground border-border/10";
  }
}
