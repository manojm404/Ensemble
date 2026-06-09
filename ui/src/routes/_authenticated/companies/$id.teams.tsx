import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { StateView, RowSkeleton } from "@/components/glass/StateView";
import { companyApi } from "@/lib/adapters";

export const Route = createFileRoute("/_authenticated/companies/$id/teams")({
  head: () => ({ meta: [{ title: "Teams — 0101" }] }),
  component: TeamsPage,
});

function TeamsPage() {
  const { id } = useParams({ from: "/_authenticated/companies/$id/teams" });
  const q = useQuery({ queryKey: ["company-teams", id], queryFn: () => companyApi.getTeams(id) });

  return (
    <StateView
      loading={q.isLoading}
      error={q.error}
      empty={!q.isLoading && (q.data?.length ?? 0) === 0}
      emptyTitle="No teams yet"
      emptyBody="Group agents into teams to assign them to workflows."
      skeleton={<RowSkeleton rows={3} />}
    >
      <div className="grid md:grid-cols-2 gap-4">
        {q.data?.map((t) => (
          <GlassPanel key={t.id} padding="lg">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-rim" />
                <h3 className="font-semibold tracking-tight text-chrome">{t.name}</h3>
              </div>
              <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
                {t.agents} agents
              </span>
            </div>
            {t.mission && <p className="text-sm text-muted-foreground">{t.mission}</p>}
          </GlassPanel>
        ))}
      </div>
    </StateView>
  );
}
