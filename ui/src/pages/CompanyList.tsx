import { useState } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Users, Bot, FolderTree, Building2, Sparkles, Loader2, Search, ChevronRight, Activity, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCompanyContext } from "@/lib/company-context";
import { useTabContext } from "@/lib/tab-context";
import { useScrollMemory } from "@/lib/use-scroll-memory";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Main component for the Companies page
export default function CompanyList() {
  const navigate = useNavigate();
  const { companies, setCurrentCompanyId, createCompany, deleteCompany } = useCompanyContext();
  const { openRouteTab } = useTabContext();
  const [createOpen, setCreateOpen] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [form, setForm] = useState({ name: '', motive: '' });
  const [search, setSearch] = useState('');
  const scrollRef = useScrollMemory("esemble_scroll_companies");

  useEffect(() => {
    const saved = localStorage.getItem("esemble_companies_search");
    if (saved) setSearch(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("esemble_companies_search", search);
  }, [search]);

  const handleCreateCompany = async () => {
    if (!form.name.trim() || !form.motive.trim()) {
      toast.error("Company name and motive are required.");
      return;
    }
    setIsBuilding(true);
    toast.info("Building your new company...", { description: "This might take a moment." });

    try {
      const newCompany = await createCompany(form.name, form.motive);
      setCreateOpen(false);
      setForm({ name: '', motive: '' });
      toast.success(`Company "${newCompany.name}" created!`);
      navigate(`/company/${newCompany.id}`);
    } catch (error) {
      toast.error("Failed to build company. Please try again.");
    } finally {
      setIsBuilding(false);
    }
  };
  
  const handleSelectCompany = (id: string) => {
    setCurrentCompanyId(id);
    const company = companies.find((item) => item.id === id);
    openRouteTab({
      id: `company-${id}`,
      title: company?.name || "Company",
      url: `/company/${id}`,
      icon: Building2,
      iconName: "Building2",
      closable: true,
    });
    navigate(`/company/${id}`);
  };

  const handleOpenSection = (companyId: string, section: "workspace" | "issues" | "activity") => {
    setCurrentCompanyId(companyId);
    const company = companies.find((item) => item.id === companyId);
    openRouteTab({
      id: `company-${companyId}`,
      title: company?.name || "Company",
      url: section === "workspace" ? `/company/${companyId}` : `/company/${companyId}/${section}`,
      icon: Building2,
      iconName: "Building2",
      closable: true,
    });
    if (section === "issues") navigate(`/company/${companyId}/issues`);
    else if (section === "activity") navigate(`/company/${companyId}/activity`);
    else navigate(`/company/${companyId}`);
  };

  const handleDelete = async (companyId: string, companyName: string) => {
    const confirmed = window.confirm(`Delete ${companyName}? This will remove the workspace and cannot be undone.`);
    if (!confirmed) return;
    try {
      await deleteCompany(companyId);
      toast.success(`Deleted "${companyName}"`);
    } catch (error) {
      toast.error(`Failed to delete "${companyName}"`);
    }
  };

  const filteredCompanies = companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div ref={scrollRef as any} className="h-full w-full overflow-y-auto p-8 bg-background text-foreground selection:bg-primary/30 relative">
        <div className="pointer-events-none absolute top-[-8%] left-[-8%] w-[28rem] h-[28rem] rounded-full bg-primary/10 blur-[120px]" />
        <div className="pointer-events-none absolute top-[20%] right-[-10%] w-[24rem] h-[24rem] rounded-full bg-sky-500/8 blur-[120px]" />
        <div className="max-w-7xl mx-auto relative z-10">
          {/* Header */}
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12"
          >
            <div className="text-center md:text-left">
              <h1 className="text-5xl font-bold tracking-tighter" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>My Companies</h1>
              <p className="text-lg text-muted-foreground mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                Manage your AI-driven organizations.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                <Input 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by name..."
                  className="pl-9 bg-background/70 border border-border/40 rounded-full h-10"
                />
              </div>
              <Button
                onClick={() => setCreateOpen(true)}
                className="bg-primary text-primary-foreground rounded-full px-5 py-2.5 text-sm font-bold hover:bg-primary/90 transition-all shadow-lg gap-2"
              >
                <Plus className="h-4 w-4" />
                Create Company
              </Button>
            </div>
          </motion.header>

          {/* Companies Grid */}
          {filteredCompanies.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredCompanies.map((company, i) => (
                <CompanyCard
                  key={company.id}
                  company={company}
                  index={i}
                  onSelect={() => handleSelectCompany(company.id)}
                  onOpenSection={(section) => handleOpenSection(company.id, section)}
                  onDelete={() => handleDelete(company.id, company.name)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-20 border border-dashed border-border/40 rounded-2xl bg-card/60">
              <h3 className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Create your first company</h3>
              <p className="text-muted-foreground mt-2 mb-6">Start by building a workspace for your agents and teams.</p>
              <Button onClick={() => setCreateOpen(true)} className="bg-primary text-primary-foreground rounded-full px-6 py-3 font-bold hover:bg-primary/90"><Plus className="h-4 w-4 mr-2" />Create Company</Button>
            </div>
          )}
        </div>
      </div>

      {/* Create Company Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card/95 backdrop-blur-xl border border-border/40 text-foreground">
          <DialogHeader>
            <DialogTitle className="text-2xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Create a New Company</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This becomes the workspace for your teams of AI agents. You can start manually or use the auto-build flow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="company-name" className="text-foreground/80">Company Name</Label>
              <Input id="company-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., QuantumLeap AI" className="bg-background/70 border-border/40 rounded-md" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-motive" className="text-foreground/80">Motive / Mission</Label>
              <Textarea id="company-motive" value={form.motive} onChange={(e) => setForm({ ...form, motive: e.target.value })} placeholder="e.g., To build AI-powered research tools for scientists." className="bg-background/70 border-border/40 rounded-md min-h-[120px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCompany} disabled={isBuilding} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md font-bold">
              {isBuilding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {isBuilding ? 'Building...' : 'Auto-Build Company'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Company Card component
function CompanyCard({
  company,
  index,
  onSelect,
  onOpenSection,
  onDelete,
}: {
  company: any;
  index: number;
  onSelect: () => void;
  onOpenSection: (section: "workspace" | "issues" | "activity") => void;
  onDelete: () => void;
}) {
  const health = getWorkspaceHealth(company);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: index * 0.1 }}
      className="group relative"
    >
      <div 
        onClick={onSelect}
        className="relative overflow-hidden bg-card/92 backdrop-blur-xl border border-border/40 rounded-[1.6rem] p-6 h-full flex flex-col justify-between shadow-[0_24px_60px_rgba(15,23,42,0.09)] cursor-pointer hover:border-primary/40 hover:-translate-y-1 transition-all duration-300"
      >
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-sky-400 to-emerald-400" />
        <div>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-start gap-4 min-w-0">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/15 to-sky-500/10 border border-border/40 flex items-center justify-center text-3xl shadow-inner shrink-0">
                {company.emoji || '🏢'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="text-xl font-bold text-foreground truncate" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{company.name}</h3>
                  <span className={`h-2.5 w-2.5 rounded-full ${health.dot} shadow-[0_0_10px_var(--health-color)] shrink-0`} style={{ '--health-color': health.color }}/>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{company.mission}</p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground opacity-70 group-hover:opacity-100 transition-opacity">
                  <Activity className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover border border-border/40 text-popover-foreground shadow-xl">
                <DropdownMenuItem onSelect={() => onOpenSection("workspace")}>
                  <Eye className="mr-2 h-4 w-4" />
                  Open workspace
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpenSection("issues")}>
                  <FolderTree className="mr-2 h-4 w-4" />
                  View issues
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpenSection("activity")}>
                  <Activity className="mr-2 h-4 w-4" />
                  View activity
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-500 focus:text-red-500" onSelect={onDelete}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete workspace
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border/40 bg-background/60 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Health</div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${health.dot}`} />
                <span className="text-sm font-semibold text-foreground">{health.label}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{health.description}</p>
            </div>
            <div className="rounded-2xl border border-border/40 bg-background/60 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Score</div>
              <div className="mt-1 text-2xl font-black text-foreground">{health.score}</div>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">Derived from teams, agents, and open issues.</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <CompanyStat label="Teams" value={company.teams} />
            <CompanyStat label="Agents" value={company.agents} />
            <CompanyStat label="Issues" value={company.projects} accent />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-background/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {health.badge}
          </div>
          <div className="text-primary font-semibold flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity duration-300 text-sm">
            Open
            <ChevronRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function getWorkspaceHealth(company: any) {
  const teams = Number(company.teams || 0);
  const agents = Number(company.agents || 0);
  const issues = Number(company.projects || 0);

  if (company.status === "Setup" && teams === 0 && agents === 0 && issues === 0) {
    return {
      label: "Setup",
      badge: "Workspace provisioning",
      score: 48,
      description: "The workspace has been created and is ready for teams and agents.",
      dot: "bg-amber-500",
      color: "#f59e0b",
    };
  }

  const penalty = Math.max(0, 3 - teams) * 6 + Math.max(0, 4 - agents) * 4 + Math.min(issues, 8) * 2;
  const score = Math.max(42, Math.min(100, 100 - penalty));

  if (issues >= teams * 2 + 4) {
    return {
      label: "Needs attention",
      badge: "Backlog growing",
      score,
      description: "Open issues are growing faster than team capacity. Consider adding support or splitting workstreams.",
      dot: "bg-amber-500",
      color: "#f59e0b",
    };
  }

  if (agents > 0 && teams > 0 && issues <= Math.max(3, teams * 2)) {
    return {
      label: "Healthy",
      badge: "Operating normally",
      score,
      description: "Teams and agents are in balance and the workspace is ready for active execution.",
      dot: "bg-emerald-500",
      color: "#22c55e",
    };
  }

  return {
    label: "Stable",
    badge: "Within normal range",
    score,
    description: "The workspace is active and balanced, with no immediate operational concerns.",
    dot: "bg-sky-500",
    color: "#38bdf8",
  };
}

function CompanyStat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border ${accent ? "border-primary/25 bg-primary/5" : "border-border/40 bg-background/60"} px-3 py-3 text-center shadow-sm`}>
      <div className={`text-lg font-black ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
