import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BriefcaseBusiness, Flame, Plus, Search, UserRoundCheck } from "lucide-react";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { EmptyState, Skeleton } from "@/components/glass/Primitives";
import { StatusChip } from "@/components/glass/StateView";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { companyApi, agentApi } from "@/lib/adapters";
import type { Agent } from "@/lib/adapters/types";

export const Route = createFileRoute("/_authenticated/companies/$id/agents")({
  head: () => ({ meta: [{ title: "Workforce - 0101" }] }),
  component: AgentsPage,
});

function AgentsPage() {
  const { id: companyId } = useParams({ from: "/_authenticated/companies/$id/agents" });
  const qc = useQueryClient();
  const [hireOpen, setHireOpen] = React.useState(false);

  const agents = useQuery({
    queryKey: ["company-agents", companyId],
    queryFn: () => companyApi.getAgents(companyId),
  });
  const departments = useQuery({
    queryKey: ["company-teams", companyId],
    queryFn: () => companyApi.getTeams(companyId),
  });

  const fire = useMutation({
    mutationFn: (agentId: string) => companyApi.fireAgent(companyId, agentId),
    onSuccess: () => {
      toast.success("Agent fired. History remains intact.");
      qc.invalidateQueries({ queryKey: ["company-agents", companyId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not fire agent"),
  });

  const activeAgents = agents.data?.filter((agent) => agent.status !== "fired") ?? [];
  const firedAgents = agents.data?.filter((agent) => agent.status === "fired") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-chrome">Workforce</h2>
          <p className="text-sm text-muted-foreground">
            Hire agents into this company, assign them to departments, and fire them without losing
            audit history.
          </p>
        </div>
        <Dialog open={hireOpen} onOpenChange={setHireOpen}>
          <DialogTrigger asChild>
            <GlassButton variant="rim">
              <Plus /> Hire agent
            </GlassButton>
          </DialogTrigger>
          <HireAgentDialog
            companyId={companyId}
            onHired={() => {
              setHireOpen(false);
              qc.invalidateQueries({ queryKey: ["company-agents", companyId] });
              qc.invalidateQueries({ queryKey: ["company-agents-count", companyId] });
            }}
          />
        </Dialog>
      </div>

      {agents.isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : activeAgents.length > 0 ? (
        <div className="space-y-5">
          {(departments.data ?? [{ id: "unassigned", name: "Unassigned", agents: 0 }]).map(
            (department) => {
              const departmentAgents = activeAgents.filter((agent) =>
                department.id === "unassigned" ? !agent.team_id : agent.team_id === department.id,
              );
              if (!departmentAgents.length) return null;
              return (
                <section key={department.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <BriefcaseBusiness className="size-4 text-rim" />
                    <h3 className="text-sm font-medium">{department.name}</h3>
                    <span className="text-xs text-muted-foreground">
                      {departmentAgents.length} hired
                    </span>
                  </div>
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {departmentAgents.map((agent) => (
                      <AgentCard
                        key={agent.id}
                        agent={agent}
                        onFire={() => {
                          if (
                            confirm(`Fire ${agent.name}? Their previous work will stay in history.`)
                          ) {
                            fire.mutate(agent.id);
                          }
                        }}
                      />
                    ))}
                  </div>
                </section>
              );
            },
          )}
        </div>
      ) : (
        <EmptyState
          title="No active agents"
          body="Hire from the catalog before assigning CEO tasks. Fired agents stay in history, but cannot receive new work."
          action={
            <GlassButton variant="rim" onClick={() => setHireOpen(true)}>
              <Plus /> Hire agent
            </GlassButton>
          }
        />
      )}

      {firedAgents.length > 0 && (
        <GlassPanel padding="lg">
          <div className="text-sm font-medium mb-3">Former agents</div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {firedAgents.map((agent) => (
              <div key={agent.id} className="rounded-xl glass-inset p-3 opacity-70">
                <div className="text-sm font-medium">{agent.name}</div>
                <div className="text-xs text-muted-foreground">{agent.role}</div>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}
    </div>
  );
}

function AgentCard({ agent, onFire }: { agent: Agent; onFire: () => void }) {
  return (
    <GlassPanel padding="lg">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="font-mono text-[10px] tracking-widest text-rim uppercase mb-1">
            {agent.role}
          </div>
          <h3 className="text-base font-semibold tracking-tight text-chrome">{agent.name}</h3>
        </div>
        <StatusChip status={agent.status} />
      </div>
      {agent.description && (
        <p className="text-sm text-muted-foreground mb-4 line-clamp-3">{agent.description}</p>
      )}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {agent.capabilities.slice(0, 5).map((capability) => (
          <span
            key={capability}
            className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/5 text-[10px] font-mono uppercase tracking-wider text-foreground/70"
          >
            {capability}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <span className="font-mono text-[10px] text-muted-foreground truncate">
          {agent.skill_source}
        </span>
        <GlassButton size="sm" variant="ghost" onClick={onFire}>
          <Flame /> Fire
        </GlassButton>
      </div>
    </GlassPanel>
  );
}

function HireAgentDialog({ companyId, onHired }: { companyId: string; onHired: () => void }) {
  const [query, setQuery] = React.useState("");
  const [skillId, setSkillId] = React.useState("");
  const [teamId, setTeamId] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [role, setRole] = React.useState("");

  const catalog = useQuery({
    queryKey: ["hire-catalog", query],
    queryFn: () => agentApi.list(query),
  });
  const departments = useQuery({
    queryKey: ["company-teams", companyId],
    queryFn: () => companyApi.getTeams(companyId),
  });

  React.useEffect(() => {
    const selected = catalog.data?.find((agent) => agent.id === skillId);
    if (selected && !displayName) setDisplayName(selected.name);
    if (selected && !role) setRole(selected.role);
  }, [catalog.data, displayName, role, skillId]);

  const selectedSkill = catalog.data?.find((agent) => agent.id === skillId);

  const hire = useMutation({
    mutationFn: () =>
      companyApi.hireAgent(companyId, {
        skill_id: skillId,
        skill_name: selectedSkill?.name ?? displayName,
        team_id: teamId || undefined,
        display_name: displayName || undefined,
        role: role || undefined,
      }),
    onSuccess: () => {
      toast.success("Agent hired.");
      onHired();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not hire agent"),
  });

  const filtered = catalog.data ?? [];

  return (
    <DialogContent className="glass-strong border-white/10 max-w-2xl">
      <DialogHeader>
        <DialogTitle className="text-chrome">Hire from catalog</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <GlassInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search frontend, compliance, research..."
            className="pl-9"
          />
        </div>
        <div className="grid md:grid-cols-[1fr_220px] gap-4">
          <div className="max-h-[360px] overflow-auto space-y-2 pr-1">
            {filtered.map((skill) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => {
                  setSkillId(skill.id);
                  setDisplayName(skill.name);
                  setRole(skill.role);
                }}
                className={[
                  "w-full rounded-2xl border p-3 text-left transition-colors",
                  skill.id === skillId
                    ? "border-rim/50 bg-rim/10"
                    : "border-white/10 bg-white/[0.035] hover:bg-white/[0.06]",
                ].join(" ")}
              >
                <div className="text-sm font-medium">{skill.name}</div>
                <div className="text-xs text-rim/85 mt-0.5">{skill.role}</div>
                {skill.description && (
                  <div className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    {skill.description}
                  </div>
                )}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Department
              </span>
              <select
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                className="h-10 w-full rounded-xl bg-black/30 border border-white/10 px-3 text-sm text-foreground focus:outline-none focus:border-rim/60"
              >
                <option value="" className="bg-background text-foreground">
                  First available
                </option>
                {departments.data?.map((department) => (
                  <option
                    key={department.id}
                    value={department.id}
                    className="bg-background text-foreground"
                  >
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Name
              </span>
              <GlassInput
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Role
              </span>
              <GlassInput value={role} onChange={(event) => setRole(event.target.value)} />
            </label>
            <GlassButton
              className="w-full"
              variant="rim"
              disabled={!skillId || hire.isPending}
              onClick={() => hire.mutate()}
            >
              <UserRoundCheck /> {hire.isPending ? "Hiring..." : "Hire agent"}
            </GlassButton>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}
