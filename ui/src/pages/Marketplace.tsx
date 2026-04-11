import { useState, useEffect } from "react";
import {
  Search,
  ShoppingBag,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  ExternalLink,
  ArrowLeft,
  Package,
  Info,
  Bot,
  ChevronRight,
  ShieldCheck,
  History,
  AlertTriangle,
  X,
  GitBranch,
  Layers,
  ArrowRight,
  Github,
  Globe,
  Plus
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MotionCard, StaggerContainer, StaggerItem } from "@/components/ui/motion-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  getMarketplacePacks,
  installPack,
  uninstallPack,
  updatePack,
  rollbackPack,
  getAgents,
  MarketplacePack,
  ConflictInfo,
  InstallResult
} from "@/lib/api";
import { importExternalRepo, syncRegistry, toggleAgentStatus } from "@/lib/api";
import { NamespaceBadge } from "@/components/ui/namespace-badge";

// 🆕 Conflict Resolution Dialog Component
const ConflictResolutionDialog = ({
  conflicts,
  packName,
  onResolve,
  open
}: {
  conflicts: ConflictInfo;
  packName: string;
  onResolve: (action: "skip" | "replace" | "cancel") => void;
  open: boolean;
}) => {
  const hasExactConflicts = conflicts.exact_matches.length > 0;
  const hasSimilarAgents = conflicts.similar_agents.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && onResolve("cancel")}>
      <AlertDialogContent className="glass border-amber-500/20 bg-card/95 backdrop-blur-xl rounded-[2rem] p-0 overflow-hidden max-w-2xl">
        <div className="relative">
          {/* Warning Header */}
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-8 pb-6 border-b border-amber-500/20">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30 shadow-lg shadow-amber-500/10">
                <AlertTriangle className="h-7 w-7 text-amber-400" />
              </div>
              <div className="flex-1">
                <AlertDialogTitle className="text-xl font-bold tracking-tight text-foreground mb-1">
                  Agent Conflicts Detected
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-muted-foreground font-medium">
                  Installing <span className="text-foreground font-semibold">{packName}</span> will conflict with existing agents
                </AlertDialogDescription>
              </div>
            </div>
          </div>

          {/* Conflict Details */}
          <ScrollArea className="max-h-[50vh] px-8 py-6">
            <div className="space-y-6">
              {/* Exact Matches */}
              {hasExactConflicts && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-red-400" />
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Exact Filename Conflicts ({conflicts.exact_matches.length})
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {conflicts.exact_matches.map((match, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 space-y-3">
                        <div className="flex items-center gap-2">
                          <Layers className="h-3.5 w-3.5 text-red-400" />
                          <code className="text-xs font-mono text-red-300 font-semibold">{match.file}</code>
                        </div>
                        <div className="space-y-2">
                          {match.existing_agents.map((existing, eidx) => (
                            <div key={eidx} className="flex items-center gap-2 text-xs">
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Existing:</span>
                              <span className="text-foreground font-medium">{existing.name}</span>
                              <NamespaceBadge namespace={existing.namespace} size="sm" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Similar Agents */}
              {hasSimilarAgents && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-amber-400" />
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Similar Agents ({conflicts.similar_agents.length})
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {conflicts.similar_agents.map((similar, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 flex items-center gap-3">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-foreground font-medium">{similar.new_name}</span>
                            <span className="text-muted-foreground">↔</span>
                            <span className="text-foreground font-medium">{similar.existing_name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>Similarity: {Math.round(similar.similarity * 100)}%</span>
                            <span>•</span>
                            <span className="uppercase">{similar.recommendation}</span>
                          </div>
                        </div>
                        <div className="h-12 w-12 rounded-lg bg-amber-500/10 flex items-center justify-center">
                          <span className="text-lg font-bold text-amber-400">{Math.round(similar.similarity * 100)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Resolution Actions */}
          <div className="p-6 bg-secondary/20 border-t border-border/20 space-y-3">
            <p className="text-xs text-muted-foreground text-center font-medium">How would you like to resolve these conflicts?</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-11 rounded-xl bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 text-blue-300 gap-2"
                onClick={() => onResolve("skip")}
              >
                <X className="h-4 w-4" />
                <div className="text-left">
                  <div className="text-xs font-bold">Skip Conflicts</div>
                  <div className="text-[9px] text-muted-foreground">Install non-conflicting only</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-11 rounded-xl bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 text-amber-300 gap-2"
                onClick={() => onResolve("replace")}
              >
                <RefreshCw className="h-4 w-4" />
                <div className="text-left">
                  <div className="text-xs font-bold">Replace Existing</div>
                  <div className="text-[9px] text-muted-foreground">Archive old, install new</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-11 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-muted-foreground gap-2"
                onClick={() => onResolve("cancel")}
              >
                <X className="h-4 w-4" />
                <div className="text-left">
                  <div className="text-xs font-bold">Cancel</div>
                  <div className="text-[9px] text-muted-foreground">Abort installation</div>
                </div>
              </Button>
            </div>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const Marketplace = () => {
  const [search, setSearch] = useState("");
  const [packs, setPacks] = useState<MarketplacePack[]>([]);
  const [installedPackIds, setInstalledPackIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [activePack, setActivePack] = useState<MarketplacePack | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [packToUninstall, setPackToUninstall] = useState<string | null>(null);
  
  // 🆕 Conflict resolution state
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pendingConflicts, setPendingConflicts] = useState<ConflictInfo | null>(null);
  const [pendingPack, setPendingPack] = useState<MarketplacePack | null>(null);
  
  // 🆕 GitHub Import state
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [allPacks, agents] = await Promise.all([
        getMarketplacePacks(),
        getAgents()
      ]);
      setPacks(allPacks);

      // Infer installed packs from agent IDs or metadata could be added to API
      // For MVP, we check if any agent's ID contains the pack_id
      const installed = new Set<string>();
      allPacks.forEach(p => {
        if (agents.some(a => a.id.includes(p.id))) {
          installed.add(p.id);
        }
      });
      setInstalledPackIds(installed);
    } catch (err) {
      toast.error("Failed to sync with Marketplace repository.");
    } finally {
      setLoading(false);
    }
  }

  // 🆕 GitHub Import Handler
  const handleImport = async () => {
    if (!importUrl) return;
    setImporting(true);
    try {
      const res = await importExternalRepo(importUrl);
      toast.success(`✅ Integrated ${res.repo || 'external repository'}.`);
      setImportOpen(false);
      setImportUrl("");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "GitHub Integration failed.");
    } finally {
      setImporting(false);
    }
  };

  const handleInstall = async (pack: MarketplacePack, conflictAction?: "skip" | "replace") => {
    setProcessingId(pack.id);
    try {
      const result: InstallResult = await installPack(
        pack.id,
        pack.download_url,
        pack.version,
        conflictAction
      );

      if (result.status === "conflict" && result.conflicts) {
        // Show conflict resolution dialog
        setPendingConflicts(result.conflicts);
        setPendingPack(pack);
        setConflictDialogOpen(true);
        setProcessingId(null);
        return;
      }

      if (result.status === "success") {
        const skippedMsg = result.skipped_count && result.skipped_count > 0
          ? ` (${result.installed_count} installed, ${result.skipped_count} skipped)`
          : ` (${result.installed_count} agents)`;
        toast.success(`${pack.name} integrated into your local fleet.${skippedMsg}`);
        setInstalledPackIds(prev => new Set(prev).add(pack.id));
        loadData();
      }
    } catch (err: any) {
      toast.error(err.message || "Installation failed. Check network or manifest.");
    } finally {
      setProcessingId(null);
    }
  };

  // 🆕 Handle conflict resolution
  const handleConflictResolution = async (action: "skip" | "replace" | "cancel") => {
    setConflictDialogOpen(false);
    
    if (action === "cancel" || !pendingPack) {
      toast.info("Installation cancelled.");
      setPendingConflicts(null);
      setPendingPack(null);
      return;
    }

    toast.info(`Resolving conflicts: ${action === "skip" ? "Skipping conflicting agents" : "Replacing existing agents"}...`);
    await handleInstall(pendingPack, action);
    
    setPendingConflicts(null);
    setPendingPack(null);
  };

  const handleUninstall = async (packId: string) => {
    setProcessingId(packId);
    try {
      await uninstallPack(packId);
      toast.success("Pack decommissioned.");
      setInstalledPackIds(prev => {
        const next = new Set(prev);
        next.delete(packId);
        return next;
      });
      loadData();
    } catch (err) {
      toast.error("Uninstall failed.");
    } finally {
      setProcessingId(null);
      setPackToUninstall(null);
    }
  };

  const handleUpdate = async (packId: string) => {
    setProcessingId(packId);
    try {
      await updatePack(packId);
      toast.success("Pack updated to latest version.");
      loadData();
    } catch (err) {
      toast.error("Update failed.");
    } finally {
      setProcessingId(null);
    }
  };

  const filtered = packs.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Area */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-lg shadow-primary/5">
              <ShoppingBag className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Agent Marketplace</h1>
              <p className="text-sm text-muted-foreground mt-0.5 font-medium italic opacity-60">System manifest sync: Community specialist packs</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-9 px-4 rounded-xl border-border/30 hover:bg-white/5 font-bold uppercase tracking-widest text-[9px] gap-2" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </Button>

          {/* 🆕 GitHub Import Button */}
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9 px-4 rounded-xl gap-2 shadow-lg shadow-primary/10">
                <Github className="h-4 w-4" />
                <span className="hidden sm:inline">Import</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="glass sm:max-w-md border-primary/20 p-0 overflow-hidden rounded-[1.5rem]">
              <div className="bg-gradient-to-br from-primary/5 via-transparent to-transparent p-6 pb-4">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3 text-xl">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                      <Github className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div>Import External Agents</div>
                      <div className="text-xs text-muted-foreground font-normal mt-0.5">Clone agent packs from any GitHub repository</div>
                    </div>
                  </DialogTitle>
                </DialogHeader>
              </div>
              
              <div className="p-6 pt-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Repository URL</label>
                  <Input 
                    placeholder="https://github.com/user/agent-repo" 
                    value={importUrl} 
                    onChange={(e) => setImportUrl(e.target.value)} 
                    className="bg-secondary/30 border-border/20 h-11"
                  />
                </div>
                
                <div className="bg-secondary/20 p-3 rounded-lg border border-border/20 space-y-1">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Supported Formats</div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>GitHub repos with <code className="bg-secondary/50 px-1 rounded">skills/</code> directory</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>MetaGPT integrations with <code className="bg-secondary/50 px-1 rounded">metagpt/roles/</code></span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>SuperAGI plugins with <code className="bg-secondary/50 px-1 rounded">manifest.json</code></span>
                    </div>
                  </div>
                </div>

                <Button 
                  className="w-full gap-2 h-11 rounded-xl" 
                  onClick={handleImport} 
                  disabled={importing || !importUrl}
                >
                  {importing ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Cloning Repository...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Import Agents
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search packs (e.g., 'SEO', 'Game Dev')..."
            className="pl-10 h-11 bg-secondary/20 border-border/20 focus:border-primary/40 rounded-xl"
          />
        </div>

        <div>
        {loading && packs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <RefreshCw className="h-8 w-8 animate-spin text-primary/30" />
            <p className="text-sm text-muted-foreground">Connecting to Ensemble Manifest...</p>
          </div>
        ) : (
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filtered.map((pack) => {
              const isInstalled = installedPackIds.has(pack.id);
              const isProcessing = processingId === pack.id;

              return (
                <StaggerItem key={pack.id}>
                  <MotionCard 
                    className="p-0 border-border/40 hover:border-primary/30 transition-all overflow-hidden group flex flex-col h-full bg-card/40 backdrop-blur-md"
                  >
                    <div className="p-6 flex-1 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="h-14 w-14 rounded-2xl bg-secondary/50 flex items-center justify-center text-3xl shadow-inner group-hover:scale-110 transition-transform duration-500">
                          {pack.emoji}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {isInstalled ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1.5 px-3 py-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Installed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] uppercase tracking-widest opacity-60">
                              Available
                            </Badge>
                          )}
                          {/* 🆕 Source Badge */}
                          {pack.source && (
                            <Badge variant="outline" className="text-[8px] px-2 py-0.5 opacity-70">
                              {pack.source === "github" ? "🐙 GitHub" : pack.source === "local" ? "💾 Local" : pack.source}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                          {pack.name}
                        </h3>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 italic">
                          "{pack.description}"
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-medium pt-2">
                        <div className="flex items-center gap-1.5">
                          <Package className="h-3 w-3 text-primary/60" />
                          {pack.agent_files.length} Specialists
                        </div>
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className="h-3 w-3 text-primary/60" />
                          v{pack.version}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-secondary/10 border-t border-border/20 flex gap-2">
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="flex-1 text-xs gap-2"
                        onClick={() => setActivePack(pack)}
                      >
                        <Info className="h-3.5 w-3.5" />
                        Details
                      </Button>
                      
                      {isInstalled ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1 text-xs gap-2 text-destructive hover:bg-destructive/10"
                          onClick={() => setPackToUninstall(pack.id)}
                          disabled={isProcessing}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Uninstall
                        </Button>
                      ) : (
                        <Button 
                          size="sm" 
                          className="flex-1 text-xs gap-2 shadow-lg shadow-primary/20"
                          onClick={() => handleInstall(pack)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          Install
                        </Button>
                      )}
                    </div>
                  </MotionCard>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        )}

      {/* Pack Details Dialog */}
      <Dialog open={!!activePack} onOpenChange={(open) => !open && setActivePack(null)}>
        <DialogContent className="glass sm:max-w-xl border-primary/20 p-0 overflow-hidden">
          {activePack && (
            <div className="flex flex-col h-full max-h-[85vh]">
              <div className="p-8 pb-4 space-y-6">
                <div className="flex items-start gap-5">
                  <div className="h-20 w-20 rounded-3xl bg-secondary/50 flex items-center justify-center text-5xl shadow-xl border border-border/30">
                    {activePack.emoji}
                  </div>
                  <div className="flex-1 min-w-0 pt-2">
                    <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
                      {activePack.name}
                    </DialogTitle>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant="secondary" className="text-[10px] font-bold">BY {activePack.author.toUpperCase()}</Badge>
                      <Badge variant="outline" className="text-[10px]">VERSION {activePack.version}</Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Manifest Definition</h4>
                  <p className="text-sm text-foreground leading-relaxed italic bg-secondary/30 p-4 rounded-xl border border-border/30">
                    "{activePack.description}"
                  </p>
                </div>
              </div>

              <div className="px-8 flex-1 min-h-0 overflow-hidden flex flex-col pt-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Included Specialists ({activePack.agent_files.length})</h4>
                <ScrollArea className="flex-1 pr-4">
                  <div className="space-y-3 pb-6">
                    {activePack.agent_files.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-background/40 border border-border/20 group hover:border-primary/30 transition-all">
                        <div className="h-8 w-8 rounded-lg bg-secondary/50 flex items-center justify-center">
                          <Bot className="h-4 w-4 text-primary/60" />
                        </div>
                        <span className="text-sm font-medium text-foreground flex-1 truncate">{file}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="p-6 bg-secondary/20 border-t border-border/20 flex items-center justify-between gap-4">
                {installedPackIds.has(activePack.id) ? (
                  <>
                     <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => handleUpdate(activePack.id)}>
                            <RefreshCw className="h-3.5 w-3.5" /> Force Update
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2">
                            <History className="h-3.5 w-3.5" /> Rollback
                        </Button>
                     </div>
                     <Button variant="destructive" size="sm" className="gap-2" onClick={() => setPackToUninstall(activePack.id)}>
                        <Trash2 className="h-3.5 w-3.5" /> Uninstall Pack
                     </Button>
                  </>
                ) : (
                  <>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                        <ExternalLink className="h-3 w-3" />
                        External Manifest verified
                    </div>
                    <Button 
                      className="gap-2 px-8 shadow-lg shadow-primary/20" 
                      onClick={() => handleInstall(activePack)}
                      disabled={processingId === activePack.id}
                    >
                      {processingId === activePack.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Install Suite
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Custom Uninstall Confirmation */}
      <AlertDialog open={!!packToUninstall} onOpenChange={(open) => !open && setPackToUninstall(null)}>
        <AlertDialogContent className="glass border-primary/20 bg-card/90 backdrop-blur-xl rounded-[2rem] p-8">
          <AlertDialogHeader>
            <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
              <Trash2 className="h-6 w-6 text-destructive" />
            </div>
            <AlertDialogTitle className="text-xl font-bold tracking-tight text-foreground">
              Confirm Decommission
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground font-medium italic">
              Are you sure you want to remove this pack and all its specialists? This action will immediately terminate active instances of these agents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 gap-3">
            <AlertDialogCancel className="h-11 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 hover:text-foreground text-muted-foreground font-bold uppercase tracking-widest text-[10px]">
              Abort Operation
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => packToUninstall && handleUninstall(packToUninstall)}
              className="h-11 rounded-xl bg-destructive hover:bg-destructive/80 text-white font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-destructive/20"
            >
              Confirm Removal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 🆕 Conflict Resolution Dialog */}
      {pendingConflicts && pendingPack && (
        <ConflictResolutionDialog
          conflicts={pendingConflicts}
          packName={pendingPack.name}
          onResolve={handleConflictResolution}
          open={conflictDialogOpen}
        />
      )}
        </div>
      </div>
    </div>
  );
};

export default Marketplace;
