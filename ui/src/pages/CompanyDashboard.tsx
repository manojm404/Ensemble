import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, Users, Bot, FolderTree, Plus, ChevronRight, TrendingUp, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCompanyContext } from "@/lib/company-context";
import { getCompanyById, getTeamsByCompany, getAgentsByCompany, getIssuesByCompany, getActivityByCompany, getCEO } from "@/lib/company-data";

export default function CompanyDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentCompany, setCurrentCompanyId } = useCompanyContext();

  const company = getCompanyById(id || currentCompany?.id || "") || currentCompany;
  const teams = getTeamsByCompany(company?.id || "");
  const agents = getAgentsByCompany(company?.id || "");
  const issues = getIssuesByCompany(company?.id || "");
  const activity = getActivityByCompany(company?.id || "");
  const ceo = getCEO(company?.id || "");

  if (!company) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No company selected</h3>
        <Button onClick={() => navigate("/companies")}>Go to Companies</Button>
      </div>
    );
  }

  const completedIssues = issues.filter(i => i.status === "completed").length;
  const inProgressIssues = issues.filter(i => i.status === "in_progress").length;
  const failedIssues = issues.filter(i => i.status === "failed").length;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-border/40 bg-card/30 backdrop-blur-sm">
        <div className="flex items-center gap-4 min-w-0">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl border border-primary/20">
            {company.emoji}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground truncate tracking-tight">{company.name}</h1>
            {company.mission && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5 font-medium">{company.mission}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider gap-1.5 px-2 py-0.5 bg-secondary/50">
            <Users className="h-3 w-3" /> Board
          </Badge>
          <Button size="sm" className="gap-2 h-8" onClick={() => navigate(`/company/${company.id}/issues`)}>
            <Plus className="h-3.5 w-3.5" /> Add Issue
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4 px-8 py-6">
        <StatCard icon={Bot} label="Agents" value={agents.length.toString()} color="text-blue-500" />
        <StatCard icon={FolderTree} label="Teams" value={teams.length.toString()} color="text-purple-500" />
        <StatCard icon={CheckCircle2} label="Resolved" value={completedIssues.toString()} color="text-emerald-500" />
        <StatCard icon={TrendingUp} label="In Progress" value={inProgressIssues.toString()} color="text-amber-500" />
      </div>

      <Separator className="mx-8" />

      {/* Main Content: 3-column layout */}
      <div className="flex-1 grid grid-cols-3 gap-6 px-8 py-6 min-h-0">
        {/* Column 1: Org Hierarchy (CEO → Teams) */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Organization</h3>

          {/* CEO Card */}
          {ceo && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-lg border border-primary/30">
                    {ceo.emoji}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">{ceo.name}</p>
                    <p className="text-[11px] text-muted-foreground">{ceo.role}</p>
                  </div>
                  <Badge className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0 bg-primary text-primary-foreground">CEO</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Teams */}
          <div className="space-y-2">
            {teams.map((team) => (
              <Card key={team.id} className="cursor-pointer hover:border-primary/20 transition-colors" onClick={() => navigate(`/company/${company.id}/teams/${team.id}`)}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{team.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">{team.name}</p>
                      <p className="text-[10px] text-muted-foreground">{team.agentCount} agents · {team.completedIssueCount} done</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {teams.length === 0 && (
            <p className="text-xs text-muted-foreground/40 text-center py-4">No teams yet</p>
          )}
        </div>

        {/* Column 2: Recent Issues */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Recent Issues</h3>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2 pr-4">
              {issues.length === 0 && (
                <p className="text-xs text-muted-foreground/40 text-center py-8">No issues yet — add one to get started</p>
              )}
              {issues.slice(0, 10).map((issue) => (
                <Card key={issue.id} className="hover:border-border/40 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-sm mt-0.5">{issue.agentEmoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{issue.title}</p>
                        <p className="text-[10px] text-muted-foreground">{issue.teamName} · {issue.created}</p>
                      </div>
                      <StatusBadge status={issue.status} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Column 3: Activity Feed */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Activity</h3>
          <ScrollArea className="h-[400px]">
            <div className="space-y-3 pr-4">
              {activity.slice(0, 15).map((event) => (
                <motion.div key={event.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-3">
                  <ActivityDot type={event.type} />
                  <div className="min-w-0">
                    <p className="text-[11px] text-foreground">{event.action}</p>
                    <p className="text-[10px] text-muted-foreground/60">{event.time}</p>
                  </div>
                </motion.div>
              ))}
              {activity.length === 0 && (
                <p className="text-xs text-muted-foreground/40 text-center py-8">No activity yet</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Footer Nav */}
      <div className="flex items-center justify-between px-8 py-4 border-t border-border/30 bg-card/20">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className="text-xs gap-2" onClick={() => navigate(`/company/${company.id}/teams`)}>
            <FolderTree className="h-3.5 w-3.5" /> Teams
          </Button>
          <Button variant="ghost" size="sm" className="text-xs gap-2" onClick={() => navigate(`/company/${company.id}/agents`)}>
            <Bot className="h-3.5 w-3.5" /> Agents
          </Button>
          <Button variant="ghost" size="sm" className="text-xs gap-2" onClick={() => navigate(`/company/${company.id}/issues`)}>
            <Plus className="h-3.5 w-3.5" /> Issues
          </Button>
          <Button variant="ghost" size="sm" className="text-xs gap-2" onClick={() => navigate(`/company/${company.id}/reports`)}>
            <TrendingUp className="h-3.5 w-3.5" /> Reports
          </Button>
        </div>
        <span className="text-[10px] text-muted-foreground/40 uppercase tracking-widest font-bold">Board Member View</span>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <Card className="border-border/30 bg-card/50">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg bg-secondary/50 flex items-center justify-center ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xl font-bold text-foreground">{value}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    in_progress: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    queued: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    failed: "bg-red-500/10 text-red-500 border-red-500/20",
    blocked: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  };
  const labels: Record<string, string> = {
    completed: "Done",
    in_progress: "Running",
    queued: "Queued",
    failed: "Failed",
    blocked: "Blocked",
  };
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${colors[status] || colors.queued}`}>
      {labels[status] || status}
    </span>
  );
}

function ActivityDot({ type }: { type: string }) {
  const colors: Record<string, string> = {
    agent: "bg-blue-400",
    issue: "bg-emerald-400",
    alert: "bg-red-400",
    deploy: "bg-purple-400",
    member: "bg-amber-400",
    system: "bg-gray-400",
  };
  return <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${colors[type] || colors.system}`} />;
}
