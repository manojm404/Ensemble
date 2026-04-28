import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Star, GitFork, Download, Play, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { fetchApi } from "@/lib/api";

const macroData: Record<string, {
  name: string; description: string; longDescription: string; category: string;
  stars: number; forks: number; author: string; version: string;
  agents: { name: string; emoji: string; role: string }[];
  params: { key: string; label: string; default: string; description: string }[];
}> = {
  "1": {
    name: "PR Review Bot", category: "DevOps", stars: 342, forks: 89, author: "ensemble-team", version: "2.1.0",
    description: "Automated pull request review with code quality checks, security scanning, and style enforcement.",
    longDescription: "This macro orchestrates a multi-agent pipeline that automatically reviews pull requests. It starts with a code analysis agent that checks for common patterns and anti-patterns, then passes findings to a security scanner for vulnerability detection, and finally runs style enforcement. Results are compiled into a structured review comment posted directly to the PR.",
    agents: [
      { name: "CodeBot", emoji: "🤖", role: "Analyzes code quality and patterns" },
      { name: "SecurityScan", emoji: "🔒", role: "Checks for vulnerabilities" },
      { name: "StyleGuard", emoji: "🎨", role: "Enforces code style rules" },
      { name: "Reviewer", emoji: "📝", role: "Compiles and posts review" },
    ],
    params: [
      { key: "repo", label: "Repository", default: "", description: "GitHub repository (owner/repo)" },
      { key: "severity", label: "Min Severity", default: "warning", description: "Minimum issue severity to report" },
      { key: "style_guide", label: "Style Guide", default: "airbnb", description: "Code style guide to enforce" },
    ],
  },
};

const fallback = macroData["1"];

const catColors: Record<string, string> = {
  DevOps: "bg-badge-red/20 text-badge-red",
  Writing: "bg-badge-green/20 text-badge-green",
  "AI/ML": "bg-badge-purple/20 text-badge-purple",
  Analytics: "bg-badge-blue/20 text-badge-blue",
  Engineering: "bg-badge-orange/20 text-badge-orange",
};

const MacroDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [macro, setMacro] = useState(macroData["1"]);

  useEffect(() => {
    if (id && id !== "1") {
      fetchApi(`/api/macros/${id}`).then(data => {
        if (data) {
          setMacro({
            ...macroData["1"],
            name: "Custom Macro",
            description: "A community loaded macro execution pipeline.",
            longDescription: "Loaded from the backend.",
            agents: data.nodes ? data.nodes.map((n: any) => ({
              name: (n.data?.label || "Agent").replace(/[^a-zA-Z\s]/g, '').trim(),
              emoji: n.data?.emoji || "🤖",
              role: n.data?.subtitle || "Step"
            })) : []
          });
        }
      }).catch(console.error);
    }
  }, [id]);

  const handleUseTemplate = () => {
    toast.success(`"${macro.name}" template added to your workflows`, { description: "Opening workflow editor..." });
    setTimeout(() => navigate("/workflows/new"), 600);
  };

  const handleFork = () => {
    toast.success(`Forked "${macro.name}" to your workspace`);
  };

  const handleRunWithConfig = () => {
    toast.success(`Running "${macro.name}" with current configuration...`, { description: "Workflow execution started" });
  };

  const handleCloneToWorkflows = () => {
    toast.success(`"${macro.name}" cloned to your Workflows`, { description: "You can now edit it in the workflow editor" });
    setTimeout(() => navigate("/workflows/new"), 600);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-border/50">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/macros")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold text-foreground">{macro.name}</h2>
        <Badge variant="secondary" className={`text-[10px] ${catColors[macro.category] || ""}`}>{macro.category}</Badge>
        <Badge variant="secondary" className="text-[10px] ml-1">v{macro.version}</Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleFork}><GitFork className="h-3.5 w-3.5" /> Fork</Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={handleUseTemplate}><Download className="h-3.5 w-3.5" /> Use Template</Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Star className="h-4 w-4 text-badge-orange" /> {macro.stars} stars</span>
              <span className="flex items-center gap-1.5"><GitFork className="h-4 w-4" /> {macro.forks} forks</span>
              <span>by <span className="text-foreground font-medium">{macro.author}</span></span>
            </div>
          </motion.div>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="h-9 bg-secondary/50">
              <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
              <TabsTrigger value="agents" className="text-xs">Agents ({macro.agents.length})</TabsTrigger>
              <TabsTrigger value="configure" className="text-xs">Configure</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                <p className="text-sm text-muted-foreground leading-relaxed">{macro.longDescription}</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="rounded-xl border border-border/50 bg-card/50 p-6"
              >
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Pipeline Flow</h3>
                <div className="flex items-center gap-3 overflow-x-auto pb-2">
                  {macro.agents.map((agent, i) => (
                    <div key={agent.name} className="flex items-center gap-3 shrink-0">
                      <div className="rounded-xl border border-border/50 bg-secondary/50 px-4 py-3 text-center min-w-[120px]">
                        <span className="text-xl">{agent.emoji}</span>
                        <p className="text-xs font-medium text-foreground mt-1">{agent.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{agent.role}</p>
                      </div>
                      {i < macro.agents.length - 1 && (
                        <div className="flex items-center text-primary">
                          <div className="w-8 h-px bg-primary/50" />
                          <div className="w-0 h-0 border-l-[6px] border-l-primary/50 border-y-[4px] border-y-transparent" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            </TabsContent>

            <TabsContent value="agents" className="mt-4">
              <div className="space-y-3">
                {macro.agents.map((agent, i) => (
                  <motion.div
                    key={agent.name}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-center gap-4 rounded-xl border border-border/50 bg-card/50 p-4"
                  >
                    <span className="text-2xl">{agent.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{agent.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{agent.role}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">Step {i + 1}</Badge>
                  </motion.div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="configure" className="mt-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 max-w-lg">
                <p className="text-sm text-muted-foreground">Customize parameters before using this template.</p>
                {macro.params.map((param) => (
                  <div key={param.key} className="space-y-1.5">
                    <Label className="text-sm">{param.label}</Label>
                    <Input
                      defaultValue={param.default}
                      placeholder={param.description}
                      className="bg-secondary/50 border-border/50"
                    />
                    <p className="text-[11px] text-muted-foreground">{param.description}</p>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <Button className="gap-1.5" onClick={handleRunWithConfig}><Play className="h-3.5 w-3.5" /> Run with Config</Button>
                  <Button variant="outline" className="gap-1.5" onClick={handleCloneToWorkflows}><Copy className="h-3.5 w-3.5" /> Clone to Workflows</Button>
                </div>
              </motion.div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
};

export default MacroDetail;
