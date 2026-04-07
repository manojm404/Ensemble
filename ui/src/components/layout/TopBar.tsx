import { useState, useEffect, useRef } from "react";
import {
  User,
  Plus,
  X,
  LogOut,
  Settings,
  Home,
  Sun,
  Moon,
  Grid3X3,
  Search,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { allApps, useTabContext } from "@/lib/tab-context";
import { useAIApps } from "@/lib/ai-apps";
import { AddCustomAppDialog } from "@/components/home/AddCustomAppDialog";
import { aiLogoMap } from "@/components/icons/ai-logos";

export function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tabs, openApp, openExternalApp, closeTab } = useTabContext();
  const [aiAppsOpen, setAiAppsOpen] = useState(false);
  

  const activeTabId = tabs.find((t) =>
    t.url === "/" ? location.pathname === "/" : location.pathname.startsWith(t.url.replace("/general", ""))
  )?.id;

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const isActive = activeTabId === tabId;
    closeTab(tabId);
    if (isActive) {
      const remaining = tabs.filter((t) => t.id !== tabId);
      navigate(remaining[remaining.length - 1]?.url || "/");
    }
  };

  return (
    <header className="flex items-end shrink-0 z-40 bg-secondary/80 pt-1.5 px-2 gap-0.5">
      {/* AI Apps button */}
      <div className="relative">
        <button
          onClick={() => setAiAppsOpen((p) => !p)}
          className={`h-9 w-9 flex items-center justify-center rounded-t-lg transition-colors duration-150 shrink-0 ${
            aiAppsOpen
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          }`}
        >
          <Grid3X3 className="h-4 w-4" />
        </button>
        <AIAppsPopover open={aiAppsOpen} onClose={() => setAiAppsOpen(false)} />
      </div>

      <AnimatePresence mode="popLayout">
        {tabs.map((tab) => {
          const active = activeTabId === tab.id;
          const Icon = tab.id === "home" ? Home : tab.icon;
          return (
            <motion.button
              key={tab.id}
              layout
              initial={{ opacity: 0, scale: 0.9, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: "auto" }}
              exit={{ opacity: 0, scale: 0.9, width: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
              onClick={() => navigate(tab.url)}
              className={`group relative flex items-center gap-2 px-3.5 h-9 text-xs font-medium rounded-t-lg transition-colors duration-150 min-w-[80px] max-w-[160px] overflow-hidden ${
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40"
              }`}
            >
              {tab.logoUrl ? (
                <img src={tab.logoUrl} alt="" className="h-3.5 w-3.5 rounded-sm shrink-0" />
              ) : (
                <Icon className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate flex-1 text-left">{tab.title}</span>
              {tab.closable && (
                <span
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  className="h-4 w-4 flex items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 hover:bg-muted transition-all duration-150 shrink-0"
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              )}
            </motion.button>
          );
        })}
      </AnimatePresence>

      {/* + button — opens new launcher tab (only if none exists) */}
      <button
        onClick={() => {
          const hasLauncher = tabs.some((t) => t.url === "/launcher");
          if (hasLauncher) {
            navigate("/launcher");
            return;
          }
          openApp({ id: `launcher-${Date.now()}`, title: "New Tab", url: "/launcher", icon: Plus as any, description: "App launcher" });
          navigate("/launcher");
        }}
        className="h-9 w-9 flex items-center justify-center rounded-t-lg text-muted-foreground hover:text-foreground hover:bg-background/40 transition-colors duration-150 shrink-0"
      >
        <Plus className="h-4 w-4" />
      </button>

      <div className="flex-1" />
      <div className="flex items-center gap-1 pb-1.5">
        <ThemeToggle />
        <button
          onClick={() => {
            const settingsApp = allApps.find((a) => a.id === "settings");
            if (settingsApp) {
              openApp(settingsApp);
              navigate(settingsApp.url);
            } else {
              navigate("/settings/general");
            }
          }}
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-background/50 transition-colors duration-150"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-background/50 transition-colors duration-150">
              <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="h-3 w-3 text-primary" />
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium text-foreground">Ensemble User</p>
              <p className="text-xs text-muted-foreground">user@ensemble.ai</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings/about")} className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              Account settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/auth")} className="cursor-pointer text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
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
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — click to close */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
          />
          {/* Centered panel */}
          <motion.div
            ref={ref}
            initial={{ opacity: 0, scale: 0.93 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.93 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
      className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-background/50 transition-colors duration-150"
    >
      {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
}
