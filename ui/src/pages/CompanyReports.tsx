import { useParams } from "react-router-dom";
import { CheckCircle2, AlertTriangle, Bot, TrendingUp, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useCompanyContext } from "@/lib/company-context";
import { getCompanyById, getIssuesByCompany, getAgentsByCompany, getTeamsByCompany } from "@/lib/company-data";

export default function CompanyReports() {
  const { id } = useParams<{ id: string }>();
  const { currentCompany } = useCompanyContext();

  const company = getCompanyById(id || currentCompany?.id || "");
  if (!company) return <div className="flex items-center justify-center h-full text-muted-foreground">No company selected</div>;

  const issues = getIssuesByCompany(company.id);
  const agents = getAgentsByCompany(company.id);
  const teams = getTeamsByCompany(company.id);

  const completed = issues.filter(i => i.status === "completed").length;
  const failed = issues.filter(i => i.status === "failed").length;
  const inProgress = issues.filter(i => i.status === "in_progress").length;
  const total = issues.length || 1;
  const successRate = Math.round((completed / total) * 100);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-8 py-6 border-b border-border/40 bg-card/30 backdrop-blur-sm">
        <h1 className="text-xl font-bold text-foreground">{company.emoji} {company.name}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Reports & Analytics</p>
      </div>

      <div className="flex-1 p-8">
        {/* Stat Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard icon={CheckCircle2} label="Resolved" value={completed.toString()} color="text-emerald-500" />
          <StatCard icon={AlertTriangle} label="Failed" value={failed.toString()} color="text-red-500" />
          <StatCard icon={TrendingUp} label="Success Rate" value={`${successRate}%`} color="text-blue-500" />
          <StatCard icon={Bot} label="Active Agents" value={agents.length.toString()} color="text-purple-500" />
        </div>

        {/* Department Breakdown */}
        <Card className="border-border/20 mb-6">
          <CardContent className="p-6">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Teams Performance</h3>
            <div className="space-y-3">
              {teams.map(team => {
                const teamIssues = issues.filter(i => i.teamId === team.id);
                const teamCompleted = teamIssues.filter(i => i.status === "completed").length;
                const pct = teamIssues.length > 0 ? Math.round((teamCompleted / teamIssues.length) * 100) : 0;
                return (
                  <div key={team.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground">{team.emoji} {team.name}</span>
                      <span className="text-[10px] text-muted-foreground">{teamCompleted}/{teamIssues.length} issues</span>
                    </div>
                    <div className="h-2 bg-secondary/50 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {teams.length === 0 && <p className="text-xs text-muted-foreground/40 text-center py-4">No teams yet</p>}
            </div>
          </CardContent>
        </Card>

        {/* Agent Performance */}
        <Card className="border-border/20">
          <CardContent className="p-6">
            <h3 className="text-sm font-bold text-foreground mb-4">Agent Performance</h3>
            <div className="space-y-2">
              {agents.filter(a => !a.isCEO).sort((a, b) => b.issuesCompleted - a.issuesCompleted).map(agent => (
                <div key={agent.id} className="flex items-center gap-3">
                  <span className="text-lg">{agent.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">{agent.name}</p>
                    <p className="text-[10px] text-muted-foreground">{agent.teamName}</p>
                  </div>
                  <span className="text-xs font-bold text-foreground">{agent.issuesCompleted} resolved</span>
                </div>
              ))}
              {agents.filter(a => !a.isCEO).length === 0 && <p className="text-xs text-muted-foreground/40 text-center py-4">No agents yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <Card className="border-border/20 bg-card/50">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg bg-secondary/50 flex items-center justify-center ${color}`}><Icon className="h-4 w-4" /></div>
        <div><p className="text-xl font-bold text-foreground">{value}</p><p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{label}</p></div>
      </CardContent>
    </Card>
  );
}
