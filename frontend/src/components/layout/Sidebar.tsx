import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Inbox,
  Building2,
  Sparkles,
  Settings,
  FileText,
  Plus,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTabContext, allApps } from "@/lib/tab-context";
import { useCompanyContext } from "@/lib/company-context";
import { MagicCompanyDialog } from "./MagicCompanyDialog";

const MOCK_PROJECTS = [
    { id: "p1", name: "Code Review Bot", color: "bg-emerald-400" },
    { id: "p2", name: "Content Pipeline", color: "bg-blue-400" },
    { id: "p3", name: "Bug Triage System", color: "bg-orange-400" },
    { id: "p4", name: "Doc Generator", color: "bg-purple-400" },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { openApp } = useTabContext();
  const { companies, currentCompany, setCurrentCompanyId } = useCompanyContext();
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [companiesExpanded, setCompaniesExpanded] = useState(true);
  const [magicCompanyOpen, setMagicCompanyOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/" && location.pathname === "/") return true;
    if (path !== "/" && location.pathname.startsWith(path)) return true;
    return false;
  };

  const openTab = (appId: string, route?: string) => {
    const app = allApps.find((a) => a.id === appId);
    if (app) openApp(app);
    if (route) navigate(route);
  };

  return (
    <aside className="w-64 shrink-0 h-full border-r border-border/20 bg-background/30 backdrop-blur-md flex flex-col z-20">
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
            onClick={() => navigate("/")}
          />
          <SidebarItem
            icon={Inbox}
            label="Inbox"
            active={isActive("/inbox")}
            onClick={() => navigate("/inbox")}
            badge="3"
          />

          <Separator className="my-4 bg-border/10 invisible" />

          {/* Companies Section */}
          <div className="space-y-1">
            <button
              onClick={() => setCompaniesExpanded(!companiesExpanded)}
              className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.2em] hover:text-foreground transition-colors group"
            >
              <span>Companies</span>
              <div className="flex items-center gap-2">
                <button
                    onClick={(e) => { e.stopPropagation(); setMagicCompanyOpen(true); }}
                    className="h-4 w-4 rounded-md flex items-center justify-center bg-white/5 border border-transparent hover:border-white/10 hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100"
                >
                    <Plus className="h-2.5 w-2.5" />
                </button>
                <ChevronRight className={`h-3 w-3 transition-transform ${companiesExpanded ? "rotate-90" : ""}`} />
              </div>
            </button>
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
                      onClick={() => { setCurrentCompanyId(c.id); navigate(`/company/${c.id}`); }}
                      className={`flex items-center gap-3 w-full px-4 py-2 rounded-xl text-xs font-bold transition-all group ${
                        currentCompany?.id === c.id
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground/60 hover:text-foreground hover:bg-white/5"
                      }`}
                    >
                      <span className="text-sm">{c.emoji}</span>
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                  {companies.length === 0 && (
                    <button
                      onClick={() => setMagicCompanyOpen(true)}
                      className="flex items-center gap-3 w-full px-4 py-2 rounded-xl text-xs text-muted-foreground/40 hover:text-foreground hover:bg-white/5 transition-all"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      <span>Start a company</span>
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Projects Section */}
          <div className="space-y-1">
            <button
              onClick={() => setProjectsExpanded(!projectsExpanded)}
              className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.2em] hover:text-foreground transition-colors group"
            >
              <span>Your Projects</span>
              <div className="flex items-center gap-2">
                <button
                    onClick={(e) => { e.stopPropagation(); }}
                    className="h-4 w-4 rounded-md flex items-center justify-center bg-white/5 border border-transparent hover:border-white/10 hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100"
                >
                    <Plus className="h-2.5 w-2.5" />
                </button>
                <ChevronDown className={`h-3 w-3 transition-transform ${projectsExpanded ? "" : "-rotate-90"}`} />
              </div>
            </button>
            <AnimatePresence>
              {projectsExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden space-y-0.5 mt-1"
                >
                  {MOCK_PROJECTS.map((p) => (
                    <button key={p.id} className="flex items-center gap-3 w-full px-4 py-2 rounded-xl text-xs font-bold text-muted-foreground/60 hover:text-foreground hover:bg-white/5 transition-all group/p">
                      <div className={`h-2 w-2 rounded-full ${p.color} shadow-[0_0_8px_rgba(34,211,238,0.2)]`} />
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Separator className="my-6 bg-border/20" />

          {/* Management */}
          <p className="text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.2em] px-3 pb-2 pt-1">Management</p>
          <SidebarItem icon={Sparkles} label="Skills" onClick={() => openTab("agents", "/agents")} />
          <SidebarItem icon={Settings} label="Settings" onClick={() => openTab("settings", "/settings/general")} />
        </div>
      </ScrollArea>

      {/* Footer Nav */}
      <div className="p-3 bg-white/5 border-t border-white/5 pb-8">
          <SidebarItem icon={FileText} label="Documentation" onClick={() => { }} />
          <SidebarItem icon={Settings} label="Global Settings" onClick={() => openTab("settings", "/settings/general")} />
      </div>

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
          : "text-muted-foreground/60 hover:text-foreground hover:bg-white/5 font-bold"
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`h-4.5 w-4.5 transition-colors ${active ? "text-primary" : "text-muted-foreground/40 group-hover:text-foreground/80"}`} />
        <span className={`text-[13px] tracking-tight ${active ? "font-bold" : "font-semibold"}`}>{label}</span>
      </div>
      {badge && (
        <Badge className={`h-5 min-w-[20px] px-1.5 flex items-center justify-center text-[10px] font-black border-0 rounded-lg shadow-inner ${
          active ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground/40"
        }`}>
          {badge}
        </Badge>
      )}
    </button>
  );
}
