import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Inbox,
  Building2,
  Workflow,
  Sparkles,
  Settings,
  Plus,
  ChevronRight,
  Grid3X3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTabContext, allApps } from "@/lib/tab-context";
import { useCompanyContext } from "@/lib/company-context";
import { MagicCompanyDialog } from "./MagicCompanyDialog";

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { openApp, openRouteTab } = useTabContext();
  const { companies, currentCompany, setCurrentCompanyId } = useCompanyContext();
  const [companiesExpanded, setCompaniesExpanded] = useState(true);
  const [utilitiesExpanded, setUtilitiesExpanded] = useState(false);
  const [magicCompanyOpen, setMagicCompanyOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/" && (location.pathname === "/" || location.pathname === "/dashboard")) return true;
    if (path !== "/" && location.pathname.startsWith(path)) return true;
    return false;
  };

  const openTab = (appId: string, route?: string) => {
    const app = allApps.find((a) => a.id === appId);
    if (app) openApp(app);
    if (route) navigate(route);
  };

  const openPageTab = (tab: { id: string; title: string; route: string; icon: any; iconName?: string }) => {
    openRouteTab({
      id: tab.id,
      title: tab.title,
      url: tab.route,
      icon: tab.icon,
      iconName: tab.iconName,
      closable: true,
    });
    navigate(tab.route);
  };

  return (
    <aside className="w-64 shrink-0 h-full border-r border-border/50 bg-card/60 backdrop-blur-md flex flex-col z-20">
      <ScrollArea className="flex-1">
        <div className="px-4 py-6 space-y-2">
          {/* Action Button */}
          <Button size="sm" className="w-full justify-start gap-2.5 text-xs font-bold mb-4 h-10 bg-primary/95 text-primary-foreground hover:bg-primary shadow-lg shadow-primary/10 rounded-xl" onClick={() => { if (currentCompany) navigate(`/company/${currentCompany.id}`); else setMagicCompanyOpen(true); }}>
            <Plus className="h-4 w-4" /> New Issue
          </Button>

          {/* Primary Nav */}
          <SidebarItem
            icon={LayoutDashboard}
            label="Dashboard"
            active={isActive("/")}
            onClick={() => {
              openRouteTab({ id: "home", title: "Home", url: "/dashboard", icon: LayoutDashboard, iconName: "LayoutGrid", closable: false });
              navigate("/dashboard");
            }}
          />
          <SidebarItem
            icon={Workflow}
            label="Workflows"
            active={isActive("/workflows")}
            onClick={() => openPageTab({ id: "workflows", title: "Workflows", route: "/workflows", icon: Workflow, iconName: "GitBranch" })}
          />
          <SidebarItem
            icon={Sparkles}
            label="Chat"
            active={isActive("/chat")}
            onClick={() => openPageTab({ id: "chat", title: "Chat", route: "/chat", icon: Sparkles, iconName: "MessageSquare" })}
          />

          <Separator className="my-4 bg-border/10 invisible" />

          {/* Companies Section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.2em] hover:text-foreground transition-colors group">
              <span>Companies</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMagicCompanyOpen(true);
                  }}
                  className="h-4 w-4 rounded-md flex items-center justify-center bg-secondary/40 border border-transparent hover:border-border/50 hover:bg-secondary/60 transition-all opacity-0 group-hover:opacity-100"
                  title="Create company"
                >
                  <Plus className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCompaniesExpanded(!companiesExpanded)}
                  className="flex items-center justify-center"
                  title={companiesExpanded ? "Collapse companies" : "Expand companies"}
                >
                  <ChevronRight className={`h-3 w-3 transition-transform ${companiesExpanded ? "rotate-90" : ""}`} />
                </button>
              </div>
            </div>
            <AnimatePresence>
              {companiesExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden space-y-0.5 mt-1"
                >
                  {companies.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCurrentCompanyId(c.id);
                        openRouteTab({
                          id: `company-${c.id}`,
                          title: c.name,
                          url: `/company/${c.id}`,
                          icon: Building2,
                          iconName: "Building2",
                        });
                        navigate(`/company/${c.id}`);
                      }}
                      className={`flex items-center gap-3 w-full px-4 py-2 rounded-xl text-xs font-bold transition-all group ${
                        currentCompany?.id === c.id
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground/60 hover:text-foreground hover:bg-secondary/50"
                      }`}
                    >
                      <span className="text-sm">{c.emoji}</span>
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                  {companies.length === 0 && (
                    <button
                      onClick={() => setMagicCompanyOpen(true)}
                      className="flex items-center gap-3 w-full px-4 py-2 rounded-xl text-xs text-muted-foreground/40 hover:text-foreground hover:bg-secondary/50 transition-all"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      <span>Start a company</span>
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Separator className="my-6 bg-border/20" />

          {/* Utilities */}
          <div className="space-y-1">
            <div className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.2em] hover:text-foreground transition-colors group">
              <span>Utilities</span>
              <button
                type="button"
                onClick={() => setUtilitiesExpanded(!utilitiesExpanded)}
                className="flex items-center justify-center"
                title={utilitiesExpanded ? "Collapse utilities" : "Expand utilities"}
              >
                <ChevronRight className={`h-3 w-3 transition-transform ${utilitiesExpanded ? "rotate-90" : ""}`} />
              </button>
            </div>
            <AnimatePresence>
              {utilitiesExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden space-y-0.5 mt-1"
                >
                  <SidebarItem
                    icon={Inbox}
                    label="Inbox"
                    active={isActive("/inbox")}
                    onClick={() => openPageTab({ id: "inbox", title: "Inbox", route: "/inbox", icon: Inbox, iconName: "Inbox" })}
                    badge="3"
                  />
                  <SidebarItem icon={Grid3X3} label="Launcher" onClick={() => openPageTab({ id: "launcher", title: "Launcher", route: "/launcher", icon: Grid3X3, iconName: "Grid3X3" })} />
                  <SidebarItem icon={Sparkles} label="Skills" onClick={() => openTab("agents", "/agents")} />
                  <SidebarItem icon={Settings} label="Settings" onClick={() => openTab("settings", "/settings/general")} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </ScrollArea>

      {/* Magic Company Dialog */}
      <MagicCompanyDialog
        open={magicCompanyOpen}
        onOpenChange={setMagicCompanyOpen}
        onGenerate={async (mission) => {
          setMagicCompanyOpen(false);
          // The context provider handles creation
          // We need to trigger the createCompany from context — handled by CompanyList or CompanyDashboard
          navigate("/companies");
        }}
        isGenerating={false}
      />
    </aside>
  );
}

function SidebarItem({ icon: Icon, label, active, onClick, badge }: { 
  icon: any, 
  label: string, 
  active?: boolean, 
  onClick: () => void,
  badge?: string 
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 h-10 rounded-xl transition-all group ${
        active 
          ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(34,211,238,0.05)]" 
          : "text-muted-foreground/60 hover:text-foreground hover:bg-secondary/50 font-bold"
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`h-4.5 w-4.5 transition-colors ${active ? "text-primary" : "text-muted-foreground/40 group-hover:text-foreground/80"}`} />
        <span className={`text-[13px] tracking-tight ${active ? "font-bold" : "font-semibold"}`}>{label}</span>
      </div>
      {badge && (
        <Badge className={`h-5 min-w-[20px] px-1.5 flex items-center justify-center text-[10px] font-black border-0 rounded-lg shadow-inner ${
          active ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground/60"
        }`}>
          {badge}
        </Badge>
      )}
    </button>
  );
}
