import { useState, useEffect } from "react";
import { Search, Plus, Bot, RefreshCw, Shield, FlaskConical, Settings2, Github, Globe, Sparkles, GitFork, Trash2, Moon, BarChart3, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MotionCard, StaggerContainer, StaggerItem } from "@/components/ui/motion-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useInspector } from "@/components/layout/InspectorPanel";
import { toast } from "sonner";
import { getAgents, syncRegistry, toggleAgentStatus, importExternalRepo, deleteAgent, forkAgent, getAgentStats, exportAgent, AgentSkill, AgentStats } from "@/lib/api";
import { Switch } from "@/components/ui/switch";

const categoryColors: Record<string, string> = {
  Engineering: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Support: "bg-green-500/20 text-green-400 border-green-500/30",
  Marketing: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Executive: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  General: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const Agents = () => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [agents, setAgents] = useState<AgentSkill[]>([]);
  const [stats, setStats] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { open: openInspector } = useInspector();

  // Dynamic Categories from Backend
  const dynamicCategories = ["All", ...Array.from(new Set(agents.map(a => a.category))).sort()];

  useEffect(() => {
    loadAgents();
    loadStats();
  }, []);

  async function loadStats() {
    try {
        const s = await getAgentStats();
        setStats(s);
    } catch (e) {
        console.warn("Telemetry offline.");
    }
  }

  async function loadAgents() {
    setLoading(true);
    try {
      const skills = await getAgents();
      setAgents(skills);
    } catch (err) {
      toast.error("Failed to load agential registry.");
    } finally {
      setLoading(false);
    }
  }

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await syncRegistry();
      setAgents(res.agents);
      toast.success(`Synchronized ${res.agents.length} agents from Universal Registry.`);
    } catch (err) {
      toast.error("Registry hydration failed.");
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleStatus = async (id: string, current: boolean) => {
    try {
        await toggleAgentStatus(id, !current);
        setAgents(prev => prev.map(a => a.id === id ? { ...a, enabled: !current } : a));
        toast.success(`Agent ${!current ? 'Enabled' : 'Disabled'}`);
    } catch (err) {
        toast.error("Status update failed.");
    }
  };

  const handleImport = async () => {
    if (!importUrl) return;
    setImporting(true);
    try {
        const res = await importExternalRepo(importUrl);
        toast.success(`Successfully integrated ${res.repo}.`);
        setImportOpen(false);
        setImportUrl("");
        loadAgents(); // Reload library
    } catch (err) {
        toast.error("GitHub Integration failed. Check URL or network.");
    } finally {
        setImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this specialist? This action cannot be undone.")) return;
    try {
        await deleteAgent(id);
        toast.success("Specialist decommissioned successfully.");
        loadAgents();
    } catch (err) {
        toast.error("Decommission failed. System core protection active.");
    }
  };

  const handleFork = async (id: string) => {
    try {
        await forkAgent(id);
        toast.success("Specialist forked to Custom library. You can now modify instructions.");
        loadAgents();
    } catch (err) {
        toast.error("Fork failed.");
    }
  };

  const filtered = agents.filter((a) => {
    const matchesSearch = 
      a.name.toLowerCase().includes(search.toLowerCase()) || 
      a.description.toLowerCase().includes(search.toLowerCase());
    const matchesCat = activeCategory === "All" || a.category === activeCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="flex h-full bg-background/50">
      {/* Category sidebar */}
      <div className="w-56 border-r border-border/50 shrink-0 bg-card/30 backdrop-blur-sm">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Agential Fleet</h3>
          <RefreshCw 
            className={`h-3 w-3 cursor-pointer text-muted-foreground hover:text-primary transition-all ${syncing ? 'animate-spin' : ''}`} 
            onClick={handleSync}
          />
        </div>
        <ScrollArea className="h-[calc(100%-53px)]">
          <div className="p-2 space-y-1">
            {dynamicCategories.map((name) => (
              <button
                key={name}
                onClick={() => setActiveCategory(name)}
                className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-all ${
                  activeCategory === name
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:bg-secondary/50"
                }`}
              >
                <span>{name}</span>
                <span className="text-[10px] opacity-40">
                    {name === "All" ? agents.length : agents.filter(a => a.category === name).length}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main grid */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-4 p-4 border-b border-border/50 bg-background/20 backdrop-blur-md">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search 174 specialist agents..."
              className="pl-9 bg-secondary/30 border-border/20 focus:border-primary/50 transition-all text-sm h-9"
            />
          </div>
          
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2 h-9 px-4" variant="outline">
                <Github className="h-4 w-4" /> Import Registry
              </Button>
            </DialogTrigger>
            <DialogContent className="glass sm:max-w-md border-primary/20">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Ingest External Registry
                </DialogTitle>
                <p className="text-xs text-muted-foreground italic">Paste a MetaGPT, SuperAGI, or Custom Agent GitHub URL.</p>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Input 
                  placeholder="https://github.com/user/expert-agent-repo" 
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  className="bg-secondary/50"
                />
                <Button 
                    className="w-full gap-2" 
                    onClick={handleImport}
                    disabled={importing || !importUrl}
                >
                    {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {importing ? 'Cloning & Hydrating...' : 'Start Integration'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button size="sm" className="gap-2 h-9 px-4 shrink-0 shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" /> Deploy Custom
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {loading ? (
             <div className="flex flex-col h-full items-center justify-center p-8 space-y-4">
                 <RefreshCw className="h-8 w-8 animate-spin text-primary/40" />
                 <p className="text-sm font-medium text-muted-foreground">Hydrating Agential Registry...</p>
             </div>
          ) : (
             <StaggerContainer className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
               {filtered.map((agent) => (
                 <StaggerItem key={agent.id}>
                   <MotionCard
                     className={`p-5 group relative overflow-hidden border-border/40 transition-all hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 ${!agent.enabled ? 'opacity-60 grayscale' : ''}`}
                     onClick={() =>
                       openInspector(
                         agent.name,
                         <div className="space-y-6">
                           <div className="flex items-center gap-4">
                             <div className="h-16 w-16 rounded-2xl bg-secondary/50 flex items-center justify-center text-4xl shadow-inner">
                               {agent.emoji}
                             </div>
                             <div>
                               <h4 className="text-xl font-bold text-foreground tracking-tight">{agent.name}</h4>
                               <div className="flex gap-2 mt-1">
                                 <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-wider ${categoryColors[agent.category] || ""}`}>
                                   {agent.category}
                                 </Badge>
                                 <Badge variant="secondary" className="text-[10px] opacity-70">
                                   ID: {agent.id}
                                 </Badge>
                               </div>
                             </div>
                           </div>
                           <div className="space-y-2">
                             <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Specialist Mandate</Label>
                             <p className="text-sm text-foreground leading-relaxed bg-secondary/20 p-4 rounded-xl border border-border/30 italic">
                                "{agent.description}"
                             </p>
                           </div>
                           <div className="pt-4 border-t border-border/50 flex flex-col gap-4">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="p-3 rounded-xl bg-secondary/10 border border-border/20 flex flex-col gap-1">
                                    <span className="text-[9px] uppercase font-bold text-muted-foreground flex items-center gap-1.5 focus:text-primary transition-colors">
                                        <BarChart3 className="h-2.5 w-2.5" /> Total Field Usage
                                    </span>
                                    <span className="text-lg font-bold text-foreground">
                                        {stats.find(s => s.agent_id === agent.id)?.usage_count || 0}
                                    </span>
                                  </div>
                                  <div className="p-3 rounded-xl bg-secondary/10 border border-border/20 flex flex-col gap-1">
                                    <span className="text-[9px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                            <div className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                                        </div> 
                                        Commulative Cost
                                    </span>
                                    <span className="text-lg font-bold text-foreground">
                                        ${(stats.find(s => s.agent_id === agent.id)?.total_cost || 0).toFixed(4)}
                                    </span>
                                  </div>
                                </div>
                               <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {agent.is_native ? (
                                        <>
                                            <Shield className="h-4 w-4 text-primary" />
                                            <span className="text-xs font-bold text-primary">Native Core Specialist</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-4 w-4 text-purple-500" />
                                            <span className="text-xs font-bold text-purple-500">Custom Implementation</span>
                                        </>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-medium text-muted-foreground">{agent.enabled ? 'ACTIVE' : 'HIBERNATING'}</span>
                                    <Switch 
                                        checked={agent.enabled} 
                                        onCheckedChange={() => handleToggleStatus(agent.id, agent.enabled)}
                                    />
                                  </div>
                               </div>
                               
                               <div className="flex gap-2">
                                   <Button size="sm" className="flex-1 gap-2 bg-secondary/30 hover:bg-secondary/50 text-foreground border-border/50" variant="outline" onClick={() => exportAgent(agent.id)}>
                                       <Download className="h-4 w-4" /> Share Agent
                                   </Button>
                                   {agent.is_native ? (
                                     <Button size="sm" className="flex-1 gap-2 bg-secondary/30 hover:bg-secondary/50 text-foreground border-border/50" variant="outline" onClick={() => handleFork(agent.id)}>
                                         <GitFork className="h-4 w-4" /> Fork to Custom
                                     </Button>
                                   ) : (
                                     <Button size="sm" className="flex-1 gap-2 text-destructive hover:bg-destructive/10 border-destructive/20" variant="outline" onClick={() => handleDelete(agent.id)}>
                                         <Trash2 className="h-4 w-4" /> Decommission Specialist
                                     </Button>
                                   )}
                                </div>
                            </div>
                         </div>
                       )
                     }
                   >
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {agent.is_native ? (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 border-primary/40 bg-primary/5 text-primary">🛡️ Sovereign</Badge>
                        ) : (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 border-purple-500/40 bg-purple-500/5 text-purple-500">✨ Custom</Badge>
                        )}
                      </div>
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <div className={`h-12 w-12 rounded-xl bg-secondary/50 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-500 ${!agent.enabled ? 'filter grayscale brightness-50' : ''}`}>
                            {agent.emoji}
                          </div>
                          <div className="flex gap-2">
                            {!agent.enabled && <Moon className="h-4 w-4 text-muted-foreground/40" />}
                            {agent.is_native ? (
                                <Shield className="h-4 w-4 text-primary/40 group-hover:text-primary transition-colors" />
                            ) : (
                                <Sparkles className="h-4 w-4 text-purple-500/40 group-hover:text-purple-500 transition-colors" />
                            )}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                            {agent.name}
                          </h3>
                          <p className={`text-[10px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity ${!agent.enabled ? 'italic' : ''}`}>
                            {agent.enabled ? agent.description : "This specialist is currently in hibernation."}
                          </p>
                          <div className="flex items-center justify-between mt-4">
                            <Badge variant="outline" className={`text-[9px] px-2 py-0 font-bold border-border/20 ${categoryColors[agent.category] || ""}`}>
                              {agent.category}
                            </Badge>
                            <span className="text-[9px] font-mono text-muted-foreground tracking-tighter opacity-40 lowercase">
                              {agent.id.split('_').pop()}
                            </span>
                          </div>
                        </div>
                      </div>
                   </MotionCard>
                 </StaggerItem>
               ))}
               {filtered.length === 0 && (
                 <div className="col-span-full h-64 flex flex-col items-center justify-center text-center space-y-2 bg-secondary/10 rounded-2xl border border-dashed border-border/50">
                    <Bot className="h-12 w-12 text-muted-foreground/20" />
                    <p className="text-sm font-bold text-muted-foreground/50">No Specialists Identified</p>
                    <p className="text-xs text-muted-foreground/30">Modify search criteria or sync library</p>
                 </div>
               )}
             </StaggerContainer>
          )}
        </ScrollArea>
      </div>
    </div>
  );
};

export default Agents;
