import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/glass/Primitives";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { StateView, RowSkeleton } from "@/components/glass/StateView";
import { auditApi } from "@/lib/adapters";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Audit — 0101" }] }),
  component: AuditPage,
});

function AuditPage() {
  const events = useQuery({
    queryKey: ["audit", "events"],
    queryFn: () => auditApi.list(),
  });
  return (
    <div>
      <PageHeader
        kicker="Govern"
        title="Audit center"
        subtitle="Every action, cost, and decision — logged, hashed, exportable."
      />
      <StateView
        loading={events.isLoading}
        error={events.error}
        empty={!events.isLoading && (events.data?.length ?? 0) === 0}
        emptyTitle="No audit events yet"
        emptyBody="Once workflows, tasks, and approvals start flowing, their trail appears here."
        skeleton={<RowSkeleton rows={6} />}
      >
        <GlassPanel padding="none" className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase border-b border-white/5">
                <th className="text-left px-5 py-3">When</th>
                <th className="text-left px-5 py-3">Actor</th>
                <th className="text-left px-5 py-3">Action</th>
                <th className="text-left px-5 py-3">Resource</th>
              </tr>
            </thead>
            <tbody>
              {(events.data ?? []).map((e, i) => (
                <tr key={e.id ?? i} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                    {e.at ?? "—"}
                  </td>
                  <td className="px-5 py-3">{e.actor ?? "—"}</td>
                  <td className="px-5 py-3 text-rim/90">{e.action ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{e.resource ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      </StateView>
    </div>
  );
}
