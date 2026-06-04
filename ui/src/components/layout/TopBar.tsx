import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Search, Grid3X3, X, Home, User, LogOut, Sun, Moon, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAIApps } from "@/lib/ai-apps";
import { AddCustomAppDialog } from "@/components/home/AddCustomAppDialog";
import { aiLogoMap } from "@/components/icons/ai-logos";
import { useTabContext } from "@/lib/tab-context";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tabs, closeTab } = useTabContext();
  const [aiAppsOpen, setAiAppsOpen] = useState(false);

  const activeTabId = tabs.find((t) => isTabActive(t.url, location.pathname))?.id;

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const isActive = activeTabId === tabId;
    if (isActive) {
      const remaining = tabs.filter((t) => t.id !== tabId);
      const nextUrl = remaining[remaining.length - 1]?.url || "/";
      // Navigate first, then close the tab in the next tick to avoid stale state
      navigate(nextUrl);
      setTimeout(() => closeTab(tabId), 0);
    } else {
      closeTab(tabId);
    }
  };

  return (
    <header className="relative flex items-end shrink-0 z-40 bg-background/75 backdrop-blur-xl pt-2 px-2 gap-1 border-b border-border/30 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      {/* App launcher */}
      <div className="relative">
        <button
          onClick={() => setAiAppsOpen((p) => !p)}
          className={`h-11 w-11 flex items-center justify-center rounded-t-xl transition-colors duration-150 shrink-0 ${
            aiAppsOpen
              ? "bg-card text-foreground shadow-sm border border-border/40 border-b-transparent"
              : "text-muted-foreground hover:text-foreground hover:bg-card/70"
          }`}
          title="Open app launcher"
        >
          <Grid3X3 className="h-6 w-6" />
        </button>
        <AIAppsPopover open={aiAppsOpen} onClose={() => setAiAppsOpen(false)} />
      </div>

      {/* Tabs */}
        {tabs.map((tab) => {
          const active = activeTabId === tab.id;
          const Icon = tab.id === "home" ? Home : tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.url)}
              className={`group relative flex items-center gap-2 px-4 h-11 text-sm font-medium rounded-t-xl transition-all duration-150 min-w-[112px] max-w-[220px] overflow-hidden ${
                active
                  ? "bg-card text-foreground shadow-sm border border-border/40 border-b-transparent"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/70"
              }`}
            >
              {tab.logoUrl ? (
                <img src={tab.logoUrl} alt="" className="h-5 w-5 rounded-sm shrink-0" />
              ) : (
                <Icon className="h-5 w-5 shrink-0" />
              )}
              <span className="truncate flex-1 text-left">{tab.title}</span>
              {tab.closable && (
                <span
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  className="h-5 w-5 flex items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 hover:bg-muted transition-all duration-150 shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              )}
            </button>
          );
        })}

      <div className="flex-1" />
      <div className="flex items-center gap-2 pb-1.5">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-9 w-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-card/70 transition-colors duration-150 border border-transparent hover:border-border/40">
              <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium text-foreground">Esemble User</p>
              <p className="text-xs text-muted-foreground">user@esemble.ai</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings/about")} className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              Account settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/auth?logout=1")} className="cursor-pointer text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function isTabActive(tabUrl: string, pathname: string) {
  if (tabUrl === "/") return pathname === "/" || pathname === "/dashboard";
  if (tabUrl === "/settings/general") return pathname.startsWith("/settings");
  if (tabUrl.startsWith("/company/")) return pathname.startsWith(tabUrl);
  if (tabUrl.startsWith("/workflows/")) return pathname.startsWith(tabUrl);
  if (tabUrl.startsWith("/app/")) return pathname.startsWith(tabUrl);
  return pathname === tabUrl || pathname.startsWith(`${tabUrl}/`);
}

/* AI Apps Popover (grid icon) */
function AIAppsPopover({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { openExternalApp } = useTabContext();
  const { allAIApps, addCustomApp, removeCustomApp } = useAIApps();
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    setTimeout(() => {
      document.addEventListener("mousedown", handler);
      document.addEventListener("keydown", esc);
    }, 0);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [open, onClose]);

  const filtered = allAIApps.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpen = (app: (typeof allAIApps)[0]) => {
    openExternalApp({ id: app.id, title: app.name, url: app.url, logoUrl: app.logoUrl });
    navigate(`/app/${app.id}`);
    onClose();
  };

  return (
    <div>
      {open && (
        <>
          {/* Backdrop — click to close */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
          />
          {/* Centered panel */}
          <div
            ref={ref}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="w-[420px] max-h-[70vh] rounded-2xl glass border border-border/40 shadow-2xl p-5 overflow-hidden flex flex-col pointer-events-auto">
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search AI apps..."
                  className="pl-8 h-8 text-xs rounded-lg bg-background/50 border-border/30"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-5 gap-4 max-h-[400px] overflow-y-auto pr-1">
                {filtered.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => handleOpen(app)}
                    className="flex flex-col items-center gap-1.5 group relative rounded-lg p-2 hover:bg-background/60 transition-colors"
                  >
                    {app.isCustom && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCustomApp(app.id);
                        }}
                        className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      >
                        <X className="h-2.5 w-2.5 text-destructive-foreground" />
                      </span>
                    )}
                    <div className="h-10 w-10 rounded-xl bg-background/60 border border-border/30 flex items-center justify-center group-hover:border-primary/30 transition-colors overflow-hidden">
                      {aiLogoMap[app.id] ? (
                        (() => { const Logo = aiLogoMap[app.id]; return <Logo className="h-6 w-6" />; })()
                      ) : (
                        <img
                          src={app.logoUrl}
                          alt={app.name}
                          className="h-6 w-6 rounded object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(app.name)}&background=random&size=48`;
                          }}
                        />
                      )}
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition-colors truncate max-w-[64px]">
                      {app.name}
                    </span>
                  </button>
                ))}
                <AddCustomAppDialog onAdd={addCustomApp} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("ensemble-theme");
    return saved === "dark" || (!saved && document.documentElement.classList.contains("dark"));
  });

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("ensemble-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("ensemble-theme", "light");
    }
  }, [dark]);

  return (
    <button
      onClick={() => setDark((d) => !d)}
      className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-background/50 transition-colors duration-150"
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
