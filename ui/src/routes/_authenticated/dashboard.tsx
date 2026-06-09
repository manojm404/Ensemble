import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowUpRight, Activity, Workflow as WorkflowIcon, AlertTriangle } from "lucide-react";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { PageHeader, StatTile } from "@/components/glass/Primitives";
import { StatusChip } from "@/components/glass/StateView";
import { useAuth } from "@/lib/auth";
import { dashboardApi } from "@/lib/adapters";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — 0101" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();

  const stats = useQuery({ queryKey: ["dash-stats"], queryFn: () => dashboardApi.getStats() });
  const recentWorkflows = useQuery({
    queryKey: ["dash-workflows"],
    queryFn: () => dashboardApi.getRecentWorkflows(),
  });
  const recentRuns = useQuery({
    queryKey: ["dash-runs"],
    queryFn: () => dashboardApi.getRecentRuns(),
  });
  const attention = useQuery({
    queryKey: ["dash-attention"],
    queryFn: () => dashboardApi.getAttention(),
  });

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 5
      ? "Up late,"
      : h < 12
        ? "Good morning,"
        : h < 18
          ? "Good afternoon,"
          : "Good evening,";
  })();

  const firstName =
    user?.full_name?.split(" ")[0] ??
    user?.display_name ??
    user?.email?.split("@")[0] ??
    "operator";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <PageHeader
        kicker="0101 · Operations"
        title={`${greeting} ${firstName}.`}
        subtitle="Every workflow you ship, governed."
        actions={
          <GlassButton asChild variant="rim">
            <Link to="/workflows">
              New workflow <ArrowUpRight />
            </Link>
          </GlassButton>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="Runs · 24h" value={stats.data?.runs_24h ?? "—"} hint="all workspaces" />
        <StatTile
          label="Spend · 24h"
          value={`$${(stats.data?.cost_24h_usd ?? 0).toFixed(2)}`}
          hint="across all runs"
        />
        <StatTile
          label="Eval pass-rate"
          value={stats.data ? `${stats.data.pass_rate.toFixed(1)}%` : "—"}
          hint="all-time"
        />
        <StatTile
          label="Open approvals"
          value={stats.data?.open_approvals ?? 0}
          hint="awaiting review"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <GlassPanel padding="lg" className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <WorkflowIcon className="size-4 text-rim" />
              <div className="text-sm font-medium">Recent workflows</div>
            </div>
            <Link to="/workflows" className="text-xs text-rim hover:underline">
              All →
            </Link>
          </div>
          {recentWorkflows.data && recentWorkflows.data.length > 0 ? (
            <ul className="divide-y divide-white/5">
              {recentWorkflows.data.map((wf) => (
                <li key={wf.id} className="py-3 flex items-center justify-between gap-3">
                  <Link
                    to="/workflows/$id"
                    params={{ id: wf.id }}
                    className="text-sm hover:text-rim transition-colors min-w-0 truncate"
                  >
                    {wf.name}
                  </Link>
                  <div className="flex items-center gap-3 shrink-0">
                    {wf.company_name && (
                      <span className="text-[11px] font-mono text-muted-foreground hidden md:inline">
                        {wf.company_name}
                      </span>
                    )}
                    <StatusChip status={wf.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No workflows yet.</p>
          )}
        </GlassPanel>

        <GlassPanel padding="lg" className="border-amber-400/15">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="size-4 text-amber-300" />
            <div className="text-sm font-medium">Needs attention</div>
            <span className="ml-auto font-mono text-[10px] tracking-widest uppercase text-amber-300/80">
              {attention.data?.length ?? 0}
            </span>
          </div>
          {attention.data && attention.data.length > 0 ? (
            <ul className="space-y-3">
              {attention.data.map((r) => (
                <li key={r.run_id} className="text-sm">
                  <Link to="/runs/$runId" params={{ runId: r.run_id }} className="block group">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="truncate group-hover:text-rim transition-colors">
                        {r.workflow_name}
                      </span>
                      <StatusChip status={r.status} />
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground">
                      {r.run_id} · ${r.cost_usd?.toFixed(2) ?? "0.00"}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">All clear.</p>
          )}
        </GlassPanel>
      </div>

      <GlassPanel padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="size-4 text-rim" />
          <div className="text-sm font-medium">Live activity</div>
        </div>
        {recentRuns.data && recentRuns.data.length > 0 ? (
          <ul className="grid md:grid-cols-2 gap-x-6 gap-y-3">
            {recentRuns.data.map((r) => (
              <li key={r.run_id} className="flex items-start gap-3">
                <div className="mt-1 size-1.5 rounded-full bg-rim shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate flex items-center gap-2">
                    <Link
                      to="/runs/$runId"
                      params={{ runId: r.run_id }}
                      className="font-mono text-foreground/80 hover:text-rim"
                    >
                      {r.run_id}
                    </Link>
                    <StatusChip status={r.status} />
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground">
                    {r.workflow_name} · {new Date(r.started_at).toLocaleTimeString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">No runs yet.</p>
        )}
      </GlassPanel>
    </motion.div>
  );
}
