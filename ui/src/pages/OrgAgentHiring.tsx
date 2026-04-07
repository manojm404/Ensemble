import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  ArrowLeft, 
  Plus, 
  Search, 
  Cpu, 
  CheckCircle2, 
  Activity, 
  Zap, 
  Users, 
  Briefcase,
  Layers,
  Sparkles,
  SearchIcon,
  Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  getOrgById, 
  getAgentsByOrg, 
  getDepartmentsByOrg 
} from "@/lib/org-data";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3 }
  }
};

export default function OrgAgentHiring() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const org = getOrgById(id || "");
  const agents = getAgentsByOrg(id || "");
  const departments = getDepartmentsByOrg(id || "");

  const [search, setSearch] = useState("");
  const [activeDept, setActiveDept] = useState("all");

  const filteredAgents = useMemo(() => {
    return agents.filter(agent => {
      const matchesSearch = agent.name.toLowerCase().includes(search.toLowerCase()) || 
                            agent.role.toLowerCase().includes(search.toLowerCase());
      const matchesDept = activeDept === "all" || agent.departmentId === activeDept;
      return matchesSearch && matchesDept;
    });
  }, [agents, search, activeDept]);

  if (!org) return <div>Org not found</div>;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 space-y-8">
      {/* HEADER (Matches Screenshot 4) */}
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
          <h1 className="text-2xl font-bold tracking-tight mt-2">Agent Roster</h1>
          <p className="text-sm text-muted-foreground font-medium uppercase tracking-widest text-[10px] opacity-60">
             {agents.length} agents deployed across {departments.length} departments
          </p>
        </div>
        <Button variant="default" size="lg" className="rounded-2xl h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-bold uppercase tracking-widest text-[11px] gap-2 shadow-xl border border-primary/20">
          <Plus className="h-4 w-4" /> Hire New Agent
        </Button>
      </header>

      {/* TOOLBAR (Matches Screenshot 4) */}
      <div className="flex items-center justify-between gap-6 px-1">
        <div className="relative flex-1 max-w-lg group">
           <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
           <Input 
             placeholder="Search agents..." 
             className="h-12 pl-12 bg-card/40 backdrop-blur-sm border-border/40 rounded-2xl focus-visible:ring-primary/20 font-medium text-sm transition-all focus:bg-card/60"
             value={search}
             onChange={(e) => setSearch(e.target.value)}
           />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
           <DeptFilterItem label="All" active={activeDept === "all"} onClick={() => setActiveDept("all")} />
           {departments.map((dept) => (
             <DeptFilterItem 
               key={dept.id} 
               label={dept.name} 
               icon={dept.emoji} 
               active={activeDept === dept.id} 
               onClick={() => setActiveDept(dept.id)} 
             />
           ))}
        </div>
      </div>

      {/* AGENT GRID (Matches Screenshot 4) */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {filteredAgents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </motion.div>
    </div>
  );
}

function AgentCard({ agent }: { agent: any }) {
  return (
    <motion.div variants={itemVariants}>
      <Card className="p-6 bg-card/40 backdrop-blur-md border-border/40 rounded-[2.5rem] hover:border-primary/20 hover:bg-card/60 transition-all duration-300 group shadow-2xl relative overflow-hidden flex flex-col h-full">
         <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
               <div className="h-14 w-14 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5 group-hover:bg-primary/10 transition-all shadow-inner">
                 <span className="text-2xl opacity-60 group-hover:opacity-100 transition-opacity">{agent.emoji}</span>
               </div>
               <div>
                 <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors tracking-tight leading-none">{agent.name}</h3>
                 <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 mt-1.5">{agent.role}</p>
               </div>
            </div>
            <div className={`h-2 w-2 rounded-full ${agent.status === 'running' ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.4)]' : 'bg-muted-foreground/30'} group-hover:scale-125 transition-transform`} />
         </div>

         <div className="grid grid-cols-2 gap-y-5 gap-x-8 px-1 mb-8">
            <AgentStat label="Model" value={agent.model} />
            <AgentStat label="Department" value={agent.departmentName} align="right" />
            <AgentStat label="Uptime" value="99.8%" />
            <AgentStat label="Tasks" value={`${agent.tasksCompleted} done · 3 active`} align="right" />
            <AgentStat label="Tokens" value="1.2M" />
         </div>

         <div className="flex flex-wrap gap-2 mt-auto">
            {agent.skills.slice(0, 3).map((skill: string) => (
               <Badge key={skill} variant="outline" className="text-[9px] font-semibold tracking-wider text-muted-foreground/60 border-white/5 bg-white/5 px-2.5 h-5 rounded-lg group-hover:text-primary/80 group-hover:border-primary/20 transition-all">
                  {skill}
               </Badge>
            ))}
         </div>
         
         <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-[10px] font-bold text-muted-foreground/30 uppercase tracking-widest italic font-mono transition-opacity group-hover:text-primary/40">
            <span>Last active: 2m ago</span>
         </div>
      </Card>
    </motion.div>
  );
}

function AgentStat({ label, value, align = "left" }: { label: string, value: string, align?: "left" | "right" }) {
  return (
    <div className={`flex flex-col gap-1 ${align === 'right' ? 'items-end' : 'items-start'}`}>
       <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/20">{label}</span>
       <span className="text-xs font-bold text-foreground/80 tracking-tight truncate max-w-full font-mono">{value}</span>
    </div>
  );
}

function DeptFilterItem({ label, icon, active, onClick }: { label: string, icon?: string, active: boolean, onClick: () => void }) {
  return (
    <Button 
      variant={active ? "default" : "outline"} 
      size="sm" 
      onClick={onClick}
      className={`h-9 rounded-xl border border-border/40 gap-2 font-bold uppercase tracking-widest text-[9px] transition-all shadow-lg min-w-fit px-4 ${active ? 'bg-primary text-primary-foreground shadow-primary/20' : 'bg-card/40 hover:bg-card/60 text-muted-foreground'}`}
    >
      {icon && <span className="text-xs opacity-60">{icon}</span>}
      {label}
    </Button>
  );
}
