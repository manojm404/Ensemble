import { useState, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, ExternalLink, Settings2, Eye, EyeOff, RefreshCw, Plus, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchApi, API_BASE_URL } from "@/lib/api";

interface Provider {
  name: string;
  icon: string;
  color: string;
  enabled: boolean;
  apiHost?: string;
  models?: number;
  /** "cloud" = remote API provider, "local" = locally-hosted LLM */
  type?: "cloud" | "local";
  /** Backend provider key (e.g., "gemini", "ollama") */
  providerKey?: string;
}

const defaultProviders: Provider[] = [
  { name: "Gemini (Google)", icon: "G", color: "hsl(220 70% 55%)", enabled: true, apiHost: "https://generativelanguage.googleapis.com", models: 0, type: "cloud", providerKey: "gemini" },
  { name: "CherryIN", icon: "IN", color: "hsl(0 70% 55%)", enabled: false, apiHost: "https://open.cherryin.net", models: 0, type: "cloud", providerKey: "cherryin" },
  { name: "SiliconFlow", icon: "SF", color: "hsl(220 60% 55%)", enabled: false },
  { name: "AiHubMix", icon: "AH", color: "hsl(260 50% 55%)", enabled: false },
  { name: "DeepSeek", icon: "DS", color: "hsl(200 70% 45%)", enabled: false, type: "cloud", providerKey: "openai" },
];

/** Local LLM providers — connect to locally-hosted models via compatible APIs */
const localProviders: Provider[] = [
  { name: "Ollama", icon: "OL", color: "hsl(0 0% 15%)", enabled: false, apiHost: "http://localhost:11434", type: "local", providerKey: "ollama" },
  { name: "LM Studio", icon: "LM", color: "hsl(260 70% 50%)", enabled: false, apiHost: "http://localhost:1234", type: "local", providerKey: "openai" },
  { name: "LocalAI", icon: "LA", color: "hsl(140 60% 40%)", enabled: false, apiHost: "http://localhost:8080", type: "local", providerKey: "openai" },
  { name: "llama.cpp", icon: "LC", color: "hsl(30 70% 50%)", enabled: false, apiHost: "http://localhost:8080", type: "local", providerKey: "openai" },
  { name: "vLLM", icon: "VL", color: "hsl(350 60% 50%)", enabled: false, apiHost: "http://localhost:8000", type: "local", providerKey: "openai" },
];

const LOCAL_STORAGE_KEY = "ensemble_llm_provider";

