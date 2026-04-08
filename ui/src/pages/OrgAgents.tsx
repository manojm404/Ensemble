import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Search,
  Users,
  Play,
  Pause,
  Trash2,
  ChevronRight,
  Cpu,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getOrgById, getAgentsByOrg, getDepartmentsByOrg, getTasksByOrg, Agent } from "@/lib/org-data";

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

export default function OrgAgents() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const org = getOrgById(id || "");
  const [agents, setAgents] = useState<Agent[]>(getAgentsByOrg(id || ""));
  const [departments, setDepartments] = useState(getDepartmentsByOrg(id || ""));
  const [tasks, setTasks] = useState(getTasksByOrg(id || ""));
  const [search, setSearch] = useState("");
  const [activeDept, setActiveDept] = useState("All");

  useEffect(() => {
    const refresh = () => {
      setAgents(getAgentsByOrg(id || ""));
      setDepartments(getDepartmentsByOrg(id || ""));
      setTasks(getTasksByOrg(id || ""));
    };
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [id]);

  if (!org) return <div className="flex items-center justify-center h-full text-muted-foreground">Organization not found</div>;

  const deptOptions = ["All", ...departments.map(d => d.name)];
  
  const filtered = agents.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(search.toLowerCase()) || 
                          agent.role.toLowerCase().includes(search.toLowerCase());
    const matchesDept = activeDept === "All" || agent.departmentName === activeDept;
    return matchesSearch && matchesDept;
  });

  const runningCount = agents.filter(a => a.status === 'running').length;
  const idleCount = agents.filter(a => a.status === 'idle').length;
  const pausedCount = agents.filter(a => a.status === 'paused').length;

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* HEADER */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/org/${id}`)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{org.name} — Agents</h1>
              <p className="text-sm text-muted-foreground mt-1">{agents.length} agents hired</p>
            </div>
          </div>
          <Button 
            variant="default" 
            size="lg" 
            className="gap-2"
            onClick={() => navigate(`/agents?orgId=${id}`)}
          >
            <Users className="h-4 w-4" /> Hire More Agents
          </Button>
        </header>

        {/* STATS */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-4 bg-card/40 backdrop-blur-sm border-border/40 rounded-2xl">
            <p className="text-2xl font-black text-foreground">{agents.length}</p>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mt-1 opacity-50">Total</p>
          </Card>
          <Card className="p-4 bg-card/40 backdrop-blur-sm border-border/40 rounded-2xl">
            <p className="text-2xl font-black text-emerald-400">{runningCount}</p>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mt-1 opacity-50">Running</p>
          </Card>
          <Card className="p-4 bg-card/40 backdrop-blur-sm border-border/40 rounded-2xl">
            <p className="text-2xl font-black text-amber-400">{idleCount}</p>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mt-1 opacity-50">Idle</p>
          </Card>
          <Card className="p-4 bg-card/40 backdrop-blur-sm border-border/40 rounded-2xl">
            <p className="text-2xl font-black text-rose-400">{pausedCount}</p>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mt-1 opacity-50">Paused</p>
          </Card>
        </div>

        {/* FILTERS */}
        <div className="flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder="Search agents..." 
              className="pl-9 bg-secondary/30 border-border/20 text-sm h-9" 
            />
          </div>
          <div className="flex gap-2">
            {deptOptions.slice(0, 5).map(dept => (
              <button
                key={dept}
                onClick={() => setActiveDept(dept)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeDept === dept 
                    ? "bg-primary/10 text-primary border border-primary/20" 
                    : "text-muted-foreground hover:bg-secondary/50 border border-border/20"
                }`}
              >
                {dept}
              </button>
            ))}
          </div>
        </div>

        {/* AGENTS LIST */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <Users className="h-12 w-12 text-muted-foreground/30" />
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                {agents.length === 0 ? "No agents hired yet." : "No agents match your filters."}
              </p>
              {agents.length === 0 && (
                <Button className="mt-4 gap-2" onClick={() => navigate(`/agents?orgId=${id}`)}>
                  <Users className="h-4 w-4" /> Hire Your First Agent
                </Button>
              )}
            </div>
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-4"
          >
            {filtered.map((agent) => {
              const agentTasks = tasks.filter(t => t.agentId === agent.id);
              const completedTasks = agentTasks.filter(t => t.status === 'completed').length;
              
              return (
                <motion.div key={agent.id} variants={itemVariants}>
                  <AgentCard 
                    agent={agent} 
                    orgId={id || ""}
                    completedTasks={completedTasks}
                    totalTasks={agentTasks.length}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function AgentCard({ agent, orgId, completedTasks, totalTasks }: { 
  agent: Agent; 
  orgId: string;
  completedTasks: number;
  totalTasks: number;
}) {
  const navigate = useNavigate();
  
  const statusConfig = {
    running: { 
      color: "text-emerald-400", 
      bg: "bg-emerald-400/10", 
      border: "border-emerald-400/20",
      label: "Running" 
    },
    idle: { 
      color: "text-amber-400", 
      bg: "bg-amber-400/10", 
      border: "border-amber-400/20",
      label: "Idle" 
    },
    paused: { 
      color: "text-rose-400", 
      bg: "bg-rose-400/10", 
      border: "border-rose-400/20",
      label: "Paused" 
    }
  };

  const config = statusConfig[agent.status];

  return (
    <Card className="p-6 bg-card/40 backdrop-blur-sm border-border/40 rounded-2xl hover:border-primary/20 hover:bg-card/60 transition-all group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-secondary/50 flex items-center justify-center text-2xl border border-border/30">
            {agent.emoji}
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">{agent.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{agent.role}</p>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant="outline" className={`text-[9px] ${config.bg} ${config.color} ${config.border}`}>
                {config.label}
              </Badge>
              <span className="text-[10px] text-muted-foreground/60">🧠 {agent.model}</span>
              <span className="text-[10px] text-muted-foreground/60">📁 {agent.departmentName}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          {/* Task Stats */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-medium">{completedTasks}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-medium">{totalTasks}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              title={agent.status === 'running' ? 'Pause' : 'Start'}
            >
              {agent.status === 'running' ? (
                <Pause className="h-4 w-4 text-amber-400" />
              ) : (
                <Play className="h-4 w-4 text-emerald-400" />
              )}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 hover:text-destructive"
              title="Remove from organization"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <ChevronRight className="h-5 w-5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
          </div>
        </div>
      </div>
    </Card>
  );
}
