import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Building2, 
  Users, 
  Cpu, 
  Layers, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Plus, 
  Briefcase, 
  Activity, 
  BarChart3,
  Settings,
  ChevronRight,
  ShieldCheck,
  Zap,
  Target,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getOrgById, getDepartmentsByOrg, getActivityByOrg, getTasksByOrg } from "@/lib/org-data";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4 }
  }
};

export default function OrgDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const org = getOrgById(id || "");
  const departments = getDepartmentsByOrg(id || "");
  const activities = getActivityByOrg(id || "");
  const tasks = getTasksByOrg(id || "");

  if (!org) return <div>Org not found</div>;

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-10">
        {/* HEADER SECTION (Matches Screenshot 2) */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-5">
             <div className="h-16 w-16 bg-card/60 rounded-2xl flex items-center justify-center border border-white/5 shadow-2xl">
               <Building2 className="h-8 w-8 text-primary/80" />
             </div>
             <div>
               <h1 className="text-2xl font-bold tracking-tight text-foreground">{org.name}</h1>
               <p className="text-sm text-muted-foreground mt-1 font-medium">{org.description}</p>
               <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="text-[9px] bg-white/5 border-white/10 text-muted-foreground uppercase font-black tracking-widest">{org.tier}</Badge>
                  <Badge variant="outline" className="text-[9px] bg-white/5 border-white/10 text-muted-foreground uppercase font-black tracking-widest">US EAST</Badge>
                  <Badge variant="secondary" className="text-[9px] bg-emerald-400/10 text-emerald-400 border-border/40 uppercase font-black tracking-widest">Active</Badge>
               </div>
             </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="lg" className="rounded-2xl h-11 border-border/40 bg-card/40 hover:bg-card/70 font-bold uppercase tracking-widest text-[10px] gap-2 shadow-lg" onClick={() => navigate(`/org/${id}/roster`)}>
               <Plus className="h-4 w-4" /> Hire Agent
            </Button>
            <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full hover:bg-white/5 border border-transparent hover:border-white/5">
               <Settings className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* STATS GRID (Matches Screenshot 2) */}
        <motion.div 
          variants={containerVariants} 
          initial="hidden" 
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <StatCard count="4" label="Departments" icon={<Layers className="h-4 w-4 text-blue-400" />} />
          <StatCard count="7/12" label="Agents Active" icon={<Cpu className="h-4 w-4 text-emerald-400" />} />
          <StatCard count="8" label="Tasks In Progress" icon={<Zap className="h-4 w-4 text-amber-400" />} />
          <StatCard count="3" label="Completed" icon={<CheckCircle2 className="h-4 w-4 text-primary" />} />
          <StatCard count="8" label="Members" icon={<Users className="h-4 w-4 text-purple-400" />} />
          <StatCard count="1" label="Failed" icon={<ShieldCheck className="h-4 w-4 text-rose-400" />} />
        </motion.div>

        {/* DEPARTMENTS SECTION (Matches Screenshot 2) */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/30">Departments</h3>
            <Button variant="ghost" className="h-6 text-[10px] text-primary/60 hover:text-primary uppercase tracking-[0.15em] font-black" onClick={() => navigate(`/org/${id}/departments`)}>View All <ChevronRight className="h-3 w-3 inline ml-1" /></Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {departments.slice(0, 4).map((dept) => (
              <DepartmentItem key={dept.id} dept={dept} onClick={() => navigate(`/org/${id}/departments/${dept.id}`)} />
            ))}
          </div>
        </div>

        {/* ACTIVITY FEED (Matches Screenshot 2) */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/30">Recent Activity</h3>
            <Button variant="ghost" className="h-6 text-[10px] text-primary/60 hover:text-primary uppercase tracking-[0.15em] font-black" onClick={() => navigate(`/org/${id}/activity`)}>Full Feed <ChevronRight className="h-3 w-3 inline ml-1" /></Button>
          </div>
          <Card className="p-2 bg-card/40 backdrop-blur-sm border-border/40 rounded-3xl overflow-hidden shadow-2xl">
             <div className="flex flex-col">
                {activities.slice(0, 6).map((activity) => (
                  <div key={activity.id} className="p-5 flex items-center gap-5 hover:bg-white/5 transition-colors group cursor-pointer border-b border-border/10 last:border-0 border-transparent rounded-2xl">
                     <div className="h-10 w-10 min-w-[40px] rounded-xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:bg-primary/10 transition-colors shadow-inner">
                        {getEmojiIcon(activity.type)}
                     </div>
                     <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground/90 group-hover:text-primary transition-colors truncate tracking-tight">{activity.action}</p>
                        <p className="text-[10px] text-muted-foreground/40 mt-1 font-bold uppercase tracking-widest">{activity.time}</p>
                     </div>
                     <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                       <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                     </div>
                  </div>
                ))}
             </div>
          </Card>
        </div>

        {/* BOTTOM NAV BUTTONS (Matches Screenshot 2) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-1 pb-10">
          <NavButton label="Hire Agents" icon={<Users className="h-5 w-5" />} onClick={() => navigate(`/org/${id}/roster`)} />
          <NavButton label="Task Board" icon={<Zap className="h-5 w-5" />} onClick={() => navigate(`/org/${id}/tasks`)} />
          <NavButton label="Activity Feed" icon={<Activity className="h-5 w-5" />} onClick={() => navigate(`/org/${id}/activity`)} />
          <NavButton label="Reports" icon={<BarChart3 className="h-5 w-5" />} onClick={() => navigate(`/org/${id}/reports`)} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ count, label, icon }: { count: string, label: string, icon: any }) {
  return (
    <Card className="p-6 bg-card/40 backdrop-blur-sm border-border/40 rounded-3xl hover:border-primary/20 hover:bg-card/60 cursor-pointer transition-all h-36 flex flex-col justify-center shadow-lg group">
       <div className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 mb-3 group-hover:bg-primary/5 transition-colors">
         {icon}
       </div>
       <p className="text-2xl font-black text-foreground tracking-tighter leading-none">{count}</p>
       <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mt-2 opacity-50 group-hover:opacity-100 transition-opacity">{label}</p>
    </Card>
  );
}

function DepartmentItem({ dept, onClick }: { dept: any, onClick: () => void }) {
  return (
    <Card className="p-6 bg-card/40 backdrop-blur-sm border-border/40 rounded-3xl hover:border-primary/20 hover:bg-card/60 cursor-pointer transition-all shadow-lg group flex flex-col justify-between h-44" onClick={onClick}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
           <div className="h-10 w-10 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5 group-hover:bg-primary/20 transition-all shadow-inner">
             <span className="text-xl opacity-60 group-hover:opacity-100">{dept.emoji}</span>
           </div>
           <div>
             <h4 className="text-base font-bold text-foreground/90 group-hover:text-primary transition-colors">{dept.name}</h4>
             <p className="text-[10px] text-muted-foreground/60 font-medium leading-relaxed italic">{dept.description}</p>
           </div>
        </div>
      </div>
      <div className="space-y-3">
         <div className="flex items-center gap-4 opacity-40 group-hover:opacity-100 transition-opacity">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Users className="h-3 w-3" /> {dept.agentCount} agents</span>
            <div className="h-1 w-1 rounded-full bg-muted-foreground/20" />
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Activity className="h-3 w-3" /> 8 active</span>
            <div className="h-1 w-1 rounded-full bg-muted-foreground/20" />
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" /> {dept.completedTaskCount} done</span>
         </div>
         <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
            <motion.div initial={{ width: 0 }} animate={{ width: "65%" }} className="h-full bg-primary/70 group-hover:bg-primary transition-colors shadow-[0_0_10px_rgba(34,211,238,0.2)]" />
         </div>
      </div>
    </Card>
  );
}

function NavButton({ label, icon, onClick }: { label: string, icon: any, onClick: () => void }) {
  return (
    <Button variant="outline" className="h-20 bg-card/40 backdrop-blur-sm border-border/40 rounded-2xl hover:border-primary/20 hover:bg-card/70 flex flex-col items-center justify-center gap-2 p-0 group transition-all" onClick={onClick}>
      <div className="h-8 w-8 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors shadow-inner">
        {icon}
      </div>
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 group-hover:text-primary transition-colors">{label}</span>
    </Button>
  );
}

function getEmojiIcon(type: string) {
    if (type === 'agent') return '🤖';
    if (type === 'task') return '🎯';
    if (type === 'alert') return '🔔';
    if (type === 'member') return '👤';
    return '⚡';
}
