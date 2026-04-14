import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Github, 
  ArrowLeft, 
  Search, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Package, 
  Bot, 
  ChevronRight,
  ShieldCheck,
  Zap,
  Info
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { MotionCard, StaggerContainer, StaggerItem } from "@/components/ui/motion-card";
import { toast } from "sonner";
import { 
  startImportJob, 
  getImportStatus, 
  getImportResult, 
  installImportedPack,
  syncRegistry,
  ImportJobStatus 
} from "@/lib/api";

const ImportAgents = () => {
  const navigate = useNavigate();
  const [repoUrl, setRepoUrl] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<ImportJobStatus | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installedPacks, setInstalledPacks] = useState<Set<string>>(new Set());

  useEffect(() => {
    // 🆕 Reload job status when page is focused
    if (jobId) {
      const reloadStatus = async () => {
        try {
          const s = await getImportStatus(jobId);
          setStatus(s);
        } catch (e) {}
      };
      window.addEventListener('focus', reloadStatus);
      return () => window.removeEventListener('focus', reloadStatus);
    }
  }, [jobId]);

  // Poll for status if job is running
  useEffect(() => {
    let timer: any;
    if (jobId && (!status || (status.status !== "completed" && status.status !== "failed"))) {
      timer = setInterval(async () => {
        try {
          const s = await getImportStatus(jobId);
          setStatus(s);
          if (s.status === "completed") {
            const res = await getImportResult(jobId);
            setResult(res);
            clearInterval(timer);
          } else if (s.status === "failed") {
            clearInterval(timer);
            toast.error(`Import failed: ${s.error}`);
          }
        } catch (err) {
          console.error("Failed to fetch status:", err);
        }
      }, 2000);
    }
    return () => clearInterval(timer);
  }, [jobId, status]);

  const handleImport = async () => {
    if (!repoUrl) {
      toast.error("Please enter a GitHub repository URL");
      return;
    }

    setLoading(true);
    setResult(null);
    setStatus(null);
    
    try {
      const res = await startImportJob(repoUrl);
      setJobId(res.job_id);
      toast.success("Import job started!");
    } catch (err: any) {
      toast.error(`Failed to start import: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (packId: string) => {
    // If already installed, navigate to Agents page
    if (installedPacks.has(packId)) {
      navigate("/agents");
      return;
    }

    if (!jobId) {
      toast.error("No import job ID found. Please try importing again.");
      return;
    }

    setInstalling(packId);
    try {
      const result = await installImportedPack(packId, jobId);
      const agentCount = result?.total_agents ?? result?.extracted_files ?? 0;

      setInstalledPacks(prev => new Set(prev).add(packId));

      toast.success(`Pack installed! ${agentCount} agent${agentCount !== 1 ? 's' : ''} added to your registry.`);

      // Trigger a global registry sync
      try {
        await syncRegistry();
      } catch (e: any) {
        console.warn("Registry sync failed, but pack was installed", e);
        toast.warning("Pack installed but registry sync failed. Refresh the page to see new agents.");
      }

      // Navigate to Agents page after short delay
      setTimeout(() => navigate("/agents"), 1500);
    } catch (err: any) {
      console.error("Installation error:", err);
      const errorMsg = err?.message || err?.response?.data?.detail || "Unknown error occurred";
      toast.error(`Installation failed: ${errorMsg}`);
    } finally {
      setInstalling(null);
    }
  };
  return (
    <div className="container mx-auto py-8 max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/marketplace")}
            className="rounded-full hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Universal Agent Importer</h1>
            <p className="text-muted-foreground">Import and run agents from ANY GitHub repository natively</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 py-1 px-3">
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
            Secure Sandbox
          </Badge>
          <Badge variant="outline" className="bg-emerald-500/5 text-emerald-400 border-emerald-500/20 py-1 px-3">
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Native Execution
          </Badge>
        </div>
      </div>

      {/* Input Section */}
      <div className="glass p-8 rounded-[2rem] border border-border/50 space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground ml-1">GitHub Repository URL</label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Github className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input 
                placeholder="https://github.com/wshobson/agents" 
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="pl-12 h-14 bg-secondary/30 border-border/50 rounded-2xl text-lg focus:ring-primary/20"
              />
            </div>
            <Button 
              onClick={handleImport} 
              disabled={loading || (jobId !== null && status?.status !== "completed" && status?.status !== "failed")}
              className="h-14 px-8 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20 transition-all active:scale-95"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Search className="h-5 w-5 mr-2" />}
              Import & Analyze
            </Button>
          </div>
        </div>

        {/* Progress Section */}
        {status && (
          <div className="space-y-4 pt-4 border-t border-border/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  {status.status === "completed" ? <CheckCircle2 className="h-6 w-6 text-emerald-400" /> : 
                   status.status === "failed" ? <AlertCircle className="h-6 w-6 text-red-400" /> : 
                   <Loader2 className="h-6 w-6 animate-spin" />}
                </div>
                <div>
                  <h3 className="font-bold text-foreground capitalize">{status.status}...</h3>
                  <p className="text-xs text-muted-foreground">{status.message}</p>
                </div>
              </div>
              <span className="text-sm font-mono font-bold text-primary">{Math.round(status.progress)}%</span>
            </div>
            <Progress value={status.progress} className="h-2 bg-secondary rounded-full overflow-hidden" />
          </div>
        )}
      </div>

      {/* Results Section */}
      {result && (
        <div className="space-y-6">
          <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-2xl flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Import Successful!</h3>
              <p className="text-sm text-muted-foreground">Discovered {result.total_agents} agents across {result.packs?.length} categories. Click <strong>Install Pack</strong> below to add them to your fleet.</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Discovered Agent Packs ({result.packs?.length || 0})
            </h2>
            <Badge variant="secondary" className="bg-secondary/50 text-muted-foreground">
              Analyzed {result.total_agents} agents in {result.execution_time?.toFixed(1)}s
            </Badge>
          </div>

          <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {result.packs?.map((pack: any, idx: number) => (
              <StaggerItem key={idx}>
                <MotionCard className="glass border-border/50 hover:border-primary/30 transition-all p-6 rounded-[2rem] group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-14 w-14 rounded-2xl bg-secondary/50 flex items-center justify-center text-3xl shadow-inner group-hover:scale-110 transition-transform">
                      {pack.emoji || "📦"}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 capitalize font-bold">
                        {pack.format}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] opacity-70">
                        {pack.agents?.length || 0} Agents
                      </Badge>
                    </div>
                  </div>
                  
                  <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors">{pack.name}</h3>
                  <p className="text-sm text-muted-foreground mb-6 line-clamp-2 leading-relaxed">
                    {pack.description || "No description provided."}
                  </p>

                  <div className="flex items-center gap-3">
                    <Button 
                      variant="outline" 
                      className="flex-1 rounded-xl border-border/50 hover:bg-secondary transition-all"
                      onClick={() => navigate("/marketplace")}
                    >
                      <Info className="h-4 w-4 mr-2" />
                      View in Marketplace
                    </Button>
                    <Button
                      onClick={() => handleInstall(pack.id)}
                      disabled={installing === pack.id}
                      className={`flex-1 rounded-xl font-bold shadow-md transition-all ${
                        installedPacks.has(pack.id)
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                          : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/10"
                      }`}
                    >
                      {installing === pack.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : installedPacks.has(pack.id) ? (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      {installing === pack.id ? "Installing..." : installedPacks.has(pack.id) ? "Installed ✓" : "Install Pack"}
                    </Button>
                  </div>
                </MotionCard>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      )}

      {/* Info Footer */}
      {!result && !status && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500">
          <div className="p-6 rounded-2xl bg-secondary/20 border border-border/30 space-y-3">
            <Bot className="h-8 w-8 text-blue-400" />
            <h4 className="font-bold text-foreground">Multi-Format Support</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Native support for Markdown, Python, YAML, JSON, and Text agents. No conversion needed.
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-secondary/20 border border-border/30 space-y-3">
            <ShieldCheck className="h-8 w-8 text-emerald-400" />
            <h4 className="font-bold text-foreground">Secure Execution</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              All agents run in hardened Docker sandboxes with AST-based security guarding.
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-secondary/20 border border-border/30 space-y-3">
            <Zap className="h-8 w-8 text-amber-400" />
            <h4 className="font-bold text-foreground">Cost Controlled</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Built-in token limiters, budget enforcers, and concurrency management.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportAgents;
