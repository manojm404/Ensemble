import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/glass/Primitives";
import { GlassPanel } from "@/components/glass/GlassPanel";

import { StateView, CardSkeleton, StatusChip } from "@/components/glass/StateView";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { agentApi, type Agent } from "@/lib/adapters";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({ meta: [{ title: "Agents — 0101" }] }),
  component: AgentsPage,
});

function AgentsPage() {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("All");
  const [open, setOpen] = React.useState<Agent | null>(null);

  const categories = useQuery({
    queryKey: ["agents", "categories"],
    queryFn: () => agentApi.categories(),
  });
  const agents = useQuery({
    queryKey: ["agents", query, category],
    queryFn: () => agentApi.list(query, category),
  });

  return (
    <div>
      <PageHeader
        kicker="Roster"
        title="Agents"
        subtitle="Every role available to your workflows — searchable, categorized, status-aware."
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2 px-4 h-10 rounded-full glass border border-white/10 flex-1 min-w-[220px] max-w-md">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents…"
            className="bg-transparent text-sm flex-1 focus:outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(categories.data ?? ["All"]).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "px-3 h-8 rounded-full text-xs font-mono uppercase tracking-widest border transition-colors",
                c === category
                  ? "bg-white/[0.08] border-rim/40 text-foreground"
                  : "bg-white/[0.02] border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <StateView
        loading={agents.isLoading}
        error={agents.error}
        empty={!agents.data?.length}
        emptyTitle="No agents match"
        emptyBody="Try a different category or clear your search."
        skeleton={<CardSkeleton />}
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.data?.map((a) => (
            <button key={a.id} onClick={() => setOpen(a)} className="text-left">
              <GlassPanel
                padding="lg"
                sheen
                className="h-full hover:border-white/20 transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-mono text-[10px] tracking-widest text-rim uppercase mb-1">
                      {a.role}
                    </div>
                    <h3 className="text-base font-semibold tracking-tight text-chrome">{a.name}</h3>
                  </div>
                  <StatusChip status={a.status} />
                </div>
                {a.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{a.description}</p>
                )}
                <div className="flex flex-wrap gap-1">
                  {a.capabilities.slice(0, 4).map((c) => (
                    <GlassInputChip key={c}>{c}</GlassInputChip>
                  ))}
                </div>
              </GlassPanel>
            </button>
          ))}
        </div>
      </StateView>

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="glass-strong border-white/10 max-w-md w-full">
          <SheetHeader>
            <div className="font-mono text-[10px] tracking-widest text-rim uppercase mb-1">
              {open?.role}
            </div>
            <SheetTitle className="text-chrome text-2xl">{open?.name}</SheetTitle>
          </SheetHeader>
          {open && (
            <div className="space-y-5 mt-6">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
                  Status
                </span>
                <StatusChip status={open.status} />
              </div>
              {open.description && (
                <p className="text-sm text-foreground/80 leading-relaxed">{open.description}</p>
              )}
              <div>
                <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-2">
                  Capabilities
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {open.capabilities.map((c) => (
                    <GlassInputChip key={c}>{c}</GlassInputChip>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                <div>
                  <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-1">
                    Skill source
                  </div>
                  <div className="font-mono text-xs text-foreground/80 truncate">
                    {open.skill_source ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-1">
                    Last active
                  </div>
                  <div className="text-xs text-foreground/80">
                    {open.last_activity_at ? new Date(open.last_activity_at).toLocaleString() : "—"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function GlassInputChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-[10px] font-mono uppercase tracking-wider text-foreground/70">
      {children}
    </span>
  );
}
