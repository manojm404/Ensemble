import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Cpu, SlidersHorizontal, Settings2, Monitor, Database, Server,
  Globe, Brain, Terminal, FileText, Zap, Keyboard, Info,
  Sparkles, MousePointer2, ChevronDown, Loader2, ShieldCheck, Clock3,
} from "lucide-react";
import ProvidersSettings from "@/components/settings/ProvidersSettings";
import QuickAssistantSettings from "@/components/settings/QuickAssistantSettings";
import SelectionAssistantSettings from "@/components/settings/SelectionAssistantSettings";
import { toast } from "sonner";

const coreSettingsNav = [
  { label: "Model Provider", path: "providers", icon: Cpu },
  { label: "General Settings", path: "general", icon: Settings2 },
  { label: "Display Settings", path: "display", icon: Monitor },
  { label: "Budget & Data", path: "data", icon: Database },
  { label: "About & Feedback", path: "about", icon: Info },
];

const advancedSettingsNav = [
  { label: "Default Model", path: "default-model", icon: SlidersHorizontal },
  { label: "MCP Servers", path: "mcp", icon: Server },
  { label: "Web Search", path: "web-search", icon: Globe },
  { label: "Memories", path: "memories", icon: Brain },
  { label: "API Server", path: "api-server", icon: Terminal },
  { label: "Doc Processing", path: "documents", icon: FileText },
  { label: "Quick Phrases", path: "quick-phrases", icon: Zap },
  { label: "Keyboard Shortcuts", path: "shortcuts", icon: Keyboard },
  { label: "Quick Assistant", path: "quick-assistant", icon: Sparkles },
  { label: "Selection Assistant", path: "selection-assistant", icon: MousePointer2 },
];

function SettingsPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-6 max-w-4xl">
      <div className="rounded-3xl border border-border/50 bg-card/75 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <h2 className="text-lg font-semibold text-foreground mb-6">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function SettingsField({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { getUserSettings, saveUserSettings } from "@/lib/api";

function DefaultModelSettings() {
  return (
    <SettingsPage title="Default Model">
      <div className="space-y-0">
        <SettingsField label="Default Assistant Model" description="Primary model for conversations">
          <Select defaultValue="gpt-4o"><SelectTrigger className="w-48 bg-secondary/50 border-border/50 shadow-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="gpt-4o">GPT-4o</SelectItem><SelectItem value="claude">Claude 3.5 Sonnet</SelectItem></SelectContent></Select>
        </SettingsField>
        <SettingsField label="Quick Model" description="For simple, fast tasks">
          <Select defaultValue="gpt-4o-mini"><SelectTrigger className="w-48 bg-secondary/50 border-border/50 shadow-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem><SelectItem value="flash">Gemini Flash</SelectItem></SelectContent></Select>
        </SettingsField>
        <SettingsField label="Translate Model" description="For translation tasks">
          <Select defaultValue="gpt-4o"><SelectTrigger className="w-48 bg-secondary/50 border-border/50 shadow-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="gpt-4o">GPT-4o</SelectItem><SelectItem value="claude">Claude 3.5 Sonnet</SelectItem></SelectContent></Select>
        </SettingsField>
      </div>
    </SettingsPage>
  );
}

function GeneralSettings() {
  return (
    <SettingsPage title="General">
      <div className="space-y-0">
        <SettingsField label="Language"><Select defaultValue="en"><SelectTrigger className="w-40 bg-secondary/50 border-border/50 shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="zh">中文</SelectItem><SelectItem value="ja">日本語</SelectItem></SelectContent></Select></SettingsField>
        <SettingsField label="Theme"><Select defaultValue="system"><SelectTrigger className="w-40 bg-secondary/50 border-border/50 shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="dark">Dark</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="system">System</SelectItem></SelectContent></Select></SettingsField>
        <SettingsField label="Send Key" description="Key combination to send messages"><Select defaultValue="enter"><SelectTrigger className="w-40 bg-secondary/50 border-border/50 shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="enter">Enter</SelectItem><SelectItem value="ctrl-enter">Ctrl+Enter</SelectItem></SelectContent></Select></SettingsField>
        <SettingsField label="Launch at Startup"><Switch /></SettingsField>
      </div>
    </SettingsPage>
  );
}

