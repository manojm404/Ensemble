import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ApiKeyRecord,
  deleteApiKey,
  getModels,
  getProviderSettings,
  listApiKeys,
  saveApiKey,
  saveProviderSettings,
  testApiKey,
  fetchApi,
  type ModelInfo,
} from "@/lib/api";

type ProviderKind = "cloud" | "local" | "compatible";

type ProviderOption = {
  id: string;
  name: string;
  description: string;
  kind: ProviderKind;
  accent: string;
  defaultModel: string;
  defaultBaseUrl?: string;
  models: string[];
  requiresKey: boolean;
  note: string;
};

const PROVIDERS: ProviderOption[] = [
  {
    id: "gemini",
    name: "Gemini",
    description: "Google's fast, multimodal cloud models.",
    kind: "cloud",
    accent: "hsl(220 70% 55%)",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    requiresKey: true,
    note: "Uses the Google Gemini API and your saved API key.",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Low-latency OpenAI-compatible inference with Groq production models.",
    kind: "cloud",
    accent: "hsl(191 85% 45%)",
    defaultModel: "llama-3.1-8b-instant",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    models: [
      "llama-3.1-8b-instant",
      "llama-3.3-70b-versatile",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "deepseek-r1-distill-llama-70b",
    ],
    requiresKey: true,
    note: "Uses Groq's current production models. Pick one of the active model IDs below.",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "General-purpose OpenAI-compatible models.",
    kind: "cloud",
    accent: "hsl(220 18% 18%)",
    defaultModel: "gpt-4o-mini",
    defaultBaseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o"],
    requiresKey: true,
    note: "Works with OpenAI API keys and compatible endpoints.",
  },
  {
    id: "openai_compatible",
    name: "OpenAI-Compatible",
    description: "Bring your own OpenAI-compatible endpoint such as Cerebras or similar hosts.",
    kind: "compatible",
    accent: "hsl(263 85% 58%)",
    defaultModel: "",
    defaultBaseUrl: "https://api.cerebras.ai/v1",
    models: [],
    requiresKey: true,
    note: "Use this for any endpoint that speaks the OpenAI chat/completions API.",
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Local models through an OpenAI-compatible API.",
    kind: "local",
    accent: "hsl(28 70% 48%)",
    defaultModel: "llama3.2",
    defaultBaseUrl: "http://localhost:11434/v1",
    models: ["llama3.2", "llama3.1", "qwen2.5"],
    requiresKey: false,
    note: "Connect to a local Ollama server before testing.",
  },
];