export default function ProvidersSettings() {
  const [providers, setProviders] = useState<Provider[]>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return [...defaultProviders, ...localProviders].map(p => ({
          ...p,
          enabled: p.providerKey === parsed.providerKey
        }));
      } catch { }
    }
    return [...defaultProviders, ...localProviders];
  });
  const [selectedName, setSelectedName] = useState("Gemini (Google)");
  const [search, setSearch] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [apiHost, setApiHost] = useState("");
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; response_time_ms?: number } | null>(null);
  const [currentProvider, setCurrentProvider] = useState<{ provider: string; model: string; base_url?: string } | null>(null);

  // Load current provider from backend on mount
  useEffect(() => {
    fetchApi('/api/settings/provider')
      .then(config => {
        setCurrentProvider(config);
        // Sync UI with backend
        setProviders(prev =>
          prev.map(p => ({
            ...p,
            enabled: p.providerKey === config.provider
          }))
        );
        if (config.provider === "ollama" && config.base_url) {
          setApiHost(config.base_url);
        }
      })
      .catch(err => {
        console.error("Failed to load provider settings:", err);
      });
  }, []);

  const cloudFiltered = providers.filter((p) =>
    p.type !== "local" && p.name.toLowerCase().includes(search.toLowerCase())
  );
  const localFiltered = providers.filter((p) =>
    p.type === "local" && p.name.toLowerCase().includes(search.toLowerCase())
  );
  const selected = providers.find((p) => p.name === selectedName) || providers[0];

  const toggleProvider = async (name: string) => {
    const provider = providers.find(p => p.name === name);
    if (!provider || !provider.providerKey) {
      toast.error("Provider not configurable");
      return;
    }

    setProviders((prev) =>
      prev.map((p) => ({ ...p, enabled: p.name === name }))
    );

    // Save to localStorage (UI state only, NO API keys)
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
      providerKey: provider.providerKey,
      providerName: name
    }));

    // Call backend to switch provider
    try {
      const body: any = {
        provider: provider.providerKey,
        model: provider.providerKey === "gemini" ? "gemini-2.5-flash" : "llama3.2"
      };

      if (provider.type === "local" && provider.apiHost) {
        body.base_url = apiHost || provider.apiHost;
      }

      const result = await fetchApi('/api/settings/provider', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      if (result.success) {
        setCurrentProvider(result.config);
        toast.success(`Switched to ${name}`, {
          description: `Model: ${result.config.model}`
        });
      }
    } catch (err: any) {
      toast.error("Failed to switch provider", {
        description: err.message || "Check backend logs for details"
      });
      // Revert UI state
      setProviders(prev =>
        prev.map(p => ({
          ...p,
          enabled: p.providerKey === currentProvider?.provider
        }))
      );
    }
  };

  const testConnection = useCallback(async () => {
    setTestingConnection(true);
    setTestResult(null);

    try {
      const result = await fetchApi('/api/settings/test', {
        method: 'POST'
      });

      setTestResult(result);

      if (result.success) {
        toast.success("Connection successful!", {
          description: `${result.message} (${result.response_time_ms}ms)`
        });
      } else {
        toast.error("Connection failed", {
          description: result.message
        });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
      toast.error("Connection test failed", {
        description: err.message
      });
    } finally {
      setTestingConnection(false);
    }
  }, []);

  return (
    <div className="flex h-full">
      {/* Provider list */}
      <div className="w-64 border-r border-border/50 shrink-0 flex flex-col">
        <div className="p-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search Providers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-secondary/50 border-border/50"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {/* Cloud Providers section */}
          <div className="px-3 pt-1 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cloud Providers</span>
          </div>
          <div className="px-2 pb-2 space-y-0.5">
            {cloudFiltered.map((p) => (
              <button
                key={p.name}
                onClick={() => setSelectedName(p.name)}
                className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all ${
                  selectedName === p.name
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                }`}
              >
                <div
                  className="h-6 w-6 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                  style={{ backgroundColor: p.color }}
                >
                  {p.icon}
                </div>
                <span className="truncate flex-1 text-left">{p.name}</span>
                {p.enabled && (
                  <Badge variant="secondary" className="bg-badge-green/20 text-badge-green text-[9px] px-1.5 py-0">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                  </Badge>
                )}
              </button>
            ))}
          </div>

          {/* Local LLM section */}
          <div className="px-3 pt-3 pb-1 border-t border-border/30">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Local LLMs</span>
          </div>
          <div className="px-2 pb-2 space-y-0.5">
            {localFiltered.map((p) => (
              <button
                key={p.name}
                onClick={() => setSelectedName(p.name)}
                className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all ${
                  selectedName === p.name
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                }`}
              >
                <div
                  className="h-6 w-6 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                  style={{ backgroundColor: p.color }}
                >
                  {p.icon}
                </div>
                <span className="truncate flex-1 text-left">{p.name}</span>
                {p.enabled && (
                  <Badge variant="secondary" className="bg-badge-green/20 text-badge-green text-[9px] px-1.5 py-0">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                  </Badge>
                )}
              </button>
            ))}
          </div>

          <div className="px-2 pb-3">
            <Button variant="outline" size="sm" className="w-full gap-1 text-xs">
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
        </ScrollArea>
      </div>

      {/* Provider detail */}
      <ScrollArea className="flex-1">
        <div className="p-6 max-w-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground">{selected.name}</h2>
              {selected.type === "local" && (
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Local</Badge>
              )}
              {currentProvider?.provider === selected.providerKey && (
                <Badge variant="secondary" className="bg-badge-green/20 text-badge-green text-[10px]">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              )}
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
            </div>
            <Switch
              checked={selected.enabled}
              onCheckedChange={() => toggleProvider(selected.name)}
            />
          </div>

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="h-20 w-20 rounded-2xl flex items-center justify-center text-2xl font-bold text-white mb-4"
              style={{ backgroundColor: selected.color }}
            >
              {selected.icon}
            </div>
            {selected.type !== "local" && (
              <>
                <p className="text-xs text-muted-foreground mt-2">
                  Provided by {selected.name.toLowerCase()}
                </p>
              </>
            )}
            {selected.type === "local" && (
              <p className="text-xs text-muted-foreground mt-1 text-center max-w-xs">
                Connects to a locally-running LLM server via OpenAI-compatible API
              </p>
            )}
          </div>

          {/* API Host */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-foreground">
                {selected.type === "local" ? "Server URL" : "API Host"}
              </h3>
              <span className="text-xs text-muted-foreground">ⓘ</span>
              <div className="flex-1" />
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <Input
              placeholder={selected.type === "local" ? "http://localhost:11434" : "https://api.provider.com"}
              value={apiHost || selected.apiHost || ""}
              onChange={(e) => setApiHost(e.target.value)}
              className="bg-secondary/50 border-border/50"
            />
            <p className="text-xs text-muted-foreground">
              {selected.type === "local"
                ? `Ensure ${selected.name} is running locally before connecting`
                : `Preview: ${selected.apiHost || "https://api.provider.com"}/v1/chat/completions`}
            </p>
          </div>

          {/* Connection test */}
          <div className="space-y-3 mt-6">
            <h3 className="text-sm font-medium text-foreground">Connection</h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={testingConnection}
                onClick={testConnection}
              >
                {testingConnection ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> Testing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3" /> Test Connection
                  </>
                )}
              </Button>
            </div>

            {testResult && (
              <div className={`mt-2 p-3 rounded-md border text-xs ${
                testResult.success
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-destructive/10 border-destructive/30 text-destructive"
              }`}>
                <div className="flex items-start gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{testResult.message}</p>
                    {testResult.response_time_ms !== undefined && (
                      <p className="mt-1 opacity-80">Response time: {testResult.response_time_ms}ms</p>
                    )}
                    {testResult.response_preview && (
                      <p className="mt-1 opacity-60 truncate">{testResult.response_preview}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Make sure {selected.name} is running and accessible at the URL above
            </p>
          </div>

          {/* Current Configuration */}
          {currentProvider && (
            <div className="space-y-3 mt-6 p-4 rounded-lg bg-secondary/30 border border-border/30">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-badge-green" />
                Active Configuration
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Provider:</span>
                  <span className="font-mono text-foreground">{currentProvider.provider}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Model:</span>
                  <span className="font-mono text-foreground">{currentProvider.model}</span>
                </div>
                {currentProvider.base_url && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base URL:</span>
                    <span className="font-mono text-foreground truncate max-w-[300px]">{currentProvider.base_url}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
