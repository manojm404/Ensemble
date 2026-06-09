import * as React from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  Clock3,
  Flame,
  HeartPulse,
  Play,
  ShieldAlert,
  Users,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { StatTile } from "@/components/glass/Primitives";
import { StateView, StatusChip } from "@/components/glass/StateView";
import { companyApi, workflowApi } from "@/lib/adapters";
import type { CompanyTask } from "@/lib/adapters/types";

export const Route = createFileRoute("/_authenticated/companies/$id/")({
  component: CompanyDashboard,
});

function CompanyDashboard() {
  const { id } = useParams({ from: "/_authenticated/companies/$id/" });
  const qc = useQueryClient();

  const company = useQuery({
    queryKey: ["company", id],
    queryFn: () => companyApi.getById(id),
  });
  const operations = useQuery({
    queryKey: ["company-operations", id],
    queryFn: () => companyApi.getOperations(id),
  });
  const tasks = useQuery({
    queryKey: ["company-tasks", id],
    queryFn: () => companyApi.listTasks(id),
  });
  const agents = useQuery({
    queryKey: ["company-agents", id],
    queryFn: () => companyApi.getAgents(id),
  });

  const activeAgents = agents.data?.filter((agent) => !["disabled", "fired"].includes(agent.status)) ?? [];
  const recentTasks = operations.data?.recent.issues ?? tasks.data ?? [];
  const recentActivity = operations.data?.recent.activity ?? [];
  const recentRuns = operations.data?.recent.runs ?? [];
  const completedTasks = recentTasks.filter((task) => ["completed", "completed_passed"].includes(task.status));
  const readyTasks = recentTasks.filter((task) => task.status === "ready");

  const runTask = useMutation({
    mutationFn: async (task: CompanyTask) => {
      const prepared = await companyApi.prepareTaskRun(id, task.id);
      const run = await workflowApi.run(prepared.workflow_id, {
        taskId: task.id,
        companyId: id,
        initialInput: prepared.initial_input,
        graph: prepared.graph,
      });
      return run;
    },
    onSuccess: (run) => {
      toast.success(`Task run started: ${run.run_id}`);
      qc.invalidateQueries({ queryKey: ["company-operations", id] });
      qc.invalidateQueries({ queryKey: ["company-tasks", id] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not run task"),
  });

  const healthScore = operations.data?.counts.health_score ?? 0;
  const passRate = operations.data?.counts.evaluation_pass_rate ?? 0;
  const openWork = operations.data?.counts.open_issues ?? 0;
  const blockedItems = operations.data?.counts.blocked_items ?? 0;

  return (
    <StateView
      loading={operations.isLoading}
      error={operations.error}
      skeleton={<CompanyDashboardSkeleton />}
    >
      <div className="space-y-6">
        <GlassPanel padding="lg" className="overflow-hidden">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
            <div>
              <div className="text-[10px] font-mono tracking-widest text-rim uppercase mb-2">
                Live company pulse
              </div>
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-chrome">
                {company.data?.name ?? operations.data?.company.name}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
                {company.data?.mission ?? operations.data?.company.mission}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <GlassButton asChild variant="glass">
                  <Link to="/companies/$id/tasks" params={{ id }}>
                    Open task board <ArrowRight className="size-3.5" />
                  </Link>
                </GlassButton>
                <GlassButton asChild variant="ghost">
                  <Link to="/companies/$id/agents" params={{ id }}>
                    Review workforce
                  </Link>
                </GlassButton>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard
                icon={<HeartPulse className="size-4 text-rim" />}
                label="Health score"
                value={`${healthScore}%`}
                hint={`Pass rate ${passRate.toFixed(1)}%`}
              />
              <MetricCard
                icon={<ShieldAlert className="size-4 text-amber-300" />}
                label="Blocked work"
                value={blockedItems}
                hint={`${operations.data?.counts.approvals_waiting ?? 0} approvals waiting`}
              />
              <MetricCard
                icon={<BriefcaseBusiness className="size-4 text-rim" />}
                label="Open work"
                value={openWork}
                hint={`${completedTasks.length} completed recently`}
              />
              <MetricCard
                icon={<Activity className="size-4 text-rim" />}
                label="Active agents"
                value={`${operations.data?.counts.agent_health.running ?? 0}/${operations.data?.counts.agents ?? activeAgents.length}`}
                hint={`${operations.data?.counts.agent_health.idle ?? 0} idle, ${operations.data?.counts.agent_health.paused ?? 0} paused`}
              />
            </div>
          </div>
        </GlassPanel>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            label="Teams"
            value={operations.data?.counts.teams ?? operations.data?.company.team_count ?? company.data?.teams ?? 0}
            hint="company structure"
          />
          <StatTile
            label="Agents"
            value={operations.data?.counts.agents ?? operations.data?.company.agent_count ?? company.data?.agents ?? 0}
            hint="live workforce"
          />
          <StatTile
            label="Open issues"
            value={operations.data?.counts.issues.total ?? operations.data?.company.issue_count ?? tasks.data?.length ?? 0}
            hint="tracked in company"
          />
          <StatTile
            label="Failed runs"
            value={operations.data?.counts.failed_runs ?? 0}
            hint="requires attention"
          />
        </div>

        <div className="grid xl:grid-cols-[1.4fr_0.9fr] gap-4">
          <GlassPanel padding="lg">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Clock3 className="size-4 text-rim" />
                <div className="text-sm font-medium">Current queue</div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{readyTasks.length} ready</span>
                <span>·</span>
                <span>{openWork} open</span>
              </div>
            </div>

            {recentTasks.length > 0 ? (
              <ul className="divide-y divide-white/5">
                {recentTasks.slice(0, 6).map((task) => (
                  <li key={task.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          to="/companies/$id/tasks"
                          params={{ id }}
                          className="font-medium text-sm hover:text-rim transition-colors"
                        >
                          {task.title}
                        </Link>
                        <StatusChip status={task.status} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {task.route?.routing_reason ?? task.prompt}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {task.status === "ready" && (
                        <GlassButton
                          size="sm"
                          variant="rim"
                          onClick={() => runTask.mutate(task)}
                          disabled={runTask.isPending}
                        >
                          <Play className="size-3.5" /> Run
                        </GlassButton>
                      )}
                      {task.workflow_id && (
                        <GlassButton asChild size="sm" variant="ghost">
                          <Link to="/workflows/$id" params={{ id: task.workflow_id }}>
                            Workflow
                          </Link>
                        </GlassButton>
                      )}
                      {task.run_id && (
                        <GlassButton asChild size="sm" variant="glass">
                          <Link to="/runs/$runId" params={{ runId: task.run_id }}>
                            Output
                          </Link>
                        </GlassButton>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground py-10 text-center">
                No company tasks yet. Create one in the Tasks tab to route real work.
              </p>
            )}
          </GlassPanel>

          <div className="space-y-4">
            <GlassPanel padding="lg">
              <div className="flex items-center gap-2 mb-4">
                <Users className="size-4 text-rim" />
                <div className="text-sm font-medium">Agent performance</div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <MiniMetric label="Running" value={operations.data?.counts.agent_health.running ?? 0} />
                <MiniMetric label="Idle" value={operations.data?.counts.agent_health.idle ?? 0} />
                <MiniMetric label="Paused" value={operations.data?.counts.agent_health.paused ?? 0} />
              </div>
              <ul className="space-y-2">
                {activeAgents.slice(0, 5).map((agent) => (
                  <li key={agent.id} className="rounded-xl glass-inset px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{agent.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{agent.role}</div>
                      </div>
                      <StatusChip status={agent.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </GlassPanel>

            <GlassPanel padding="lg">
              <div className="flex items-center gap-2 mb-4">
                <WorkflowIcon className="size-4 text-rim" />
                <div className="text-sm font-medium">Recent runs</div>
              </div>
              {recentRuns.length > 0 ? (
                <ul className="space-y-3">
                  {recentRuns.slice(0, 4).map((run) => (
                    <li key={run.run_id} className="rounded-xl glass-inset px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-mono text-foreground/85 truncate">
                            {run.run_id.slice(0, 12)}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {run.workflow_id ?? "Workflow pending"}
                          </div>
                        </div>
                        <StatusChip status={run.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No runs yet. Start a task to generate live execution telemetry.
                </p>
              )}
            </GlassPanel>
          </div>
        </div>

        <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-4">
          <GlassPanel padding="lg">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="size-4 text-rim" />
              <div className="text-sm font-medium">Recent activity</div>
            </div>
            {recentActivity.length > 0 ? (
              <ul className="divide-y divide-white/5">
                {recentActivity.slice(0, 8).map((entry) => (
                  <li key={entry.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        <span className="font-mono text-rim">{entry.action}</span>{" "}
                        <span className="text-muted-foreground">·</span>{" "}
                        <span className="text-foreground/85">{entry.resource}</span>
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground">
                        {entry.actor} · {new Date(entry.at).toLocaleString()}
                      </div>
                    </div>
                    {entry.cost_usd != null && (
                      <div className="font-mono text-[11px] text-muted-foreground tabular-nums">
                        ${entry.cost_usd.toFixed(2)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground py-10 text-center">
                Activity will appear here as agents run tasks and update the company.
              </p>
            )}
          </GlassPanel>

          <GlassPanel padding="lg">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="size-4 text-rim" />
              <div className="text-sm font-medium">Performance notes</div>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                The company view now uses the live operations summary, so these numbers come from
                the backend rather than placeholder counts.
              </p>
              <p>
                Tasks are ready to run only when routing has selected hired agents. If a task is
                blocked, fix the workforce gap in the Tasks tab before trying again.
              </p>
              <p>
                Recent activity and run history give you a quick read on whether the company is
                executing, stalling, or accumulating failed work.
              </p>
            </div>
          </GlassPanel>
        </div>
      </div>
    </StateView>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-chrome">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-chrome tabular-nums">{value}</div>
    </div>
  );
}

function CompanyDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <GlassPanel padding="lg">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <div>
            <div className="h-3 w-32 rounded-full bg-white/10 mb-4" />
            <div className="h-10 w-80 max-w-full rounded-2xl bg-white/10 mb-4" />
            <div className="h-4 w-[min(620px,100%)] rounded-full bg-white/10" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 rounded-2xl bg-white/[0.04] border border-white/10" />
            ))}
          </div>
        </div>
      </GlassPanel>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-32 rounded-2xl bg-white/[0.04] border border-white/10" />
        ))}
      </div>
      <div className="grid xl:grid-cols-[1.4fr_0.9fr] gap-4">
        <div className="h-[420px] rounded-2xl bg-white/[0.04] border border-white/10" />
        <div className="space-y-4">
          <div className="h-[200px] rounded-2xl bg-white/[0.04] border border-white/10" />
          <div className="h-[200px] rounded-2xl bg-white/[0.04] border border-white/10" />
        </div>
      </div>
      <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-4">
        <div className="h-[360px] rounded-2xl bg-white/[0.04] border border-white/10" />
        <div className="h-[360px] rounded-2xl bg-white/[0.04] border border-white/10" />
      </div>
    </div>
  );
}
