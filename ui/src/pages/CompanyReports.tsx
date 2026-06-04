import { useParams, useNavigate } from "react-router-dom";
import { CheckCircle2, AlertTriangle, Bot, TrendingUp, BarChart3, Activity, Clock3, ShieldCheck, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCompanyContext } from "@/lib/company-context";
import { getCompanyById, getIssuesByCompany, getAgentsByCompany, getTeamsByCompany, getActivityByCompany, getCompanyOperations } from "@/lib/company-data";
import { ChevronLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useScrollMemory } from "@/lib/use-scroll-memory";

export default function CompanyReports() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentCompany } = useCompanyContext();

  const companyId = id || currentCompany?.id || "";
  const company = getCompanyById(companyId) || currentCompany;
  const scrollRef = useScrollMemory(`esemble_scroll_company_${companyId || "unknown"}_reports`);
  if (!company) return <div className="flex items-center justify-center h-full text-muted-foreground">No company selected</div>;

  const issues = getIssuesByCompany(company.id);
  const agents = getAgentsByCompany(company.id);
  const teams = getTeamsByCompany(company.id);
  const activity = getActivityByCompany(company.id);
  const { data: operations } = useQuery({
    queryKey: ["companyOperations", company.id],
    queryFn: () => getCompanyOperations(company.id),
    enabled: !!company.id,
    refetchInterval: 15000,
  });

  const operationCounts = operations?.counts;
  const operationIssues = operationCounts?.issues;
  const operationWorkflows = operationCounts?.workflows;
  const completed = operationIssues?.completed ?? issues.filter(i => i.status === "completed").length;
  const failed = operationIssues?.failed ?? issues.filter(i => i.status === "failed").length;
  const inProgress = operationIssues?.running ?? issues.filter(i => i.status === "in_progress").length;
  const open = operationCounts?.open_issues ?? issues.filter(i => ["queued", "in_progress", "blocked"].includes(i.status)).length;
  const blocked = operationIssues?.blocked ?? issues.filter(i => i.status === "blocked").length;
  const total = issues.length || 1;
  const successRate = operationCounts?.evaluation_pass_rate ?? Math.round((completed / total) * 100);
  const liveActivity = operations?.recent?.activity?.length ? operations.recent.activity : activity;
  const latestActivity = liveActivity?.[0];
  const healthScore = operationCounts?.health_score ?? (issues.length === 0 ? 100 : Math.max(40, Math.min(100, 100 - (failed * 18) - (blocked * 12) - (inProgress * 3))));
  const failedRuns = operationCounts?.failed_runs ?? 0;
  const approvalsWaiting = operationCounts?.approvals_waiting ?? 0;

  const exportReport = () => {
    const report = {
      company,
      issues,
      agents,
      teams,
      activity,
      operations,
      generated_at: new Date().toISOString(),
      summary: {
        open_issues: open,
        completed_issues: completed,
        failed_issues: failed,
        blocked_issues: blocked,
        failed_runs: failedRuns,
        approvals_waiting: approvalsWaiting,
        active_workflows: operationWorkflows?.running ?? 0,
        health_score: healthScore,
        success_rate: successRate,
      },
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${company.name.toLowerCase().replace(/\s+/g, "-")}-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      <div className="border-b border-border/40 bg-card/30 px-8 py-6 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" className="-ml-2 mb-3 gap-2 rounded-full border border-border/40 bg-background/70" onClick={() => navigate(`/company/${companyId}`)}>
              <ChevronLeft className="h-4 w-4" />
              Back to workspace
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold text-foreground">{company.emoji} {company.name}</h1>
              <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600">Health {healthScore}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Reports & Analytics</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/company/${companyId}`)}>
              <ShieldCheck className="h-3.5 w-3.5" />
              Workspace
            </Button>
            <Button size="sm" className="gap-2" onClick={exportReport}>
              <Download className="h-3.5 w-3.5" />
              Export report
            </Button>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-6 overflow-auto p-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={CheckCircle2} label="Resolved" value={completed.toString()} color="text-emerald-500" />
          <StatCard icon={AlertTriangle} label="Failed Runs" value={failedRuns.toString()} color="text-red-500" />
          <StatCard icon={TrendingUp} label="Success Rate" value={`${successRate}%`} color="text-blue-500" />
          <StatCard icon={Bot} label="Active Agents" value={(operationCounts?.agents ?? agents.length).toString()} color="text-purple-500" />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-border/20 bg-card/70">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Activity className="h-4 w-4" />
                  Operational summary
                </h3>
                <Badge variant="secondary" className="border border-border/50 bg-background/70 text-muted-foreground">
                  {open} open · {blocked} blocked
                </Badge>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Latest directive</p>
                  <p className="mt-2 text-sm font-medium text-foreground">{company.mission || latestActivity?.message || "No directive captured yet."}</p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Latest activity</p>
                  <p className="mt-2 text-sm font-medium text-foreground">{latestActivity?.message || latestActivity?.action || "No recent activity"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{latestActivity?.created_at || latestActivity?.time ? new Date(latestActivity.created_at || latestActivity.time).toLocaleString() : "Waiting for audit events"}</p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Health score</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">{healthScore}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Derived from failed, blocked, paused, and active operational signals.</p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Workflow readiness</p>
                  <p className="mt-2 text-sm font-medium text-foreground">{operationCounts?.teams ?? teams.length} teams · {operationCounts?.agents ?? agents.length} agents</p>
                  <p className="mt-1 text-xs text-muted-foreground">{operationWorkflows?.running ?? 0} active runs · {approvalsWaiting} approvals waiting.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/20 bg-card/70">
            <CardContent className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Clock3 className="h-4 w-4" />
                Recent activity
              </h3>
              <div className="mt-4 space-y-3">
                {liveActivity.slice(0, 4).map((item: any) => (
                  <div key={item.id} className="rounded-2xl border border-border/50 bg-background/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground">{item.message || item.action}</p>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.message || "Activity captured from the workspace audit trail."}</p>
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {item.created_at || item.time ? new Date(item.created_at || item.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "now"}
                      </span>
                    </div>
                  </div>
                ))}
                {liveActivity.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border/50 bg-background/60 p-8 text-center text-xs text-muted-foreground">
                    No audit events yet. Run workflows or create issues to populate the report.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <Card className="border-border/20 bg-card/70">
          <CardContent className="p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground"><BarChart3 className="h-4 w-4" /> Teams performance</h3>
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

        <Card className="border-border/20 bg-card/70">
          <CardContent className="p-6">
            <h3 className="mb-4 text-sm font-bold text-foreground">Agent performance</h3>
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
