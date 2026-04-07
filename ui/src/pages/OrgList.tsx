import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Building2, 
  Users, 
  Cpu, 
  Layers, 
  ChevronRight,
  ShieldCheck,
  Zap,
  Rocket
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" }
  }
};

const MOCK_ORGS = [
  {
    id: "ensemble-labs",
    name: "Ensemble Labs",
    status: "Active",
    description: "Build intelligent agent pipelines to automate software development workflows",
    members: 8,
    agents: 12,
    depts: 4,
    tier: "Pro",
    icon: <Building2 className="h-6 w-6 text-primary" />,
    iconBg: "bg-primary/10"
  },
  {
    id: "nexus-ai",
    name: "Nexus AI Corp",
    status: "Active",
    description: "Accelerate product development with autonomous AI teams",
    members: 24,
    agents: 38,
    depts: 7,
    tier: "Enterprise",
    icon: <Zap className="h-6 w-6 text-amber-400" />,
    iconBg: "bg-amber-400/10"
  },
  {
    id: "stealth-startup",
    name: "Stealth Startup",
    status: "Setup",
    description: "MVP development with minimal human intervention",
    members: 2,
    agents: 4,
    depts: 2,
    tier: "Starter",
    icon: <Rocket className="h-6 w-6 text-indigo-400" />,
    iconBg: "bg-indigo-400/10"
  }
];

export default function OrgList() {
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Organizations</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium italic opacity-60 font-mono tracking-tighter">Canonical Registry — Deploying Corporate Intelligence</p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6"
        >
          {MOCK_ORGS.map((org) => (
            <motion.div key={org.id} variants={itemVariants}>
              <Card 
                className="p-8 bg-card/40 backdrop-blur-md border-border/40 rounded-[2.5rem] hover:border-primary/40 hover:bg-card/70 transition-all duration-500 cursor-pointer group relative overflow-hidden shadow-2xl"
                onClick={() => navigate(`/org/${org.id}`)}
              >
                {/* Background Glow */}
                <div className="absolute -top-24 -right-24 h-48 w-48 bg-primary/5 blur-[100px] rounded-full group-hover:bg-primary/10 transition-all duration-700" />

                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <div className={`h-16 w-16 rounded-3xl ${org.iconBg} flex items-center justify-center border border-white/10 shadow-inner transition-transform group-hover:scale-105 duration-500`}>
                      {org.icon}
                    </div>
                    <Badge variant="secondary" className={`text-[10px] uppercase font-black tracking-widest px-3 h-6 rounded-lg ${org.status === 'Active' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-muted text-muted-foreground'}`}>
                      {org.status}
                    </Badge>
                  </div>
                  
                  <div>
                    <h2 className="text-2xl font-black text-foreground group-hover:text-primary transition-colors tracking-tighter">{org.name}</h2>
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2 font-medium italic leading-relaxed h-10 opacity-70 group-hover:opacity-100 transition-opacity">
                      {org.description}
                    </p>
                  </div>
                  
                  <div className="pt-6 border-transparent group-hover:border-white/5 transition-all">
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/30 px-1">Infrastructure</span>
                        <div className="flex items-center gap-4 text-[11px] font-bold text-muted-foreground/80">
                           <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-primary/40" /> {org.members}</span>
                           <span className="flex items-center gap-1.5"><Cpu className="h-4 w-4 text-primary/40" /> {org.agents}</span>
                           <span className="flex items-center gap-1.5"><Layers className="h-4 w-4 text-primary/40" /> {org.depts}</span>
                        </div>
                      </div>
                      <div className="ml-auto">
                         <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:bg-primary/20 group-hover:border-primary/20 transition-all">
                            <ChevronRight className="h-5 w-5 text-muted-foreground/20 group-hover:text-primary" />
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
