import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  ArrowLeft, 
  Search, 
  Cpu, 
  CheckCircle2, 
  AlertTriangle, 
  Zap, 
  Users, 
  Briefcase,
  Filter,
  MoreVertical,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { getOrgById, getActivityByOrg } from "@/lib/org-data";

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
  hidden: { opacity: 0, scale: 0.98, y: 12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.4 }
  }
};

export default function OrgActivity() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const org = getOrgById(id || "");
  const activity = getActivityByOrg(id || "");

  const [typeFilter, setTypeFilter] = useState("all");

  const filteredActivity = useMemo(() => {
    if (typeFilter === "all") return activity;
    return activity.filter(event => event.type === typeFilter);
  }, [activity, typeFilter]);

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
            className="hover:bg-white/5"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-xl font-bold tracking-tight">Activity Feed</h1>
        </div>
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground/40" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48 h-9 bg-card/50 border-border/40 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border/40 text-xs font-bold uppercase tracking-wider">
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="agent">Agent Actions</SelectItem>
              <SelectItem value="task">Task Completion</SelectItem>
              <SelectItem value="system">System Events</SelectItem>
              <SelectItem value="alert">Alerts & Errors</SelectItem>
              <SelectItem value="member">Network Activity</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* FEED CONTENT */}
      <div className="flex-1 px-4 mt-4 overflow-y-auto max-h-[calc(100vh-160px)] scrollbar-thin pb-10">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="relative ml-2 space-y-0"
        >
          {/* Vertical Timeline Line */}
          <div className="absolute left-[15px] top-4 bottom-0 w-px bg-border/20 z-0 shadow-sm" />

          {filteredActivity.map((event, idx) => (
            <motion.div 
              key={event.id} 
              variants={itemVariants}
              className="relative pl-10 py-4 group"
            >
              {/* Timeline Dot */}
              <div 
                className={`absolute left-[9px] top-[26px] h-3.5 w-3.5 rounded-full border-4 border-background z-10 transition-all group-hover:scale-125 ${getEventTypeColors(event.type).dot}`}
                title={event.type}
              />

              <Card className={`p-4 bg-card/40 backdrop-blur-md border border-border/40 rounded-2xl group-hover:border-primary/20 group-hover:bg-card/70 cursor-pointer transition-all duration-300 relative ${event.type === 'alert' ? 'border-l-4 border-l-red-500/60' : ''}`}>
                 <div className="flex items-start gap-4">
                    <div className={`h-10 w-10 min-w-[40px] rounded-xl flex items-center justify-center border border-white/5 shadow-inner transition-colors ${getEventTypeColors(event.type).iconBg}`}>
                       {getEventTypeIcon(event.type)}
                    </div>
                    <div className="flex-1 space-y-1">
                       <p className="text-sm font-medium text-foreground tracking-tight leading-tight transition-colors group-hover:text-primary">
                          {event.action}
                       </p>
                       <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/30">{event.type} // LOG</span>
                          <div className="h-1 w-1 rounded-full bg-muted-foreground/20" />
                          <span className="text-[11px] font-bold text-muted-foreground font-mono italic opacity-60">ID: {event.id.toUpperCase()}</span>
                       </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 pr-2">
                       <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 font-mono italic">{event.time}</span>
                       <div className="flex items-center -space-x-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-white/10 rounded-full">
                             <MoreVertical className="h-3 w-3" />
                          </Button>
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

function getEventTypeIcon(type: string) {
  switch (type) {
    case "agent": return <Cpu className="h-4 w-4" />;
    case "task": return <CheckCircle2 className="h-4 w-4" />;
    case "alert": return <AlertTriangle className="h-4 w-4" />;
    case "deploy": return <Zap className="h-4 w-4" />;
    case "member": return <Users className="h-4 w-4" />;
    case "system": return <Activity className="h-4 w-4" />;
    default: return <Briefcase className="h-4 w-4" />;
  }
}

function getEventTypeColors(type: string) {
  switch (type) {
    case "agent": return { dot: "bg-primary shadow-[0_0_8px_rgba(34,211,238,0.4)]", iconBg: "bg-primary/10 text-primary" };
    case "task": return { dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]", iconBg: "bg-emerald-400/10 text-emerald-400" };
    case "alert": return { dot: "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.4)]", iconBg: "bg-red-400/10 text-red-500" };
    case "deploy": return { dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]", iconBg: "bg-amber-400/10 text-amber-500" };
    case "member": return { dot: "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.4)]", iconBg: "bg-blue-400/10 text-blue-500" };
    case "system": return { dot: "bg-muted-foreground opacity-60 shadow-[0_0_8px_rgba(255,255,255,0.1)]", iconBg: "bg-white/5 text-muted-foreground" };
    default: return { dot: "bg-muted shadow-none opacity-40", iconBg: "bg-white/5 text-muted-foreground" };
  }
}
