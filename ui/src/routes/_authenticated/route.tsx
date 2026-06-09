import * as React from "react";
import {
  createFileRoute,
  Outlet,
  Link,
  useRouter,
  useRouterState,
  redirect,
} from "@tanstack/react-router";
import {
  LayoutDashboard,
  Workflow,
  Building2,
  Store,
  ShieldCheck,
  Settings,
  Layers,
  MessagesSquare,
  LogOut,
  Bell,
  Search,
  Bot,
  Gavel,
} from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { useAuth } from "@/lib/auth";
import { authApi } from "@/lib/adapters/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const session = await authApi.getSession();
    if (!session?.user) {
      throw redirect({
        to: "/auth/login",
        search: { redirect: location.href },
      });
    }
    return { user: session.user };
  },
  component: AuthenticatedLayout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/workflows", label: "Workflows", icon: Workflow },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/approvals", label: "Approvals", icon: Gavel },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/workspaces", label: "Workspaces", icon: Layers },
  { to: "/chat", label: "Chat", icon: MessagesSquare },
  { to: "/marketplace", label: "Marketplace", icon: Store },
  { to: "/audit", label: "Audit", icon: ShieldCheck },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AuthenticatedLayout() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const handleSignOut = async () => {
    await logout();
    router.navigate({ to: "/auth/login", replace: true });
  };

  return (
    <div className="min-h-screen flex">
      <aside className="hidden lg:flex w-60 shrink-0 flex-col px-3 py-4 sticky top-0 h-screen">
        <GlassPanel variant="strong" padding="none" className="flex-1 flex flex-col p-3">
          <Link to="/dashboard" className="px-3 py-3 mb-2">
            <Wordmark size={22} />
          </Link>
          <nav className="flex-1 space-y-0.5">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors",
                    active
                      ? "bg-white/[0.08] text-foreground rim-light"
                      : "text-foreground/70 hover:text-foreground hover:bg-white/[0.05]",
                  )}
                >
                  <item.icon className="size-4 text-rim" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-white/5 pt-3 mt-3">
            <div className="px-3 py-2 mb-1">
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
                Signed in
              </div>
              <div className="text-sm truncate text-foreground">{user?.email ?? "—"}</div>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-foreground/70 hover:text-foreground hover:bg-white/[0.05]"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </div>
        </GlassPanel>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="px-4 md:px-8 py-4 sticky top-0 z-30">
          <GlassPanel
            variant="default"
            padding="none"
            className="flex items-center gap-3 px-4 h-14"
          >
            <Link to="/dashboard" className="lg:hidden">
              <Wordmark size={20} />
            </Link>
            <div className="flex-1 flex items-center gap-2 max-w-md">
              <Search className="size-4 text-muted-foreground" />
              <input
                placeholder="Search workflows, runs, agents…"
                className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none"
              />
              <kbd className="hidden md:inline-flex px-1.5 py-0.5 rounded font-mono text-[10px] bg-white/[0.06] text-muted-foreground">
                ⌘K
              </kbd>
            </div>
            <GlassButton variant="ghost" size="icon" aria-label="Notifications">
              <Bell />
            </GlassButton>
            <div className="size-9 rounded-full bg-gradient-to-br from-white/20 to-white/5 border border-white/10 grid place-items-center text-xs font-mono">
              {(user?.email ?? "?")[0]?.toUpperCase()}
            </div>
          </GlassPanel>
        </header>

        <main className="flex-1 px-4 md:px-8 pb-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
