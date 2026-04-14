import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, Plus, Bot, RefreshCw, Loader2, ChevronDown, ChevronRight, Building2, GitBranch, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MotionCard, StaggerContainer, StaggerItem } from "@/components/ui/motion-card";
import { useInspector } from "@/components/layout/InspectorPanel";
import { toast } from "sonner";
import { getAgents, syncRegistry, toggleAgentStatus, AgentSkill } from "@/lib/api";
import { hireAgent } from "@/lib/company-data";
import { Switch } from "@/components/ui/switch";
import { NamespaceBadge } from "@/components/ui/namespace-badge";

// Legacy category color map (used in AgentCard badges)
const categoryColors: Record<string, string> = {
  Engineering: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Support: "bg-green-500/20 text-green-400 border-green-500/30",
  Marketing: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Executive: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  General: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

// Department → skill hierarchy
const DEPT_SKILLS: Record<string, { label: string; icon: string; skills: string[]; color: string }> = {
  engineering: {
    label: "Engineering",
    icon: "💻",
    skills: ["frontend", "backend", "full-stack", "devops", "testing", "security", "mobile", "database", "api", "architecture", "code-review", "cloud"],
    color: "text-blue-400 bg-blue-500/10",
  },
  trading: {
    label: "Trading & Finance",
    icon: "📈",
    skills: ["trading", "crypto", "stocks", "quantitative", "risk", "portfolio", "forex", "derivatives", "analysis"],
    color: "text-emerald-400 bg-emerald-500/10",
  },
  social_media: {
    label: "Social Media",
    icon: "📱",
    skills: ["content", "seo", "community", "influencer", "analytics", "copywriting", "brand", "engagement"],
    color: "text-pink-400 bg-pink-500/10",
  },
  movie: {
    label: "Movies & Entertainment",
    icon: "🎬",
    skills: ["screenwriting", "production", "animation", "vfx", "editing", "storyboarding", "cinematography"],
    color: "text-amber-400 bg-amber-500/10",
  },
  design: {
    label: "Design & Creative",
    icon: "🎨",
    skills: ["ui", "ux", "graphic", "illustration", "branding", "typography", "wireframe", "prototyping"],
    color: "text-violet-400 bg-violet-500/10",
  },
  research: {
    label: "Research & Analysis",
    icon: "🔬",
    skills: ["data-science", "ml", "statistics", "academic", "literature-review", "experiment"],
    color: "text-cyan-400 bg-cyan-500/10",
  },
  product: {
    label: "Product & Strategy",
    icon: "📋",
    skills: ["product-management", "strategy", "business", "operations", "project-management", "roadmap"],
    color: "text-orange-400 bg-orange-500/10",
  },
  support: {
    label: "Support & Docs",
    icon: "🛠️",
    skills: ["technical-writing", "documentation", "customer-success", "communication", "onboarding"],
    color: "text-slate-400 bg-slate-500/10",
  },
  game_dev: {
    label: "Game Dev",
    icon: "🎮",
    skills: ["unity", "unreal", "level-design", "narrative", "gameplay", "physics"],
    color: "text-red-400 bg-red-500/10",
  },
};

function inferSkillFromCategory(category: string): string {
  const cat = category.toLowerCase();
  const mapping: Record<string, string> = {
    engineering: "code-review",
    testing: "testing",
    security: "security",
    devops: "devops",
    infrastructure: "cloud",
    frontend: "frontend",
    backend: "backend",
    "full-stack": "full-stack",
    mobile: "mobile",
    database: "database",
    api: "api",
    "software-architecture": "architecture",
    development: "code-review",
    trading: "trading",
    finance: "portfolio",
    cryptocurrency: "crypto",
    marketing: "content",
    content: "content",
    seo: "seo",
    "digital-marketing": "brand",
    "social-media": "community",
    brand: "brand",
    influencer: "influencer",
    analytics: "analytics",
    movie: "production",
    entertainment: "production",
    film: "cinematography",
    screenwriting: "screenwriting",
    animation: "animation",
    vfx: "vfx",
    design: "ui",
    ux: "ux",
    creative: "illustration",
    "graphic-design": "graphic",
    illustration: "illustration",
    branding: "branding",
    typography: "typography",
    research: "data-science",
    analysis: "analysis",
    "data-science": "data-science",
    science: "experiment",
    "ai/ml": "ml",
    statistics: "statistics",
    academic: "academic",
    product: "product-management",
    executive: "strategy",
    business: "business",
    strategy: "strategy",
    management: "project-management",
    operations: "operations",
    support: "customer-success",
    documentation: "technical-writing",
    writing: "technical-writing",
    communication: "communication",
    "game-development": "gameplay",
    gaming: "gameplay",
    unity: "unity",
    unreal: "unreal",
    "level-design": "level-design",
    "narrative-design": "narrative",
    education: "academic",
    "customer-success": "customer-success",
  };
  return mapping[cat] || cat.replace(/\s+/g, "-");
}

function extractPackName(agent: AgentSkill): string | null {
  if (agent.pack_id) return agent.pack_id;
  if (agent.namespace && agent.namespace !== "native") return agent.namespace;
  // Try to infer from agent ID if it contains a repo-like segment
  const parts = agent.id.split(/[_/]/);
  if (parts.length > 2 && parts[0] !== "engineering" && parts[0] !== "testing" && parts[0] !== "marketing" && parts[0] !== "support" && parts[0] !== "design" && parts[0] !== "product" && parts[0] !== "research") {
    return parts.slice(0, 2).join("/");
  }
  return null;
}

const Agents = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orgId = searchParams.get("orgId") || "";

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All"); // "All", skill, or pack name
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({ engineering: true });
  const [agents, setAgents] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [hiringId, setHiringId] = useState<string | null>(null);
  const { open: openInspector } = useInspector();

  // ── Compute department/pack stats ──────────────────────────────
  const { deptStats, importedPacks } = useMemo(() => {
    const deptStats: Record<string, { count: number; skills: Record<string, number>; agents: AgentSkill[] }> = {};
    const packs: Record<string, { count: number; agents: AgentSkill[] }> = {};

    for (const agent of agents) {
      const packName = extractPackName(agent);
      const skill = inferSkillFromCategory(agent.category);

      if (packName) {
        if (!packs[packName]) packs[packName] = { count: 0, agents: [] };
        packs[packName].count++;
        packs[packName].agents.push(agent);
      }

      for (const [deptKey, dept] of Object.entries(DEPT_SKILLS)) {
        if (dept.skills.includes(skill) || dept.skills.some(s => skill.includes(s) || s.includes(skill))) {
          if (!deptStats[deptKey]) deptStats[deptKey] = { count: 0, skills: {}, agents: [] };
          deptStats[deptKey].count++;
          deptStats[deptKey].skills[skill] = (deptStats[deptKey].skills[skill] || 0) + 1;
          deptStats[deptKey].agents.push(agent);
          break;
        }
      }
    }

    return { deptStats, importedPacks: packs };
  }, [agents]);

  const toggleDept = (deptKey: string) => {
    setExpandedDepts(prev => ({ ...prev, [deptKey]: !prev[deptKey] }));
  };

  // ── Filter agents ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = agents;

    if (activeFilter !== "All") {
      // Check if it's an imported pack
      if (importedPacks[activeFilter]) {
        result = importedPacks[activeFilter].agents;
      } else {
        // It's a skill — find the department and filter by skill
        for (const [deptKey, dept] of Object.entries(DEPT_SKILLS)) {
          if (dept.skills.includes(activeFilter) || dept.skills.some(s => activeFilter.includes(s) || s.includes(activeFilter))) {
            result = agents.filter(a => {
              const s = inferSkillFromCategory(a.category);
              return s === activeFilter || s.includes(activeFilter) || activeFilter.includes(s);
            });
            break;
          }
        }
      }
    }

    // Apply search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
      );
    }

    return result;
  }, [agents, activeFilter, search, importedPacks]);

  useEffect(() => {
    loadAgents();
    window.addEventListener('focus', loadAgents);
    return () => window.removeEventListener('focus', loadAgents);
  }, []);

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
      toast.success(`Synchronized ${res.agents.length} agents.`);
    } catch (err) {
      toast.error("Registry hydration failed.");
    } finally { setSyncing(false); }
  };

  const handleToggleStatus = async (id: string, current: boolean) => {
    try {
        await toggleAgentStatus(id, !current);
        setAgents(prev => prev.map(a => a.id === id ? { ...a, enabled: !current } : a));
        toast.success(`Agent ${!current ? 'Enabled' : 'Disabled'}`);
    } catch (err) { toast.error("Status update failed."); }
  };

  const handleHireAgent = async (agent: AgentSkill) => {
    if (!orgId) return;
    setHiringId(agent.id);
    try {
      hireAgent(orgId, {
        name: agent.name,
        role: agent.name,
        model: "gemini-2.5-flash",
        emoji: agent.emoji || "🤖",
        skills: [agent.category],
      });
      toast.success(`${agent.emoji} ${agent.name} joined your organization!`);
      setTimeout(() => navigate(`/org/${orgId}`), 800);
    } catch (err: any) {
      toast.error(err.message || "Failed to add agent");
    } finally { setHiringId(null); }
  };

  const totalAgents = agents.length;
  const totalImported = Object.values(importedPacks).reduce((sum, p) => sum + p.count, 0);

  return (
    <div className="flex h-full bg-background/50">
      {/* Sidebar */}
      <div className="w-72 border-r border-border/50 shrink-0 bg-card/30 backdrop-blur-sm flex flex-col">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <div>
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-1.5">
              <Building2 className="h-3 w-3" />
              Agent Fleet
            </h3>
            <p className="text-[9px] text-muted-foreground/60 mt-0.5">{totalAgents} total · {totalImported} imported</p>
          </div>
          <RefreshCw className={`h-3 w-3 cursor-pointer text-muted-foreground hover:text-primary transition-all ${syncing ? 'animate-spin' : ''}`} onClick={handleSync} />
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {/* All */}
            <button
              onClick={() => setActiveFilter("All")}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium transition-all ${
                activeFilter === "All"
                  ? "bg-primary/15 text-primary border border-primary/25 shadow-sm"
                  : "text-muted-foreground hover:bg-secondary/50"
              }`}
            >
              <span className="font-semibold">🌐 All Agents</span>
              <span className="text-[10px] opacity-60 font-mono">{totalAgents}</span>
            </button>

            {/* ── Imported Packs ────────────────────────────────── */}
            {Object.keys(importedPacks).length > 0 && (
              <>
                <div className="my-2 border-t border-border/30" />
                <div className="px-3 py-1">
                  <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider flex items-center gap-1">
                    <GitBranch className="h-2.5 w-2.5" /> Imported Repos
                  </span>
                </div>
                {Object.entries(importedPacks).map(([packName, pack]) => (
                  <button
                    key={packName}
                    onClick={() => setActiveFilter(packName === activeFilter ? "All" : packName)}
                    className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                      activeFilter === packName
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-muted-foreground hover:bg-secondary/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 opacity-60" />
                      <span className="truncate text-[11px] font-medium">{packName}</span>
                    </div>
                    <span className="text-[10px] opacity-50 font-mono">{pack.count}</span>
                  </button>
                ))}
              </>
            )}

            {/* ── Departments → Skills ──────────────────────────── */}
            <div className="my-2 border-t border-border/30" />
            <div className="px-3 py-1">
              <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider">Native Departments</span>
            </div>

            {Object.entries(DEPT_SKILLS).map(([deptKey, dept]) => {
              const stats = deptStats[deptKey];
              if (!stats || stats.count === 0) return null;

              const isExpanded = expandedDepts[deptKey];
              const isActive = Object.keys(stats.skills).includes(activeFilter);

              return (
                <div key={deptKey} className="space-y-0.5">
                  <button
                    onClick={() => toggleDept(deptKey)}
                    className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                      isActive
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-muted-foreground hover:bg-secondary/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{dept.icon}</span>
                      <span className="font-semibold">{dept.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] opacity-50 font-mono">{stats.count}</span>
                      {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="ml-4 pl-3 border-l border-border/30 space-y-0.5">
                      {Object.entries(stats.skills).sort((a, b) => b[1] - a[1]).map(([skill, count]) => (
                        <button
                          key={skill}
                          onClick={() => setActiveFilter(skill === activeFilter ? "All" : skill)}
                          className={`w-full flex items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-medium transition-all ${
                            activeFilter === skill
                              ? "bg-primary/10 text-primary border border-primary/15"
                              : "text-muted-foreground/70 hover:bg-secondary/40 hover:text-muted-foreground"
                          }`}
                        >
                          <span className="capitalize">{skill.replace(/-/g, " ")}</span>
                          <span className="text-[9px] opacity-40 font-mono">{count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-4 p-4 border-b border-border/50 bg-background/20 backdrop-blur-md">
          {orgId && (
            <Button variant="ghost" size="sm" className="gap-2 h-9 px-3 text-muted-foreground hover:text-foreground" onClick={() => navigate(`/org/${orgId}`)}>
              ← Back
            </Button>
          )}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={orgId ? "Search agents to hire..." : "Search specialists..."} className="pl-9 bg-secondary/30 border-border/20 text-sm h-9" />
          </div>

          {!orgId && (
            <Button size="sm" className="gap-2 h-9 px-4 shrink-0 shadow-lg shadow-primary/20"><Plus className="h-4 w-4" /> Deploy Custom</Button>
          )}
        </div>

        <ScrollArea className="flex-1">
          {loading ? (
             <div className="flex flex-col h-full items-center justify-center p-8 space-y-4">
                 <RefreshCw className="h-8 w-8 animate-spin text-primary/40" />
                 <p className="text-sm font-medium text-muted-foreground">Hydrating Registry...</p>
             </div>
          ) : (
             <StaggerContainer className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
               {filtered.map((agent) => (
                 <StaggerItem key={agent.id}>
                   <AgentCard
                     agent={agent}
                     orgMode={!!orgId}
                     hiring={hiringId === agent.id}
                     onHire={() => handleHireAgent(agent)}
                     onInspect={() => openInspector(agent.name, <AgentInspectorContent agent={agent} />)}
                     onToggle={() => handleToggleStatus(agent.id, agent.enabled)}
                   />
                 </StaggerItem>
               ))}
               {filtered.length === 0 && (
                 <div className="col-span-full h-64 flex flex-col items-center justify-center text-center space-y-2 bg-secondary/10 rounded-2xl border border-dashed border-border/50">
                    <Bot className="h-12 w-12 text-muted-foreground/20" />
                    <p className="text-sm font-bold text-muted-foreground/50">No Specialists Found</p>
                 </div>
               )}
             </StaggerContainer>
          )}
        </ScrollArea>
      </div>
    </div>
  );
};

/* ─── Extracted Agent Card ─── */
function AgentCard({ agent, orgMode, hiring, onHire, onInspect, onToggle }: {
  agent: AgentSkill;
  orgMode: boolean;
  hiring: boolean;
  onHire: () => void;
  onInspect: () => void;
  onToggle: () => void;
}) {
  return (
    <MotionCard
      className={`p-5 group relative overflow-hidden border-border/40 transition-all hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 ${!agent.enabled ? 'opacity-60 grayscale' : ''} ${orgMode ? 'cursor-pointer' : ''}`}
      onClick={orgMode ? onHire : onInspect}
    >
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {orgMode ? (
          hiring ? (
            <Badge variant="outline" className="text-[8px] px-1 py-0 border-primary/40 bg-primary/10 text-primary"><Loader2 className="h-2 w-2 animate-spin mr-1" /> Hiring...</Badge>
          ) : (
            <Badge variant="outline" className="text-[8px] px-1 py-0 border-emerald-400/40 bg-emerald-400/5 text-emerald-400">✓ Click to Hire</Badge>
          )
        ) : (
          <NamespaceBadge
            namespace={agent.namespace || (agent.is_native ? "native" : "custom")}
            packId={agent.pack_id}
            size="sm"
          />
        )}
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className={`h-12 w-12 rounded-xl bg-secondary/50 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-500 ${!agent.enabled ? 'filter grayscale brightness-50' : ''}`}>
            {agent.emoji}
          </div>
          <div className="flex gap-2">
            {!agent.enabled && <span className="text-[8px] text-muted-foreground">HIBERNATING</span>}
            {!orgMode && <Switch checked={agent.enabled} onCheckedChange={onToggle} className="scale-75" />}
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">{agent.name}</h3>
          <p className={`text-[10px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity ${!agent.enabled ? 'italic' : ''}`}>
            {agent.enabled ? agent.description : "This specialist is in hibernation."}
          </p>
          <div className="flex items-center justify-between mt-4">
            <Badge variant="outline" className={`text-[9px] px-2 py-0 font-bold border-border/20 ${categoryColors[agent.category] || ""}`}>{agent.category}</Badge>
            <span className="text-[9px] font-mono text-muted-foreground tracking-tighter opacity-40 lowercase">{agent.id.split('_').pop()}</span>
          </div>
        </div>
      </div>
    </MotionCard>
  );
}

/* ─── Extracted Inspector Content ─── */
function AgentInspectorContent({ agent }: { agent: AgentSkill }) {
  const [modelOverride, setModelOverride] = useState(agent.model_override || null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-2xl bg-secondary/50 flex items-center justify-center text-4xl shadow-inner">{agent.emoji}</div>
        <div className="flex-1">
          <h4 className="text-xl font-bold text-foreground tracking-tight">{agent.name}</h4>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-wider ${categoryColors[agent.category] || ""}`}>{agent.category}</Badge>
            <NamespaceBadge
              namespace={agent.namespace || (agent.is_native ? "native" : "custom")}
              packId={agent.pack_id}
              size="md"
            />
            <Badge variant="secondary" className="text-[9px] opacity-70">ID: {agent.id}</Badge>
          </div>
        </div>
      </div>

      {modelOverride && (
        <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary uppercase tracking-wider">Model Override</span>
            <Badge variant="outline" className="text-[10px]">
              {modelOverride.provider}/{modelOverride.model}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            This agent uses a custom model configuration instead of global settings.
          </p>
          {modelOverride.temperature !== undefined && (
            <p className="text-xs text-muted-foreground">
              Temperature: {modelOverride.temperature}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Specialist Mandate</p>
        <p className="text-sm text-foreground leading-relaxed bg-secondary/20 p-4 rounded-xl border border-border/30 italic">"{agent.description}"</p>
      </div>
    </div>
  );
}

export default Agents;