function DisplaySettings() {
  return (
    <SettingsPage title="Display">
      <div className="space-y-0">
        <SettingsField label="Font Size"><div className="w-40"><Slider defaultValue={[14]} min={12} max={20} step={1} /></div></SettingsField>
        <SettingsField label="Message Style"><Select defaultValue="bubble"><SelectTrigger className="w-40 bg-secondary/50 border-border/50 shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="bubble">Bubble</SelectItem><SelectItem value="flat">Flat</SelectItem></SelectContent></Select></SettingsField>
        <SettingsField label="Show Avatars"><Switch defaultChecked /></SettingsField>
        <SettingsField label="Show Timestamps"><Switch defaultChecked /></SettingsField>
        <SettingsField label="Code Theme"><Select defaultValue="dracula"><SelectTrigger className="w-40 bg-secondary/50 border-border/50 shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="dracula">Dracula</SelectItem><SelectItem value="github-dark">GitHub Dark</SelectItem><SelectItem value="monokai">Monokai</SelectItem></SelectContent></Select></SettingsField>
      </div>
    </SettingsPage>
  );
}

function DataSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approvalThreshold, setApprovalThreshold] = useState("0.0001");
  const [approvalTimeout, setApprovalTimeout] = useState("300");
  const [theme, setTheme] = useState("dark");

  const thresholdValue = useMemo(() => {
    const parsed = Number(approvalThreshold);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }, [approvalThreshold]);

  const timeoutValue = useMemo(() => {
    const parsed = Number(approvalTimeout);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }, [approvalTimeout]);

  const policyValidationMessage = useMemo(() => {
    if (!Number.isFinite(thresholdValue) || thresholdValue < 0) {
      return "Approval threshold must be a number greater than or equal to 0.";
    }
    if (!Number.isInteger(timeoutValue) || timeoutValue < 30 || timeoutValue > 86400) {
      return "Approval timeout must be a whole number between 30 seconds and 24 hours.";
    }
    return null;
  }, [thresholdValue, timeoutValue]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const settings = await getUserSettings();
        if (!mounted) return;
        setApprovalThreshold(String(settings.approval_cost_threshold ?? 0.0001));
        setApprovalTimeout(String(settings.approval_timeout_seconds ?? 300));
        setTheme(settings.theme || "dark");
      } catch (error) {
        toast.error("Failed to load budget settings", {
          description: "Using the release defaults for now.",
        });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async () => {
    if (policyValidationMessage) {
      toast.error("Policy needs a valid value", {
        description: policyValidationMessage,
      });
      return;
    }

    setSaving(true);
    try {
      await saveUserSettings({
        approval_cost_threshold: thresholdValue,
        approval_timeout_seconds: timeoutValue,
        theme,
      });
      toast.success("Budget settings saved", {
        description: `Approval threshold set to $${thresholdValue.toFixed(4)} and timeout set to ${timeoutValue}s.`,
      });
    } catch (error: any) {
      toast.error("Failed to save budget settings", {
        description: error?.message || "Check the backend connection and try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsPage title="Budget & Data">
      {loading ? (
        <div className="flex items-center gap-3 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading budget policy...
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <p className="text-sm font-semibold text-foreground">Approval gate</p>
              </div>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {Number.isFinite(thresholdValue) ? `$${thresholdValue.toFixed(4)}` : "Needs value"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Runs over this amount require approval before continuing.</p>
            </div>

            <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Approval timeout</p>
              </div>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {Number.isFinite(timeoutValue) ? `${timeoutValue}s` : "Needs value"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Automatically escalates stale approvals when the timer expires.</p>
            </div>

            <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-amber-500" />
                <p className="text-sm font-semibold text-foreground">Workspace mode</p>
              </div>
              <p className="mt-2 text-2xl font-semibold text-foreground capitalize">{theme}</p>
              <p className="mt-1 text-xs text-muted-foreground">Data and budget policies follow your current workspace theme and account scope.</p>
            </div>
          </section>

          <section className="rounded-3xl border border-border/50 bg-card/70 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Approval policy</h3>
                <p className="text-xs text-muted-foreground">Control when workflows pause for human review.</p>
              </div>
              <Button onClick={handleSave} disabled={saving || Boolean(policyValidationMessage)} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save policy
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Approval threshold</label>
                <Input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={approvalThreshold}
                  onChange={(event) => setApprovalThreshold(event.target.value)}
                  className="h-11 bg-background/70"
                />
                <p className="text-xs text-muted-foreground">
                  Workflow runs above this cost enter the approval queue before execution continues.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Approval timeout (seconds)</label>
                <Input
                  type="number"
                  min="30"
                  step="30"
                  value={approvalTimeout}
                  onChange={(event) => setApprovalTimeout(event.target.value)}
                  className="h-11 bg-background/70"
                />
                <p className="text-xs text-muted-foreground">
                  If no action is taken before the timeout, the workflow is paused for governance review.
                </p>
              </div>
            </div>

            {policyValidationMessage && (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
                {policyValidationMessage}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <Button variant="outline" size="sm" onClick={() => toast.success("Backup created successfully", { description: "Esemble-backup.json" })}>Backup Data</Button>
              <Button variant="outline" size="sm" onClick={() => toast.info("Restore from backup", { description: "Select a backup file to restore from" })}>Restore Data</Button>
              <Button variant="outline" size="sm" onClick={() => toast.success("Cache cleared", { description: "Temporary data removed from this workspace." })}>Clear Cache</Button>
            </div>
          </section>

          <section className="rounded-3xl border border-border/50 bg-card/70 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Export & recovery</h3>
                <p className="text-xs text-muted-foreground">Keep workspace state portable and easy to restore.</p>
              </div>
              <Badge variant="secondary" className="border border-border/50 bg-background/70 text-muted-foreground">
                Account-scoped
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => toast.success("Exported conversations as JSON")}>Export as JSON</Button>
              <Button variant="outline" size="sm" onClick={() => toast.success("Exported conversations as CSV")}>Export as CSV</Button>
              <Button variant="destructive" size="sm" onClick={() => toast.warning("This action cannot be undone", { description: "Please confirm in the dialog to reset all data" })}>Reset All Data</Button>
            </div>
          </section>
        </div>
      )}
    </SettingsPage>
  );
}

function McpSettings() {
  return (
    <SettingsPage title="MCP Servers">
        <div className="text-center py-12">
        <Server className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground mt-3">No MCP servers configured</p>
        <Button size="sm" className="mt-4 gap-1" onClick={() => toast.info("MCP Server Setup", { description: "Enter your MCP server URL and API key to connect" })}>+ Add Server</Button>
      </div>
    </SettingsPage>
  );
}

function WebSearchSettings() {
  return (
    <SettingsPage title="Web Search">
      <div className="space-y-0">
        <SettingsField label="Search Provider"><Select defaultValue="tavily"><SelectTrigger className="w-48 bg-secondary/50 border-border/50 shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="tavily">Tavily</SelectItem><SelectItem value="serpapi">SerpAPI</SelectItem><SelectItem value="local">Local</SelectItem></SelectContent></Select></SettingsField>
        <SettingsField label="Include dates"><Switch /></SettingsField>
        <SettingsField label="Max Results"><div className="w-40"><Slider defaultValue={[10]} min={1} max={100} step={1} /></div></SettingsField>
        <SettingsField label="Compression"><Select defaultValue="none"><SelectTrigger className="w-48 bg-secondary/50 border-border/50 shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="summary">Summary</SelectItem></SelectContent></Select></SettingsField>
      </div>
      <div className="mt-6 space-y-3">
        <h3 className="text-sm font-medium text-foreground">Blacklist</h3>
        <Textarea placeholder="One domain per line..." className="bg-secondary/50 border-border/50 min-h-[80px] font-mono text-xs" />
      </div>
    </SettingsPage>
  );
}

function MemoriesSettings() {
  return (
    <SettingsPage title="Memories">
      <SettingsField label="Global Memory" description="Enable long-term memory across conversations">
        <div className="flex items-center gap-2"><Badge variant="secondary" className="text-[10px] border border-border/50 bg-background/70 text-muted-foreground">Beta</Badge><Switch /></div>
      </SettingsField>
      <div className="mt-6 text-center py-8">
        <Brain className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground mt-3">No memories yet</p>
        <Button size="sm" className="mt-4 gap-1" onClick={() => toast.info("Add Memory", { description: "Type a fact or preference to remember across conversations" })}>+ Add Memory</Button>
      </div>
    </SettingsPage>
  );
}

function ApiServerSettings() {
  return (
    <SettingsPage title="API Server">
      <p className="text-sm text-muted-foreground mb-6">Expose Esemble agents via a REST API for external integrations.</p>
      <SettingsField label="Status">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-badge-green animate-glow-pulse" />
          <span className="text-sm text-badge-green">Running</span>
        </div>
      </SettingsField>
      <SettingsField label="API Key">
        <div className="flex items-center gap-2">
          <code className="text-xs text-muted-foreground bg-background/70 px-2 py-1 rounded font-mono border border-border/50">ens_••••••••••••</code>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => { navigator.clipboard.writeText("ens_sk_demo_key_12345"); toast.success("API key copied to clipboard"); }}>Copy</Button>
        </div>
      </SettingsField>
      <div className="flex gap-2 mt-6">
        <Button variant="outline" size="sm" onClick={() => toast.success("API server restarted")}>Restart</Button>
        <Button variant="destructive" size="sm" onClick={() => toast.warning("API server stopped")}>Stop</Button>
      </div>
    </SettingsPage>
  );
}

function DocumentSettings() {
  return (
    <SettingsPage title="Document Processing">
      <div className="space-y-6">
      <div className="space-y-0">
          <SettingsField label="OCR Provider" description="Engine used for text extraction from images">
            <Select defaultValue="system"><SelectTrigger className="w-48 bg-secondary/50 border-border/50 shadow-sm"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="system">System OCR</SelectItem><SelectItem value="tesseract">Tesseract</SelectItem><SelectItem value="cloud">Cloud OCR</SelectItem></SelectContent></Select>
          </SettingsField>
          <SettingsField label="Document Provider" description="Parser for PDFs, DOCX, and other documents">
            <Select defaultValue="default"><SelectTrigger className="w-48 bg-secondary/50 border-border/50 shadow-sm"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="default">Default</SelectItem><SelectItem value="unstructured">Unstructured</SelectItem></SelectContent></Select>
          </SettingsField>
          <SettingsField label="Auto-detect Language" description="Detect document language before processing">
            <Switch defaultChecked />
          </SettingsField>
          <SettingsField label="Max File Size" description="Maximum upload size per document">
            <Select defaultValue="50"><SelectTrigger className="w-48 bg-secondary/50 border-border/50 shadow-sm"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="10">10 MB</SelectItem><SelectItem value="25">25 MB</SelectItem><SelectItem value="50">50 MB</SelectItem><SelectItem value="100">100 MB</SelectItem></SelectContent></Select>
          </SettingsField>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Supported Formats</h3>
          <div className="flex flex-wrap gap-1.5">
            {["PDF", "DOCX", "TXT", "MD", "CSV", "XLSX", "PPTX", "HTML", "RTF", "Images"].map((fmt) => (
              <Badge key={fmt} variant="secondary" className="text-[10px]">{fmt}</Badge>
            ))}
          </div>
        </div>
      </div>
    </SettingsPage>
  );
}

function QuickPhrasesSettings() {
  return (
    <SettingsPage title="Quick Phrases">
      <div className="text-center py-12">
        <Zap className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground mt-3">No quick phrases configured</p>
        <Button size="sm" className="mt-4 gap-1" onClick={() => toast.info("Add Quick Phrase", { description: "Create a shortcut phrase for common messages" })}>+ Add Phrase</Button>
      </div>
    </SettingsPage>
  );
}

function ShortcutsSettings() {
  const shortcuts = [
    { action: "New Chat", keys: "⌘ N" },
    { action: "Search Topics", keys: "⌘ K" },
    { action: "Toggle Inspector", keys: "⌘ I" },
    { action: "Toggle Sidebar", keys: "⌘ B" },
    { action: "Settings", keys: "⌘ ," },
    { action: "Send Message", keys: "Enter" },
  ];
  return (
    <SettingsPage title="Keyboard Shortcuts">
      <div className="space-y-1">
        {shortcuts.map((s) => (
          <div key={s.action} className="flex items-center justify-between py-2.5 border-b border-slate-200/80">
            <span className="text-sm text-foreground">{s.action}</span>
            <kbd className="text-xs text-muted-foreground bg-slate-100 px-2 py-1 rounded font-mono border border-slate-200/80">{s.keys}</kbd>
          </div>
        ))}
      </div>
    </SettingsPage>
  );
}

function AboutSettings() {
  const navigate = useNavigate();
  const links = [
    { label: "Documentation", action: () => toast.info("Documentation coming soon") },
    { label: "Release Notes", action: () => toast.info("v0.1.0-alpha — Initial release") },
    { label: "Website", action: () => window.open("https://esemble.ai", "_blank") },
    { label: "Feedback", action: () => toast.success("Thanks! Feedback form opening...", { description: "Your input helps us improve Esemble" }) },
    { label: "Contact", action: () => toast.info("Email us at hello@esemble.ai") },
  ];

  return (
    <SettingsPage title="About & Feedback">
      <div className="text-center mb-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary"><path d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9"/></svg>
        </div>
          <h3 className="text-lg font-semibold text-foreground">Esemble</h3>
        <p className="text-sm text-muted-foreground">Collaborative OS for Multi-Agent Workflows</p>
        <Badge variant="secondary" className="mt-2 text-[10px] bg-slate-100 text-muted-foreground border border-slate-200/80">v0.1.0-alpha</Badge>
      </div>
      <SettingsField label="Auto Update"><Switch defaultChecked /></SettingsField>
        <div className="mt-6 space-y-1">
          {links.map((item) => (
          <button key={item.label} onClick={item.action} className="w-full flex items-center justify-between py-2.5 text-sm text-foreground hover:text-foreground transition-colors border-b border-slate-200/80">
            <span>{item.label}</span>
            <span className="text-muted-foreground">→</span>
          </button>
        ))}
      </div>
    </SettingsPage>
  );
}

const Settings = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname.replace("/settings/", "").replace("/settings", "");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className="flex h-full bg-[linear-gradient(180deg,#e8edf3_0%,#eef2f7_100%)] text-foreground">
      <div className="w-52 border-r border-border/50 shrink-0 bg-card/70 backdrop-blur-xl">
        <div className="p-3 border-b border-slate-200/80">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Settings</h3>
        </div>
        <ScrollArea className="h-[calc(100%-41px)]">
          <div className="p-2 space-y-0.5">
            <div className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50">
              Core
            </div>
            {coreSettingsNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentPath === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(`/settings/${item.path}`)}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setAdvancedOpen((current) => !current)}
              className="mt-3 mb-1 flex w-full items-center justify-between rounded-lg px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              <span>Advanced</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            </button>

            {advancedOpen && advancedSettingsNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentPath === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(`/settings/${item.path}`)}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route index element={<Navigate to="general" replace />} />
          <Route path="providers" element={<ProvidersSettings />} />
          <Route path="default-model" element={<ScrollArea className="h-full"><DefaultModelSettings /></ScrollArea>} />
          <Route path="general" element={<ScrollArea className="h-full"><GeneralSettings /></ScrollArea>} />
          <Route path="display" element={<ScrollArea className="h-full"><DisplaySettings /></ScrollArea>} />
          <Route path="data" element={<ScrollArea className="h-full"><DataSettings /></ScrollArea>} />
          <Route path="mcp" element={<ScrollArea className="h-full"><McpSettings /></ScrollArea>} />
          <Route path="web-search" element={<ScrollArea className="h-full"><WebSearchSettings /></ScrollArea>} />
          <Route path="memories" element={<ScrollArea className="h-full"><MemoriesSettings /></ScrollArea>} />
          <Route path="api-server" element={<ScrollArea className="h-full"><ApiServerSettings /></ScrollArea>} />
          <Route path="documents" element={<ScrollArea className="h-full"><DocumentSettings /></ScrollArea>} />
          <Route path="quick-phrases" element={<ScrollArea className="h-full"><QuickPhrasesSettings /></ScrollArea>} />
          <Route path="shortcuts" element={<ScrollArea className="h-full"><ShortcutsSettings /></ScrollArea>} />
          <Route path="quick-assistant" element={<ScrollArea className="h-full"><QuickAssistantSettings /></ScrollArea>} />
          <Route path="selection-assistant" element={<ScrollArea className="h-full"><SelectionAssistantSettings /></ScrollArea>} />
          <Route path="about" element={<ScrollArea className="h-full"><AboutSettings /></ScrollArea>} />
        </Routes>
      </div>
    </div>
  );
};

export default Settings;
