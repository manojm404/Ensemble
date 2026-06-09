import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileBarChart } from "lucide-react";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { StateView, CardSkeleton } from "@/components/glass/StateView";
import { companyApi } from "@/lib/adapters";

type CompanyReport = Awaited<ReturnType<typeof companyApi.getReports>>[number];

export const Route = createFileRoute("/_authenticated/companies/$id/reports")({
  head: () => ({ meta: [{ title: "Reports — 0101" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { id } = useParams({ from: "/_authenticated/companies/$id/reports" });
  const q = useQuery({
    queryKey: ["company-reports", id],
    queryFn: () => companyApi.getReports(id),
  });

  const exportReport = React.useCallback((report: CompanyReport) => {
    try {
      const payload = {
        exported_at: new Date().toISOString(),
        company_id: id,
        report,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${report.period.toLowerCase().replace(/\s+/g, "-")}-${id}-report.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Report exported.");
    } catch {
      toast.error("Could not export report");
    }
  }, [id]);

  return (
    <StateView
      loading={q.isLoading}
      error={q.error}
      empty={!q.isLoading && (q.data?.length ?? 0) === 0}
      emptyTitle="No reports yet"
      emptyBody="Quality trends and quarterly summaries will appear here as runs complete."
      skeleton={<CardSkeleton count={2} />}
    >
      <div className="grid md:grid-cols-2 gap-4">
        {q.data?.map((r) => (
          <GlassPanel key={r.id} padding="lg">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="font-mono text-[10px] tracking-widest text-rim uppercase mb-1">
                  {r.period}
                </div>
                <h3 className="text-base font-semibold tracking-tight text-chrome flex items-center gap-2">
                  <FileBarChart className="size-4 text-rim" /> {r.title}
                </h3>
              </div>
              <GlassButton size="sm" variant="ghost" onClick={() => exportReport(r)}>
                <Download className="size-3.5" /> Export
              </GlassButton>
            </div>
            <dl className="grid grid-cols-3 gap-3 pt-3 border-t border-white/5">
              <div>
                <dt className="text-[9px] font-mono tracking-widest text-muted-foreground uppercase">
                  Pass rate
                </dt>
                <dd className="text-lg font-semibold text-chrome tabular-nums">
                  {r.pass_rate.toFixed(1)}%
                </dd>
              </div>
              <div>
                <dt className="text-[9px] font-mono tracking-widest text-muted-foreground uppercase">
                  Runs
                </dt>
                <dd className="text-lg font-semibold text-chrome tabular-nums">{r.runs}</dd>
              </div>
              <div>
                <dt className="text-[9px] font-mono tracking-widest text-muted-foreground uppercase">
                  Cost
                </dt>
                <dd className="text-lg font-semibold text-chrome tabular-nums">
                  ${r.cost_usd.toFixed(2)}
                </dd>
              </div>
            </dl>
          </GlassPanel>
        ))}
      </div>
    </StateView>
  );
}
