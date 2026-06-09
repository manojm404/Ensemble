import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { StateView, RowSkeleton } from "@/components/glass/StateView";
import { companyApi } from "@/lib/adapters";

export const Route = createFileRoute("/_authenticated/companies/$id/activity")({
  head: () => ({ meta: [{ title: "Activity — 0101" }] }),
  component: ActivityPage,
});

function ActivityPage() {
  const { id } = useParams({ from: "/_authenticated/companies/$id/activity" });
  const q = useQuery({
    queryKey: ["company-activity", id],
    queryFn: () => companyApi.getActivity(id),
  });

  return (
    <StateView
      loading={q.isLoading}
      error={q.error}
      empty={!q.isLoading && (q.data?.length ?? 0) === 0}
      emptyTitle="No activity yet"
      skeleton={<RowSkeleton rows={5} />}
    >
      <GlassPanel padding="md">
        <ul className="divide-y divide-white/5">
          {q.data?.map((e) => (
            <li key={e.id} className="py-3 grid grid-cols-[auto_1fr_auto] items-center gap-4">
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {new Date(e.at).toLocaleString()}
              </span>
              <div className="min-w-0">
                <div className="text-sm truncate">
                  <span className="font-mono text-rim">{e.action}</span>{" "}
                  <span className="text-muted-foreground">·</span>{" "}
                  <span className="text-foreground/80 truncate">{e.resource}</span>
                </div>
                <div className="text-[11px] font-mono text-muted-foreground">by {e.actor}</div>
              </div>
              {e.cost_usd != null && (
                <span className="font-mono text-[11px] text-foreground/70 tabular-nums">
                  ${e.cost_usd.toFixed(2)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </GlassPanel>
    </StateView>
  );
}
