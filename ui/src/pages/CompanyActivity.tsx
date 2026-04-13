import { useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useCompanyContext } from "@/lib/company-context";
import { getCompanyById, getActivityByCompany, type ActivityEvent } from "@/lib/company-data";

const typeConfig: Record<string, { color: string; label: string }> = {
  agent: { color: "bg-blue-400", label: "Agent" },
  issue: { color: "bg-emerald-400", label: "Issue" },
  alert: { color: "bg-red-400", label: "Alert" },
  deploy: { color: "bg-purple-400", label: "Deploy" },
  member: { color: "bg-amber-400", label: "Member" },
  system: { color: "bg-gray-400", label: "System" },
};

export default function CompanyActivity() {
  const { id } = useParams<{ id: string }>();
  const { currentCompany } = useCompanyContext();
  const [filter, setFilter] = useState<string>("all");

  const company = getCompanyById(id || currentCompany?.id || "");
  if (!company) return <div className="flex items-center justify-center h-full text-muted-foreground">No company selected</div>;

  const activity = getActivityByCompany(company.id);
  const filtered = filter === "all" ? activity : activity.filter(e => e.type === filter);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-8 py-6 border-b border-border/40 bg-card/30 backdrop-blur-sm">
        <div>
          <h1 className="text-xl font-bold text-foreground">{company.emoji} {company.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Activity feed</p>
        </div>
        <div className="flex items-center gap-1.5">
          {["all", "agent", "issue", "alert", "deploy", "system"].map(t => (
            <button key={t} onClick={() => setFilter(t)} className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${filter === t ? "bg-primary/20 text-primary border border-primary/20" : "text-muted-foreground/50 hover:text-foreground hover:bg-white/5"}`}>{t}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-8 py-8">
        <div className="max-w-3xl mx-auto space-y-4">
          {filtered.map((event, i) => {
            const config = typeConfig[event.type] || typeConfig.system;
            return (
              <motion.div key={event.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }} className="flex items-start gap-4">
                <div className="relative flex flex-col items-center">
                  <div className={`h-3 w-3 rounded-full ${config.color} ring-4 ring-background`} />
                  {i < filtered.length - 1 && <div className="w-px h-full bg-border/20 mt-1" />}
                </div>
                <div className="pb-6 min-w-0 flex-1">
                  <p className="text-sm text-foreground">{event.action}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">{event.time} · {config.label}</p>
                </div>
              </motion.div>
            );
          })}
          {filtered.length === 0 && <p className="text-sm text-muted-foreground/40 text-center py-12">No activity yet</p>}
        </div>
      </div>
    </div>
  );
}
