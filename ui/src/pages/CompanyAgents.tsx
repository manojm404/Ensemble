import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Bot, Search, X, Pause, Play, Settings2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useCompanyContext } from "@/lib/company-context";
import { getCompanyById } from "@/lib/company-data";
import { listCompanyAgents, listCompanyTeams, type CompanyAgentRecord, type CompanyTeam } from "@/lib/api";
import { useScrollMemory } from "@/lib/use-scroll-memory";

export default function CompanyAgents() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentCompany, setCurrentCompanyId } = useCompanyContext();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [agents, setAgents] = useState<CompanyAgentRecord[]>([]);
  const [teams, setTeams] = useState<CompanyTeam[]>([]);

  const companyId = id || currentCompany?.id || "";
  const company = getCompanyById(companyId) || currentCompany;
  const scrollRef = useScrollMemory(`esemble_scroll_company_${companyId || "unknown"}_agents`);

  useEffect(() => {
    if (!companyId) return;
    setCurrentCompanyId(companyId);
    Promise.all([listCompanyAgents(companyId), listCompanyTeams(companyId)])
      .then(([agentRows, teamRows]) => {
        setAgents(agentRows);
        setTeams(teamRows);
      })
      .catch(console.error);
  }, [companyId]);

  if (!company) return <div className="flex items-center justify-center h-full text-muted-foreground">No company selected</div>;

  const filtered = agents.filter(a => {
    const matchesSearch = a.display_name.toLowerCase().includes(search.toLowerCase()) || a.role.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    running: agents.filter(a => a.status === "running").length,
    idle: agents.filter(a => a.status === "idle").length,
    paused: agents.filter(a => a.status === "paused").length,
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-border/40 bg-card/30 backdrop-blur-sm">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2 gap-2 rounded-full border border-border/40 bg-background/70" onClick={() => navigate(`/company/${companyId}`)}>
            <ChevronLeft className="h-4 w-4" />
            Back to workspace
          </Button>
          <h1 className="text-xl font-bold text-foreground">{company.emoji} {company.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{agents.length} agents across {teams.length} teams</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search agents..." className="h-8 pl-8 pr-8 w-56 text-xs bg-secondary/30 border-border/40 rounded-lg" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="h-3 w-3 text-muted-foreground/40" /></button>}
          </div>
          {["all", "running", "idle", "paused"].map(s => (
            <Button key={s} variant={statusFilter === s ? "default" : "ghost"} size="sm" className="h-7 text-[10px] font-bold uppercase tracking-wider px-2.5" onClick={() => setStatusFilter(s)}>
              {s} ({s === "all" ? agents.length : stats[s as keyof typeof stats]})
            </Button>
          ))}
        </div>
      </div>

      {/* Agents Grid */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((agent, i) => (
            <motion.div key={agent.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="hover:border-primary/20 transition-all hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="h-10 w-10 rounded-xl bg-secondary/50 flex items-center justify-center text-xl border border-border/20">{agent.emoji}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground truncate">{agent.display_name}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">{agent.role}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">{teams.find(t => t.id === agent.team_id)?.name || "Unassigned"}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px] font-bold uppercase px-1.5 py-0">{(agent.model_name || "default").split("-").slice(0, 2).join(" ")}</Badge>
                      <StatusDot status={agent.status} />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6"><Settings2 className="h-3 w-3 text-muted-foreground" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        {agent.status === "paused" ? <Play className="h-3 w-3 text-emerald-500" /> : <Pause className="h-3 w-3 text-muted-foreground" />}
                      </Button>
                    </div>
                  </div>
                  {agent.skill_id && <Badge variant="secondary" className="text-[9px] px-1.5 py-0 mt-3">{agent.skill_id}</Badge>}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bot className="h-12 w-12 text-muted-foreground/20 mb-4" />
            <p className="text-sm font-semibold text-foreground/60">No agents found</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = { running: "bg-emerald-400", idle: "bg-gray-400", paused: "bg-amber-400" };
  return <div className="flex items-center gap-1.5"><div className={`h-2 w-2 rounded-full ${colors[status] || colors.idle}`} /><span className="text-[9px] font-bold uppercase text-muted-foreground">{status}</span></div>;
}
