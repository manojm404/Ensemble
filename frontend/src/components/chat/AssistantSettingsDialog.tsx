import { useState } from "react";
import { X, Plus, Settings2, AlertCircle, Save, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface AssistantConfig {
  name: string;
  emoji: string;
  model: string;
  temperature: number;
  temperatureEnabled: boolean;
  topP: number;
  topPEnabled: boolean;
  context: number;
  maxTokensEnabled: boolean;
  maxTokens: number;
  streamOutput: boolean;
  toolUseMode: string;
  maxToolCallsEnabled: boolean;
  maxToolCalls: number;
  prompt: string;
  knowledgeBase: string;
  knowledgeBaseMode: string;
  mcpMode: string;
  memoryEnabled: boolean;
}

const defaultConfig: AssistantConfig = {
  name: "Ensemble AI Assistant",
  emoji: "🤖",
  model: "",
  temperature: 0.7,
  temperatureEnabled: false,
  topP: 0.9,
  topPEnabled: false,
  context: 5,
  maxTokensEnabled: false,
  maxTokens: 4096,
  streamOutput: true,
  toolUseMode: "function",
  maxToolCallsEnabled: true,
  maxToolCalls: 20,
  prompt: "",
  knowledgeBase: "",
  knowledgeBaseMode: "force",
  mcpMode: "disabled",
  memoryEnabled: false,
};

const tabs = [
  "Model Settings",
  "Prompt Settings",
  "Knowledge Base",
  "MCP Servers",
  "Regular Phrases",
  "Memories",
];

const emojiOptions = ["🤖", "🧠", "⚡", "🎯", "💬", "🔮", "🌟", "🛡️", "🎨", "📊"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AssistantConfig;
  onConfigChange: (config: AssistantConfig) => void;
}

function HelpIcon({ tip }: { tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help">
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px] text-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}

export function AssistantSettingsDialog({ open, onOpenChange, config, onConfigChange }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const [localConfig, setLocalConfig] = useState<AssistantConfig>(config);

  const update = <K extends keyof AssistantConfig>(key: K, value: AssistantConfig[K]) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onConfigChange(localConfig);
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="relative w-[780px] max-h-[85vh] rounded-2xl border border-border/50 bg-card shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
              <h2 className="text-base font-semibold text-foreground">{localConfig.name}</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-1 min-h-0">
              {/* Sidebar tabs */}
              <nav className="w-[200px] border-r border-border/30 py-2 flex-shrink-0">
                {tabs.map((tab, i) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(i)}
                    className={`w-full text-left px-5 py-2.5 text-sm transition-colors ${
                      activeTab === i
                        ? "bg-primary/10 text-primary border-l-2 border-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </nav>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.15 }}
                  >
                    {activeTab === 0 && <ModelSettings config={localConfig} update={update} />}
                    {activeTab === 1 && <PromptSettings config={localConfig} update={update} />}
                    {activeTab === 2 && <KnowledgeBaseSettings config={localConfig} update={update} />}
                    {activeTab === 3 && <MCPSettings config={localConfig} update={update} />}
                    {activeTab === 4 && <RegularPhraseSettings />}
                    {activeTab === 5 && <MemorySettings config={localConfig} update={update} />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border/30">
              <Button variant="outline" size="sm" onClick={() => setLocalConfig(defaultConfig)}>
                Reset
              </Button>
              <Button size="sm" onClick={handleSave} className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                Save
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Tab: Model Settings ─── */
function ModelSettings({ config, update }: { config: AssistantConfig; update: <K extends keyof AssistantConfig>(k: K, v: AssistantConfig[K]) => void }) {
  const modelProviders = [
    { group: "OpenAI", models: [{ id: "openai/gpt-5", label: "GPT-5" }, { id: "openai/gpt-5-mini", label: "GPT-5 Mini" }, { id: "openai/gpt-5-nano", label: "GPT-5 Nano" }] },
    { group: "Google", models: [{ id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" }, { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" }, { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash" }] },
    { group: "Anthropic", models: [{ id: "anthropic/claude-4-sonnet", label: "Claude 4 Sonnet" }, { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" }] },
    { group: "Meta", models: [{ id: "meta/llama-4", label: "Llama 4" }] },
    { group: "DeepSeek", models: [{ id: "deepseek/v3", label: "DeepSeek V3" }, { id: "deepseek/r1", label: "DeepSeek R1" }] },
  ];

  return (
    <div className="space-y-0">
      {/* Default Model */}
      <div className="flex items-center justify-between py-4 border-b border-border/20">
        <span className="text-sm font-medium text-foreground">Default Model</span>
        <Select value={config.model} onValueChange={(v) => update("model", v)}>
          <SelectTrigger className="w-52 bg-secondary/30 border-border/40">
            <SelectValue placeholder="+ Select Model" />
          </SelectTrigger>
          <SelectContent>
            {modelProviders.map((provider) => (
              <div key={provider.group}>
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{provider.group}</div>
                {provider.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Temperature */}
      <SettingRow label="Temperature" help="Controls randomness. Lower = more deterministic.">
        <Switch checked={config.temperatureEnabled} onCheckedChange={(v) => update("temperatureEnabled", v)} />
      </SettingRow>
      {config.temperatureEnabled && (
        <div className="pb-4 pl-1">
          <Slider value={[config.temperature]} onValueChange={([v]) => update("temperature", v)} min={0} max={2} step={0.1} className="w-full" />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>0</span><span>{config.temperature}</span><span>2</span></div>
        </div>
      )}

      {/* Top-P */}
      <SettingRow label="Top-P" help="Nucleus sampling threshold.">
        <Switch checked={config.topPEnabled} onCheckedChange={(v) => update("topPEnabled", v)} />
      </SettingRow>

      {/* Context */}
      <div className="py-4 border-b border-border/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-foreground">Context</span>
            <HelpIcon tip="Number of previous messages to include." />
          </div>
          <span className="text-sm font-medium text-foreground">{config.context}</span>
        </div>
        <Slider value={[config.context]} onValueChange={([v]) => update("context", v)} min={0} max={100} step={5} className="w-full" />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>0</span><span>25</span><span>50</span><span>75</span><span>Unlimited</span>
        </div>
      </div>

      {/* Max Tokens */}
      <SettingRow label="Set max tokens" help="Maximum tokens in the response.">
        <Switch checked={config.maxTokensEnabled} onCheckedChange={(v) => update("maxTokensEnabled", v)} />
      </SettingRow>
      {config.maxTokensEnabled && (
        <div className="pb-4">
          <Input type="number" value={config.maxTokens} onChange={(e) => update("maxTokens", Number(e.target.value))} className="w-32 bg-secondary/30 border-border/40" />
        </div>
      )}

      {/* Stream Output */}
      <SettingRow label="Stream output">
        <Switch checked={config.streamOutput} onCheckedChange={(v) => update("streamOutput", v)} />
      </SettingRow>

      {/* Tool Use Mode */}
      <div className="flex items-center justify-between py-4 border-b border-border/20">
        <span className="text-sm font-medium text-foreground">Tool Use Mode</span>
        <Select value={config.toolUseMode} onValueChange={(v) => update("toolUseMode", v)}>
          <SelectTrigger className="w-36 bg-secondary/30 border-border/40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="function">Function</SelectItem>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Max Tool Calls */}
      <SettingRow label="Max Tool Calls" help="Maximum number of tool calls per turn.">
        <Switch checked={config.maxToolCallsEnabled} onCheckedChange={(v) => update("maxToolCallsEnabled", v)} />
      </SettingRow>
      {config.maxToolCallsEnabled && (
        <div className="pb-4">
          <Input type="number" value={config.maxToolCalls} onChange={(e) => update("maxToolCalls", Number(e.target.value))} className="w-32 bg-secondary/30 border-border/40" />
        </div>
      )}

      {/* Custom Parameters */}
      <div className="flex items-center justify-between py-4">
        <span className="text-sm font-medium text-foreground">Custom Parameters</span>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => toast.info("Custom Parameters", { description: "Add key-value pairs to customize model behavior" })}>
          <Plus className="h-3 w-3" /> Add Parameter
        </Button>
      </div>
    </div>
  );
}

/* ─── Tab: Prompt Settings ─── */
function PromptSettings({ config, update }: { config: AssistantConfig; update: <K extends keyof AssistantConfig>(k: K, v: AssistantConfig[K]) => void }) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Name</label>
        <div className="flex gap-2 items-center">
          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild>
              <button
                className="h-10 w-10 rounded-lg bg-secondary/40 border border-border/40 flex items-center justify-center text-lg hover:bg-secondary/60 transition-colors shrink-0"
              >
                {config.emoji}
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-auto p-2">
              <div className="grid grid-cols-5 gap-1">
                {emojiOptions.map((e) => (
                  <button
                    key={e}
                    onClick={() => { update("emoji", e); setShowEmojiPicker(false); }}
                    className="h-8 w-8 rounded hover:bg-muted/50 flex items-center justify-center text-base transition-colors"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Input value={config.name} onChange={(e) => update("name", e.target.value)} className="flex-1 bg-secondary/30 border-border/40" />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <label className="text-sm font-medium text-foreground">Prompt</label>
          <HelpIcon tip="System prompt that defines the assistant's behavior." />
        </div>
        <Textarea
          value={config.prompt}
          onChange={(e) => update("prompt", e.target.value)}
          placeholder="You are a helpful AI assistant..."
          className="min-h-[300px] bg-secondary/20 border-border/40 resize-none"
        />
        <p className="text-xs text-muted-foreground mt-1.5">Tokens: {config.prompt.length > 0 ? Math.ceil(config.prompt.length / 4) : 0}</p>
      </div>
    </div>
  );
}

/* ─── Tab: Knowledge Base ─── */
function KnowledgeBaseSettings({ config, update }: { config: AssistantConfig; update: <K extends keyof AssistantConfig>(k: K, v: AssistantConfig[K]) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Knowledge Base</label>
        <Select value={config.knowledgeBase} onValueChange={(v) => update("knowledgeBase", v)}>
          <SelectTrigger className="w-full bg-secondary/30 border-border/40">
            <SelectValue placeholder="Select Knowledge Base" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-3 block">Use Knowledge Base</label>
        <div className="flex rounded-lg border border-border/40 overflow-hidden w-fit">
          {["force", "intent"].map((mode) => (
            <button
              key={mode}
              onClick={() => update("knowledgeBaseMode", mode)}
              className={`px-4 py-2 text-sm transition-colors ${
                config.knowledgeBaseMode === mode
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "force" ? "Force Search" : (
                <span className="flex items-center gap-1">Intent Recognition <HelpIcon tip="AI decides when to search." /></span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: MCP Servers ─── */
interface MCPServer {
  id: string;
  name: string;
  url: string;
  transport: "http" | "sse" | "stdio";
  apiKey: string;
  enabled: boolean;
}

import { getMCPServers, saveMCPServers, getRegularPhrases, saveRegularPhrases, getMemories, saveMemories } from "@/lib/api";

function MCPSettings({ config, update }: { config: AssistantConfig; update: <K extends keyof AssistantConfig>(k: K, v: AssistantConfig[K]) => void }) {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newServer, setNewServer] = useState<Omit<MCPServer, "id" | "enabled">>({
    name: "", url: "", transport: "http", apiKey: "",
  });

  useEffect(() => {
    let mounted = true;
    getMCPServers().then(data => {
      if (mounted) {
        setServers(Array.isArray(data) ? data : []);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  const saveServersList = async (newList: MCPServer[]) => {
    setServers(newList);
    await saveMCPServers(newList);
  };

  const modes = [
    { id: "disabled", title: "Disabled", desc: "No MCP tools" },
    { id: "auto", title: "Auto", desc: "AI discovers and uses tools automatically", accent: true },
    { id: "manual", title: "Manual", desc: "Select specific MCP servers", accent: true },
  ];

  const handleAddServer = () => {
    if (!newServer.name.trim() || !newServer.url.trim()) {
      toast.error("Name and URL are required");
      return;
    }
    const updated = [...servers, { ...newServer, id: Date.now().toString(), enabled: true }];
    saveServersList(updated);
    setNewServer({ name: "", url: "", transport: "http", apiKey: "" });
    setShowAddForm(false);
    toast.success(`Added MCP server: ${newServer.name}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-medium text-foreground">MCP Settings</h3>
        <HelpIcon tip="Model Context Protocol enables tool usage from external services." />
      </div>

      {/* Mode selector */}
      <div className="space-y-3">
        {modes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => update("mcpMode", mode.id)}
            className={`w-full text-left rounded-xl border p-4 transition-all ${
              config.mcpMode === mode.id
                ? "border-primary/50 bg-primary/5"
                : "border-border/40 hover:border-border/60"
            }`}
          >
            <p className={`text-sm font-medium ${mode.accent && config.mcpMode === mode.id ? "text-primary" : "text-foreground"}`}>
              {mode.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{mode.desc}</p>
          </button>
        ))}
      </div>

      {/* Server list */}
      {config.mcpMode !== "disabled" && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">Servers ({servers.length})</h4>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShowAddForm(true)}>
              <Plus className="h-3 w-3" /> Add Server
            </Button>
          </div>

          {/* Existing servers */}
          {servers.map((server) => (
            <div key={server.id} className="rounded-lg border border-border/40 p-3 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{server.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{server.url}</p>
                <span className="text-[10px] text-muted-foreground/60">{server.transport.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={server.enabled}
                  onCheckedChange={(v) => {
                    const newServers = servers.map((s) => s.id === server.id ? { ...s, enabled: v } : s);
                    saveServersList(newServers);
                  }}
                />
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => saveServersList(servers.filter((s) => s.id !== server.id))}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}

          {loading && <div className="text-xs text-muted-foreground pt-2">Loading servers...</div>}

          {servers.length === 0 && !showAddForm && !loading && (
            <div className="rounded-xl border border-dashed border-border/40 p-6 text-center">
              <p className="text-sm text-muted-foreground">No MCP servers configured</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Add a server to enable external tool access</p>
            </div>
          )}

          {/* Add server form */}
          <AnimatePresence>
            {showAddForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <h4 className="text-sm font-medium text-foreground">New MCP Server</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Server Name *</label>
                      <Input
                        placeholder="e.g. My MCP Server"
                        value={newServer.name}
                        onChange={(e) => setNewServer((p) => ({ ...p, name: e.target.value }))}
                        className="bg-secondary/30 border-border/40 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Transport</label>
                      <Select value={newServer.transport} onValueChange={(v) => setNewServer((p) => ({ ...p, transport: v as MCPServer["transport"] }))}>
                        <SelectTrigger className="bg-secondary/30 border-border/40 h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="http">Streamable HTTP</SelectItem>
                          <SelectItem value="sse">SSE (Legacy)</SelectItem>
                          <SelectItem value="stdio">Stdio (Local)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Server URL *</label>
                    <Input
                      placeholder="https://mcp-server.example.com/mcp"
                      value={newServer.url}
                      onChange={(e) => setNewServer((p) => ({ ...p, url: e.target.value }))}
                      className="bg-secondary/30 border-border/40 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">API Key (optional)</label>
                    <Input
                      placeholder="Bearer token or API key"
                      type="password"
                      value={newServer.apiKey}
                      onChange={(e) => setNewServer((p) => ({ ...p, apiKey: e.target.value }))}
                      className="bg-secondary/30 border-border/40 h-8 text-sm"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowAddForm(false)}>Cancel</Button>
                    <Button size="sm" className="text-xs gap-1" onClick={handleAddServer}>
                      <Plus className="h-3 w-3" /> Add Server
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ─── Tab: Regular Phrases ─── */
interface PhraseItem {
  id: string;
  title: string;
  content: string;
  shortcut: string;
}

function RegularPhraseSettings() {
  const [phrases, setPhrases] = useState<PhraseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPhrase, setNewPhrase] = useState({ title: "", content: "", shortcut: "" });

  useEffect(() => {
    let mounted = true;
    getRegularPhrases().then(data => {
      if (mounted) {
        setPhrases(Array.isArray(data) ? data : []);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  const savePhrasesList = async (newList: PhraseItem[]) => {
    setPhrases(newList);
    await saveRegularPhrases(newList);
  };

  const handleAddPhrase = () => {
    if (!newPhrase.title.trim() || !newPhrase.content.trim()) {
      toast.error("Title and content are required");
      return;
    }
    const updated = [...phrases, { ...newPhrase, id: Date.now().toString() }];
    savePhrasesList(updated);
    setNewPhrase({ title: "", content: "", shortcut: "" });
    setShowAddForm(false);
    toast.success(`Added phrase: ${newPhrase.title}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground">Regular Phrases</h3>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShowAddForm(true)}>
          <Plus className="h-3 w-3" /> Add Phrase
        </Button>
      </div>

      {/* Existing phrases */}
      <div className="space-y-2">
        {phrases.map((phrase) => (
          <div key={phrase.id} className="rounded-lg border border-border/40 p-3 flex items-start justify-between group">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{phrase.title}</p>
                {phrase.shortcut && (
                  <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">/{phrase.shortcut}</kbd>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{phrase.content}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => savePhrasesList(phrases.filter((p) => p.id !== phrase.id))}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {loading && <div className="text-xs text-muted-foreground pt-2">Loading phrases...</div>}

      {phrases.length === 0 && !showAddForm && !loading && (
        <div className="rounded-xl border border-dashed border-border/40 p-8 text-center">
          <p className="text-sm text-muted-foreground">No phrases configured</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add frequently used phrases for quick access in chat</p>
        </div>
      )}

      {/* Add phrase form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-3"
          >
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <h4 className="text-sm font-medium text-foreground">New Phrase</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
                  <Input
                    placeholder="e.g. Code Review Request"
                    value={newPhrase.title}
                    onChange={(e) => setNewPhrase((p) => ({ ...p, title: e.target.value }))}
                    className="bg-secondary/30 border-border/40 h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Shortcut (optional)</label>
                  <Input
                    placeholder="e.g. review"
                    value={newPhrase.shortcut}
                    onChange={(e) => setNewPhrase((p) => ({ ...p, shortcut: e.target.value }))}
                    className="bg-secondary/30 border-border/40 h-8 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Phrase Content *</label>
                <Textarea
                  placeholder="Please review the following code for best practices, performance, and security..."
                  value={newPhrase.content}
                  onChange={(e) => setNewPhrase((p) => ({ ...p, content: e.target.value }))}
                  className="bg-secondary/30 border-border/40 min-h-[80px] text-sm resize-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowAddForm(false)}>Cancel</Button>
                <Button size="sm" className="text-xs gap-1" onClick={handleAddPhrase}>
                  <Plus className="h-3 w-3" /> Add Phrase
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Tab: Memories ─── */
interface MemoryItem {
  id: string;
  content: string;
  source: "document" | "text" | "url";
  label: string;
  addedAt: Date;
}

function MemorySettings({ config, update }: { config: AssistantConfig; update: <K extends keyof AssistantConfig>(k: K, v: AssistantConfig[K]) => void }) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMemory, setNewMemory] = useState({ content: "", source: "text" as MemoryItem["source"], label: "" });

  useEffect(() => {
    let mounted = true;
    getMemories().then(data => {
      if (mounted) {
        setMemories(Array.isArray(data) ? data : []);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  const saveMemoriesList = async (newList: MemoryItem[]) => {
    setMemories(newList);
    await saveMemories(newList);
  };

  const handleAddMemory = () => {
    if (!newMemory.label.trim()) {
      toast.error("Label is required");
      return;
    }
    const updated = [...memories, { ...newMemory, id: Date.now().toString(), addedAt: new Date() }];
    saveMemoriesList(updated);
    setNewMemory({ content: "", source: "text", label: "" });
    setShowAddForm(false);
    toast.success(`Added memory: ${newMemory.label}`);
  };

  /** MOCKED — File upload stores filename only */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const updated = [...memories, {
        id: Date.now().toString(),
        content: `Uploaded: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`,
        source: "document" as const,
        label: file.name,
        addedAt: new Date(),
      }];
      saveMemoriesList(updated);
      toast.success(`Uploaded document: ${file.name}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-medium text-foreground">Memories</h3>
          <HelpIcon tip="Enable persistent memory across conversations." />
        </div>
        <div className="flex items-center gap-2">
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          <Switch checked={config.memoryEnabled} onCheckedChange={(v) => update("memoryEnabled", v)} />
        </div>
      </div>

      {!config.memoryEnabled && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Global Memory Disabled</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enable memory to store documents and context for the assistant.
            </p>
          </div>
          <Button variant="outline" size="sm" className="text-xs flex-shrink-0" onClick={() => update("memoryEnabled", true)}>Enable</Button>
        </div>
      )}

      {config.memoryEnabled && (
        <>
          <div className="flex items-center justify-between">
            <div className="rounded-xl border border-border/40 px-4 py-2.5 flex-1 mr-3">
              <span className="text-sm text-foreground">Stored Memories: </span>
              <span className="text-sm font-medium text-foreground">{memories.length}</span>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShowAddForm(true)}>
              <Plus className="h-3 w-3" /> Add Memory
            </Button>
          </div>

          {/* Existing memories */}
          <div className="space-y-2">
            {memories.map((mem) => (
              <div key={mem.id} className="rounded-lg border border-border/40 p-3 flex items-start justify-between group">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{mem.source === "document" ? "📄" : mem.source === "url" ? "🔗" : "📝"}</span>
                    <p className="text-sm font-medium text-foreground">{mem.label}</p>
                    <span className="text-[10px] text-muted-foreground/60">{mem.source}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{mem.content}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => saveMemoriesList(memories.filter((m) => m.id !== mem.id))}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          {loading && <div className="text-xs text-muted-foreground pt-2">Loading memories...</div>}

          {memories.length === 0 && !showAddForm && !loading && (
            <div className="rounded-xl border border-dashed border-border/40 p-6 text-center">
              <p className="text-sm text-muted-foreground">No memories stored</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Add documents, text, or URLs as context for the assistant</p>
            </div>
          )}

          {/* Add memory form */}
          <AnimatePresence>
            {showAddForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <h4 className="text-sm font-medium text-foreground">Add Memory</h4>
                  
                  {/* Source type selector */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Source Type</label>
                    <div className="flex rounded-lg border border-border/40 overflow-hidden w-fit">
                      {([["text", "📝 Text"], ["document", "📄 Document"], ["url", "🔗 URL"]] as const).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => setNewMemory((p) => ({ ...p, source: val }))}
                          className={`px-3 py-1.5 text-xs transition-colors ${
                            newMemory.source === val
                              ? "bg-secondary text-foreground font-medium"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Label *</label>
                    <Input
                      placeholder="e.g. Project Guidelines"
                      value={newMemory.label}
                      onChange={(e) => setNewMemory((p) => ({ ...p, label: e.target.value }))}
                      className="bg-secondary/30 border-border/40 h-8 text-sm"
                    />
                  </div>

                  {newMemory.source === "document" ? (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Upload Document</label>
                      <div className="flex gap-2">
                        <input
                          type="file"
                          accept=".pdf,.txt,.md,.doc,.docx,.csv,.json"
                          onChange={handleFileUpload}
                          className="text-xs text-muted-foreground file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-secondary file:text-foreground hover:file:bg-secondary/80"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Supports: PDF, TXT, MD, DOC, CSV, JSON</p>
                    </div>
                  ) : newMemory.source === "url" ? (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">URL</label>
                      <Input
                        placeholder="https://docs.example.com/guide"
                        value={newMemory.content}
                        onChange={(e) => setNewMemory((p) => ({ ...p, content: e.target.value }))}
                        className="bg-secondary/30 border-border/40 h-8 text-sm"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Content</label>
                      <Textarea
                        placeholder="Paste any text, notes, or context you want the assistant to remember..."
                        value={newMemory.content}
                        onChange={(e) => setNewMemory((p) => ({ ...p, content: e.target.value }))}
                        className="bg-secondary/30 border-border/40 min-h-[80px] text-sm resize-none"
                      />
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowAddForm(false)}>Cancel</Button>
                    <Button size="sm" className="text-xs gap-1" onClick={handleAddMemory}>
                      <Plus className="h-3 w-3" /> Add Memory
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

/* ─── Shared row component ─── */
function SettingRow({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-border/20">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {help && <HelpIcon tip={help} />}
      </div>
      {children}
    </div>
  );
}

export { defaultConfig };
export type { AssistantConfig };
