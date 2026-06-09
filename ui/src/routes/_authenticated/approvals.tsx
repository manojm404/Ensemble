import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ShieldCheck, X } from "lucide-react";
import { PageHeader } from "@/components/glass/Primitives";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { StateView, RowSkeleton, StatusChip } from "@/components/glass/StateView";
import { approvalApi, type Approval } from "@/lib/adapters";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({ meta: [{ title: "Approvals — 0101" }] }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["approvals"], queryFn: () => approvalApi.listPending() });
  const [selected, setSelected] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selected && list.data?.[0]) setSelected(list.data[0].id);
  }, [list.data, selected]);

  const active: Approval | undefined = list.data?.find((a) => a.id === selected);

  const approve = useMutation({
    mutationFn: (id: string) => approvalApi.approve(id),
    onSuccess: () => {
      toast.success("Approval granted");
      qc.invalidateQueries({ queryKey: ["approvals"] });
      setSelected(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not approve"),
  });
  const reject = useMutation({
    mutationFn: (id: string) => approvalApi.reject(id),
    onSuccess: () => {
      toast.success("Approval rejected");
      qc.invalidateQueries({ queryKey: ["approvals"] });
      setSelected(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not reject"),
  });

  return (
    <div>
      <PageHeader
        kicker="Govern"
        title="Approvals"
        subtitle="Human-in-the-loop gates for high-risk agent actions. Approve, reject, or open the full audit trail."
      />
      <StateView
        loading={list.isLoading}
        error={list.error}
        empty={!list.data?.length}
        emptyTitle="No pending approvals"
        emptyBody="When a workflow hits a gate that needs a human, it will appear here."
        skeleton={<RowSkeleton />}
      >
        <div className="grid lg:grid-cols-[1fr_2fr] gap-4">
          <GlassPanel padding="none">
            <ul className="divide-y divide-white/5">
              {list.data?.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => setSelected(a.id)}
                    className={`w-full text-left p-4 transition-colors ${a.id === selected ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-sm font-medium text-foreground/90 truncate pr-2">
                        {a.workflow_name}
                      </div>
                      <StatusChip status={a.risk} />
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{a.summary}</div>
                    <div className="font-mono text-[10px] text-muted-foreground/80 mt-2 uppercase tracking-widest">
                      {new Date(a.requested_at).toLocaleString()} · {a.requested_by}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </GlassPanel>

          <GlassPanel padding="lg" className="min-h-[420px]">
            {active ? (
              <div className="flex flex-col h-full">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <div className="font-mono text-[10px] tracking-widest text-rim uppercase mb-2">
                      {active.run_id} · risk {active.risk}
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight text-chrome">
                      {active.workflow_name}
                    </h2>
                  </div>
                  <ShieldCheck className="size-5 text-rim" />
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6 pb-6 border-b border-white/5">
                  <Stat label="Requested" value={new Date(active.requested_at).toLocaleString()} />
                  <Stat label="By" value={active.requested_by} mono />
                  <Stat
                    label="Cost so far"
                    value={active.cost_usd != null ? `$${active.cost_usd.toFixed(2)}` : "—"}
                  />
                </div>

                <div className="mb-3">
                  <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-2">
                    Request
                  </div>
                  <p className="text-sm text-foreground/90">{active.summary}</p>
                </div>
                <div className="mb-6">
                  <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-2">
                    Context
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{active.context}</p>
                </div>

                <div className="mt-auto flex flex-wrap gap-2">
                  <GlassButton
                    variant="rim"
                    onClick={() => approve.mutate(active.id)}
                    disabled={approve.isPending || reject.isPending}
                  >
                    <Check /> {approve.isPending ? "Approving…" : "Approve"}
                  </GlassButton>
                  <GlassButton
                    variant="outline"
                    onClick={() => reject.mutate(active.id)}
                    disabled={approve.isPending || reject.isPending}
                  >
                    <X /> {reject.isPending ? "Rejecting…" : "Reject"}
                  </GlassButton>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-16">
                Select an approval.
              </div>
            )}
          </GlassPanel>
        </div>
      </StateView>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-1">
        {label}
      </div>
      <div className={mono ? "text-sm font-mono text-foreground/90" : "text-sm text-foreground/90"}>
        {value}
      </div>
    </div>
  );
}