export default function ProvidersSettings() {
  const [selectedProviderId, setSelectedProviderId] = useState(PROVIDERS[0].id);
  const [model, setModel] = useState(PROVIDERS[0].defaultModel);
  const [baseUrl, setBaseUrl] = useState(PROVIDERS[0].defaultBaseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [activating, setActivating] = useState(false);
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [activeProvider, setActiveProvider] = useState<{ provider: string; model: string; base_url?: string | null } | null>(null);
  const [supportedModels, setSupportedModels] = useState<ModelInfo[]>([]);

  const selectedProvider = useMemo(
    () => PROVIDERS.find((provider) => provider.id === selectedProviderId) ?? PROVIDERS[0],
    [selectedProviderId]
  );

  const filteredProviders = useMemo(
    () => PROVIDERS.filter((provider) => provider.name.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  const providerModels = useMemo(() => {
    const byProvider = new Map<string, ModelInfo[]>();
    for (const model of supportedModels) {
      const bucket = byProvider.get(model.provider) || [];
      bucket.push(model);
      byProvider.set(model.provider, bucket);
    }
    return byProvider;
  }, [supportedModels]);

  const refreshState = async () => {
    setLoading(true);
    setApiKey("");
    setShowKey(false);
    try {
      const [providerConfig, apiKeys] = await Promise.all([getProviderSettings(), listApiKeys()]);
      setActiveProvider(providerConfig);
      setKeys(apiKeys);

      const providerId = providerConfig.provider || PROVIDERS[0].id;
      const matchedProvider = PROVIDERS.find((provider) => provider.id === providerId) ?? PROVIDERS[0];
      setSelectedProviderId(matchedProvider.id);
      setModel(providerConfig.model || matchedProvider.defaultModel);
      setBaseUrl(providerConfig.base_url || matchedProvider.defaultBaseUrl || "");
    } catch (error: any) {
      toast.error("Failed to load provider settings", {
        description: error?.message || "Check the backend connection and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([
      refreshState(),
      (async () => {
        try {
          const models = await getModels();
          setSupportedModels(Array.isArray(models) ? models : []);
        } catch {
          setSupportedModels([]);
        }
      })(),
    ]).catch(() => {
    });
  }, []);

  const handleSelectProvider = (providerId: string) => {
    const provider = PROVIDERS.find((item) => item.id === providerId);
    if (!provider) return;

    const isCurrent = activeProvider?.provider === provider.id;
    setSelectedProviderId(provider.id);
    setModel(isCurrent ? activeProvider?.model || provider.defaultModel : provider.defaultModel);
    setBaseUrl(isCurrent ? activeProvider?.base_url || provider.defaultBaseUrl || "" : provider.defaultBaseUrl || "");
    setApiKey("");
    setShowKey(false);
  };

  const currentProviderModels = useMemo(() => {
    if (selectedProvider.kind === "compatible") {
      return [];
    }
    const runtimeModels = providerModels.get(selectedProvider.id) || [];
    if (runtimeModels.length > 0) {
      return runtimeModels;
    }
    return selectedProvider.models.map((modelId) => ({
      id: modelId,
      name: modelId,
      provider: selectedProvider.id,
      capabilities: [],
    }));
  }, [providerModels, selectedProvider.id, selectedProvider.models]);

  const managedProviderModelUnsupported = selectedProvider.kind !== "compatible"
    && Boolean(model.trim())
    && currentProviderModels.length > 0
    && !currentProviderModels.some((item) => item.id === model.trim());

  useEffect(() => {
    if (!model.trim() && selectedProvider.defaultModel) {
      setModel(selectedProvider.defaultModel);
    }
  }, [model, selectedProvider.defaultModel]);

  const persistKey = async () => {
    if (!selectedProvider.requiresKey) {
      return;
    }

    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      toast.error("Add an API key first");
      return;
    }

    setSavingKey(true);
    try {
      await saveApiKey(selectedProvider.id, trimmedKey);
      const refreshedKeys = await listApiKeys();
      setKeys(refreshedKeys);
      setApiKey("");
      toast.success(`${selectedProvider.name} key saved`, {
        description: "The key is encrypted and stored for this workspace.",
      });
    } catch (error: any) {
      toast.error("Failed to save API key", {
        description: error?.message || "Please check the key and try again.",
      });
    } finally {
      setSavingKey(false);
    }
  };

  const activateProvider = async () => {
    try {
      if (managedProviderModelUnsupported) {
        toast.error("Unsupported model", {
          description: "Choose one of the curated, tested models before activating this provider.",
        });
        return;
      }
      if (selectedProvider.kind === "compatible" && !baseUrl.trim()) {
        toast.error("Base URL required", {
          description: "Enter the OpenAI-compatible endpoint URL first.",
        });
        return;
      }
      setActivating(true);
      const payload: { provider: string; model: string; base_url?: string } = {
        provider: selectedProvider.id,
        model: model || selectedProvider.defaultModel,
      };

      if (selectedProvider.kind !== "cloud" || baseUrl.trim()) {
        payload.base_url = baseUrl.trim() || selectedProvider.defaultBaseUrl || "";
      }

      const response = await saveProviderSettings(payload);
      setActiveProvider(response.config);
      try {
        const [refreshedConfig, refreshedKeys] = await Promise.all([getProviderSettings(), listApiKeys()]);
        setActiveProvider(refreshedConfig);
        setKeys(refreshedKeys);
        const refreshedProvider = PROVIDERS.find((provider) => provider.id === (refreshedConfig.provider || selectedProvider.id)) ?? selectedProvider;
        setSelectedProviderId(refreshedProvider.id);
        setModel(refreshedConfig.model || refreshedProvider.defaultModel);
        setBaseUrl(refreshedConfig.base_url || refreshedProvider.defaultBaseUrl || "");
      } catch {
        // Keep the successfully saved config even if the refresh call fails.
      }
      if (Array.isArray((response as any).warnings) && (response as any).warnings.length > 0) {
        toast((response as any).warnings[0], {
          description: "Saved as a custom model name and will be used for future runs.",
        });
      }
      toast.success(`Activated ${selectedProvider.name}`, {
        description: `${response.config.model}${response.config.base_url ? ` · ${response.config.base_url}` : ""}`,
      });
    } catch (error: any) {
      toast.error("Failed to activate provider", {
        description: error?.message || "Check backend logs for details.",
      });
    } finally {
      setActivating(false);
    }
  };

  const testConnection = async () => {
    try {
      const chosenModel = (model || selectedProvider.defaultModel || "").trim();
      if (!chosenModel) {
        toast.error("Model required", {
          description: "Choose or enter a model before testing the connection.",
        });
        return;
      }
      if (managedProviderModelUnsupported) {
        toast.error("Unsupported model", {
          description: "Choose one of the curated, tested models before testing this provider.",
        });
        return;
      }
      setTestingKey(true);

      if (selectedProvider.kind === "local" || selectedProvider.kind === "compatible") {
        await fetchApi("/api/settings/test", {
          method: "POST",
          body: JSON.stringify({
            provider: selectedProvider.id,
            model: chosenModel,
            base_url: baseUrl.trim() || selectedProvider.defaultBaseUrl || "",
          }),
        });
        toast.success("Connection looks good", {
          description: `${selectedProvider.name} responded successfully.`,
        });
        return;
      }

      const trimmedKey = apiKey.trim();
      const result = await testApiKey(
        selectedProvider.id,
        trimmedKey || undefined,
        chosenModel,
        baseUrl.trim() || selectedProvider.defaultBaseUrl || undefined
      );

      if (result.success) {
        toast.success(result.message, {
          description: "The API key is valid and ready to use.",
        });
      } else {
        toast.error("Connection test failed", {
          description: result.message,
        });
      }
    } catch (error: any) {
      toast.error("Connection test failed", {
        description: error?.message || "Please check the API key and try again.",
      });
    } finally {
      setTestingKey(false);
    }
  };

  const removeKey = async (keyId: string) => {
    try {
      await deleteApiKey(keyId);
      setKeys((current) => current.filter((key) => key.id !== keyId));
      toast.success("API key removed");
    } catch (error: any) {
      toast.error("Failed to remove API key", {
        description: error?.message || "Try again in a moment.",
      });
    }
  };

  const copyKeySuffix = async (keySuffix: string) => {
    await navigator.clipboard.writeText(keySuffix);
    toast.success("Copied key suffix");
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center rounded-3xl border border-border/50 bg-card/70">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading provider settings...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-border/50 bg-card/70 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <div className="border-b border-border/50 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Model Provider</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure cloud or local LLM providers, store API keys, and verify connections without leaving the page.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            {keys.length} saved key{keys.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-border/50 lg:border-b-0 lg:border-r lg:border-border/50">
          <div className="border-b border-border/50 p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search providers"
                className="h-10 bg-background/70 pl-9 text-sm"
              />
            </div>
          </div>

          <ScrollArea className="h-[320px] lg:h-[calc(100vh-260px)]">
            <div className="space-y-3 p-4">
              {filteredProviders.map((provider) => {
                const isActive = activeProvider?.provider === provider.id;
                const isSelected = selectedProviderId === provider.id;
                return (
                  <button
                    key={provider.id}
                    onClick={() => handleSelectProvider(provider.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition-all ${
                      isSelected
                        ? "border-primary/30 bg-primary/5 shadow-[0_12px_30px_rgba(59,130,246,0.08)]"
                        : "border-border/50 bg-background/40 hover:border-border hover:bg-background/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold text-white shadow-sm"
                          style={{ backgroundColor: provider.accent }}
                        >
                          {provider.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{provider.name}</p>
                            {isActive && (
                              <Badge className="border-0 bg-emerald-500/15 text-emerald-600">Active</Badge>
                            )}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{provider.description}</p>
                          {provider.kind === "compatible" && (
                            <p className="mt-2 text-[11px] leading-5 text-primary/80">
                              Use this for Cerebras or any other OpenAI-compatible endpoint.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge variant="secondary" className="bg-background/80 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {provider.kind}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{provider.defaultModel}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </aside>

        <main className="min-h-0">
          <ScrollArea className="h-[calc(100vh-260px)]">
            <div className="space-y-6 p-6">
              <section className="rounded-3xl border border-border/50 bg-background/70 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-semibold text-white shadow-sm"
                        style={{ backgroundColor: selectedProvider.accent }}
                      >
                        {selectedProvider.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-semibold text-foreground">{selectedProvider.name}</h2>
                          {selectedProvider.kind === "local" ? (
                            <Badge variant="outline" className="border-primary/30 text-primary">
                              Local
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-border/50 text-muted-foreground">
                              Cloud
                            </Badge>
                          )}
                          {activeProvider?.provider === selectedProvider.id && (
                            <Badge className="border-0 bg-emerald-500/15 text-emerald-600">Currently active</Badge>
                          )}
                          {keys.some((key) => key.provider === selectedProvider.id) && (
                            <Badge variant="outline" className="border-border/50 text-muted-foreground">
                              Key saved
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{selectedProvider.description}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-2xl border border-border/50 bg-card/60 px-4 py-3 text-xs text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5" />
                    {selectedProvider.requiresKey ? "Key required" : "No key required"}
                  </div>
                </div>

                <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground">{selectedProvider.note}</p>
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <div className="rounded-3xl border border-border/50 bg-card/70 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Connection details</h3>
                  </div>

	                    <div className="space-y-4">
	                      <div className="space-y-2">
	                        <div className="flex items-center justify-between gap-3">
	                          <label className="text-sm font-medium text-foreground">Model</label>
	                          <span className="text-xs text-muted-foreground">
	                            {selectedProvider.kind === "compatible" ? "Endpoint-specific model name" : "Curated tested models only"}
	                          </span>
	                        </div>
	                        <Input
	                          value={model}
	                          onChange={(event) => {
	                            if (selectedProvider.kind === "compatible") setModel(event.target.value);
	                          }}
	                          readOnly={selectedProvider.kind !== "compatible"}
	                          placeholder={selectedProvider.kind === "compatible" ? "e.g. zai-glm-4.7 or provider-specific model id" : selectedProvider.defaultModel || "Choose a tested model below"}
	                          className={`h-11 bg-background/70 ${selectedProvider.kind !== "compatible" ? "cursor-default" : ""}`}
	                        />
	                      <p className="text-xs text-muted-foreground">
	                        {selectedProvider.kind === "compatible"
	                          ? "OpenAI-compatible endpoints can use the model name exposed by that endpoint. Test it before running workflows."
	                          : "Managed providers only allow curated, tested model IDs so workflows do not fail silently."}
	                      </p>
	                      {selectedProvider.kind !== "compatible" && currentProviderModels.length > 0 && (
	                        <div className="space-y-2">
	                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Supported models</p>
	                          <div className="flex flex-wrap gap-2">
                            {currentProviderModels.map((modelInfo) => {
                              const isSelected = modelInfo.id === model;
                              return (
                                <button
                                  key={modelInfo.id}
                                  type="button"
                                  onClick={() => setModel(modelInfo.id)}
                                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                                    isSelected
                                      ? "border-primary/30 bg-primary/10 text-primary"
                                      : "border-border/50 bg-background/60 text-muted-foreground hover:border-border hover:text-foreground"
                                  }`}
                                >
                                  {modelInfo.name || modelInfo.id}
                                </button>
                              );
                            })}
                          </div>
	                        </div>
	                      )}
	                      {managedProviderModelUnsupported && (
	                        <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-600">
	                          Unsupported saved model. Choose one of the supported models above before testing or activating this provider.
	                        </p>
	                      )}
                    </div>

                    {selectedProvider.kind === "local" || selectedProvider.kind === "compatible" ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-sm font-medium text-foreground">Base URL</label>
                          <span className="text-xs text-muted-foreground">OpenAI-compatible endpoint</span>
                        </div>
                        <Input
                          value={baseUrl}
                          onChange={(event) => setBaseUrl(event.target.value)}
                          placeholder={selectedProvider.defaultBaseUrl}
                          className="h-11 bg-background/70"
                        />
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Server className="h-4 w-4 text-muted-foreground" />
                          Base URL
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {selectedProvider.defaultBaseUrl || "Managed by the provider"}
                        </p>
                      </div>
                    )}

                    {selectedProvider.requiresKey ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-sm font-medium text-foreground">API key</label>
                          <button
                            type="button"
                            onClick={() => setShowKey((current) => !current)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            {showKey ? "Hide" : "Show"}
                          </button>
                        </div>
                        <Input
                          type={showKey ? "text" : "password"}
                          value={apiKey}
                          onChange={(event) => setApiKey(event.target.value)}
                          placeholder={`Paste your ${selectedProvider.name} API key`}
                          className="h-11 bg-background/70 font-mono text-sm"
                          autoComplete="off"
                        />
                        <p className="text-xs leading-5 text-muted-foreground">
                          {selectedProvider.name} keys are encrypted before storage. We only show the suffix after saving.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <ShieldCheck className="h-4 w-4 text-emerald-500" />
                          No API key needed
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Activate this provider once the endpoint is reachable.
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-2">
                      {selectedProvider.requiresKey && (
                        <Button
                          variant="outline"
                          className="gap-2"
                          onClick={persistKey}
                          disabled={savingKey || !apiKey.trim()}
                        >
                          {savingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                          Save key
                        </Button>
                      )}
	                      <Button variant="outline" className="gap-2" onClick={testConnection} disabled={testingKey || managedProviderModelUnsupported}>
	                        {testingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
	                        Test connection
	                      </Button>
	                      <Button className="gap-2" onClick={activateProvider} disabled={activating || managedProviderModelUnsupported}>
	                        {activating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
	                        Activate provider
                      </Button>
                    </div>

                    <div className="rounded-2xl border border-border/50 bg-secondary/30 p-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                        Recommended flow
                      </div>
                      <ol className="mt-3 space-y-1.5 text-sm leading-6">
                        <li>1. Paste the provider key if it needs one.</li>
                        <li>2. Save the key so it is encrypted in your workspace.</li>
                        <li>3. Activate the provider and run a quick connection test.</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-3xl border border-border/50 bg-card/70 p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <h3 className="text-sm font-semibold text-foreground">Active configuration</h3>
                    </div>

                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/70 px-4 py-3">
                        <span className="text-muted-foreground">Provider</span>
                        <span className="font-mono text-foreground">{activeProvider?.provider || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/70 px-4 py-3">
                        <span className="text-muted-foreground">Model</span>
                        <span className="font-mono text-foreground">{activeProvider?.model || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/70 px-4 py-3">
                        <span className="text-muted-foreground">Base URL</span>
                        <span className="max-w-[200px] truncate font-mono text-foreground">
                          {activeProvider?.base_url || "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border/50 bg-card/70 p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">Saved keys</h3>
                    </div>

                    <div className="space-y-3">
                      {keys.length > 0 ? (
                        keys.map((key) => (
                          <div
                            key={key.id}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/70 px-4 py-3"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground">{key.provider}</span>
                                {key.is_active && (
                                  <Badge className="border-0 bg-emerald-500/15 text-emerald-600">Active</Badge>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">••••••{key.key_suffix}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => copyKeySuffix(key.key_suffix)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => removeKey(key.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border/60 bg-background/50 px-4 py-8 text-center">
                          <p className="text-sm font-medium text-foreground">No saved API keys yet</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Save a Groq, Gemini, or OpenAI key to reuse it across sessions.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}
