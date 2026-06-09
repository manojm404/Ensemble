import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, EmptyState } from "@/components/glass/Primitives";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/marketplace")({
  head: () => ({ meta: [{ title: "Marketplace — 0101" }] }),
  component: MarketplacePage,
});

interface Pack {
  id?: string;
  name?: string;
  description?: string;
  agents?: number;
  version?: string;
}

function MarketplacePage() {
  const q = useQuery({
    queryKey: ["marketplace", "packs"],
    queryFn: () => api<Pack[]>("/api/marketplace/packs").catch(() => []),
  });
  return (
    <div>
      <PageHeader
        kicker="Marketplace"
        title="Agent packs"
        subtitle="Curated role bundles, universal-format. Import from MetaGPT, CrewAI, LangChain, AutoGen — no lock-in."
      />
      {q.data && q.data.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {q.data.map((p, i) => (
            <GlassPanel key={p.id ?? i} padding="lg" sheen>
              <div className="font-mono text-[10px] tracking-widest text-rim/80 mb-2">
                PACK · v{p.version ?? "—"}
              </div>
              <h3 className="text-lg font-semibold tracking-tight mb-1">
                {p.name ?? "Untitled pack"}
              </h3>
              <p className="text-sm text-muted-foreground line-clamp-3 min-h-14">
                {p.description ?? ""}
              </p>
              <div className="mt-4 text-xs text-muted-foreground">{p.agents ?? 0} agents</div>
            </GlassPanel>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Marketplace is loading"
          body="Connect to your 0101 backend to browse curated agent packs."
        />
      )}
    </div>
  );
}
