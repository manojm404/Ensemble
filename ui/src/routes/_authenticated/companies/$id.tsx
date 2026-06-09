import { createFileRoute, Outlet, useParams, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/glass/Primitives";
import { companyApi } from "@/lib/adapters";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/companies/$id")({
  head: () => ({ meta: [{ title: "Company — 0101" }] }),
  component: CompanyLayout,
});

const TABS: { to: string; label: string; exact?: boolean }[] = [
  { to: "/companies/$id", label: "Dashboard", exact: true },
  { to: "/companies/$id/teams", label: "Teams" },
  { to: "/companies/$id/agents", label: "Agents" },
  { to: "/companies/$id/tasks", label: "Tasks" },
  { to: "/companies/$id/activity", label: "Activity" },
  { to: "/companies/$id/reports", label: "Reports" },
];

function CompanyLayout() {
  const { id } = useParams({ from: "/_authenticated/companies/$id" });

  const company = useQuery({
    queryKey: ["company", id],
    queryFn: () => companyApi.getById(id),
  });

  return (
    <div>
      <PageHeader
        kicker={`Company · ${company.data?.industry ?? "—"}`}
        title={company.data?.name ?? "Loading…"}
        subtitle={company.data?.mission ?? undefined}
      />

      <nav className="flex flex-wrap gap-1 mb-6 border-b border-white/5">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to as "/companies/$id"}
            params={{ id }}
            activeOptions={{ exact: tab.exact ?? false }}
            className={cn(
              "px-3 py-2 text-sm font-mono tracking-wide uppercase text-[11px] text-muted-foreground hover:text-chrome transition-colors border-b-2 border-transparent -mb-px",
            )}
            activeProps={{
              className: "text-chrome border-rim",
            }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
