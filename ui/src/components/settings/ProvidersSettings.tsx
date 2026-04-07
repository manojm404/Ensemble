import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, ExternalLink, Settings2, Eye, EyeOff, RefreshCw, Plus } from "lucide-react";
import { toast } from "sonner";

interface Provider {
  name: string;
  icon: string;
  color: string;
  enabled: boolean;
  apiHost?: string;
  models?: number;
  /** "cloud" = remote API provider, "local" = locally-hosted LLM */
  type?: "cloud" | "local";
}

const defaultProviders: Provider[] = [
  { name: "CherryIN", icon: "IN", color: "hsl(0 70% 55%)", enabled: true, apiHost: "https://open.cherryin.net", models: 0 },
  { name: "SiliconFlow", icon: "SF", color: "hsl(220 60% 55%)", enabled: false },
  { name: "AiHubMix", icon: "AH", color: "hsl(260 50% 55%)", enabled: false },
  { name: "ocoolAI", icon: "OC", color: "hsl(0 0% 30%)", enabled: false },
  { name: "BigModel", icon: "BM", color: "hsl(210 60% 50%)", enabled: false },
  { name: "Z.ai", icon: "Z", color: "hsl(0 0% 20%)", enabled: false },
  { name: "DeepSeek", icon: "DS", color: "hsl(200 70% 45%)", enabled: false },
  { name: "Alaya NeW", icon: "AN", color: "hsl(180 40% 45%)", enabled: false },
  { name: "DMXAPI", icon: "DM", color: "hsl(15 80% 55%)", enabled: false },
  { name: "AiOnly", icon: "AO", color: "hsl(240 50% 55%)", enabled: false },
  { name: "BurnCloud", icon: "BC", color: "hsl(25 80% 55%)", enabled: false },
  { name: "TokenFlux", icon: "TF", color: "hsl(250 60% 55%)", enabled: false },
  { name: "302.AI", icon: "3A", color: "hsl(160 60% 45%)", enabled: false },
  { name: "Cephalon", icon: "CP", color: "hsl(210 30% 40%)", enabled: false },
  { name: "LANYUN", icon: "LY", color: "hsl(190 50% 50%)", enabled: false },
  { name: "PH8", icon: "PH", color: "hsl(140 50% 45%)", enabled: false },
  { name: "SophNet", icon: "SN", color: "hsl(330 50% 50%)", enabled: false },
  { name: "PPIO", icon: "PP", color: "hsl(200 50% 45%)", enabled: false },
];

/** Local LLM providers — connect to locally-hosted models via compatible APIs */
const localProviders: Provider[] = [
  { name: "Ollama", icon: "OL", color: "hsl(0 0% 15%)", enabled: false, apiHost: "http://localhost:11434", type: "local" },
  { name: "LM Studio", icon: "LM", color: "hsl(260 70% 50%)", enabled: false, apiHost: "http://localhost:1234", type: "local" },
  { name: "Jan", icon: "JN", color: "hsl(200 80% 50%)", enabled: false, apiHost: "http://localhost:1337", type: "local" },
  { name: "LocalAI", icon: "LA", color: "hsl(140 60% 40%)", enabled: false, apiHost: "http://localhost:8080", type: "local" },
  { name: "llama.cpp", icon: "LC", color: "hsl(30 70% 50%)", enabled: false, apiHost: "http://localhost:8080", type: "local" },
  { name: "vLLM", icon: "VL", color: "hsl(350 60% 50%)", enabled: false, apiHost: "http://localhost:8000", type: "local" },
  { name: "GPT4All", icon: "G4", color: "hsl(120 50% 40%)", enabled: false, apiHost: "http://localhost:4891", type: "local" },
];

export default function ProvidersSettings() {
  const [providers, setProviders] = useState([...defaultProviders, ...localProviders]);
  const [selectedName, setSelectedName] = useState("CherryIN");
  const [search, setSearch] = useState("");
  const [showKey, setShowKey] = useState(false);

  const cloudFiltered = providers.filter((p) =>
    p.type !== "local" && p.name.toLowerCase().includes(search.toLowerCase())
  );
  const localFiltered = providers.filter((p) =>
    p.type === "local" && p.name.toLowerCase().includes(search.toLowerCase())
  );
  const selected = providers.find((p) => p.name === selectedName) || providers[0];

  const toggleProvider = (name: string) => {
    setProviders((prev) =>
      prev.map((p) => (p.name === name ? { ...p, enabled: !p.enabled } : p))
    );
  };

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
                    ON
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
                    ON
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
                <Button variant="outline" size="sm" className="gap-2">
                  → Login
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Provided by {selected.name.toLowerCase()}.ai
                </p>
              </>
            )}
            {selected.type === "local" && (
              <p className="text-xs text-muted-foreground mt-1 text-center max-w-xs">
                Connects to a locally-running LLM server via OpenAI-compatible API
              </p>
            )}
          </div>

          {/* API Key — only for cloud providers */}
          {selected.type !== "local" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">API Key</h3>
                <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder="API Key"
                    type={showKey ? "text" : "password"}
                    className="bg-secondary/50 border-border/50 pr-10"
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button size="sm">Check</Button>
              </div>
              <div className="flex items-center justify-between">
                <a href="#" className="text-xs text-primary hover:underline">Get API Key</a>
                <span className="text-xs text-muted-foreground">Use commas to separate multiple keys</span>
              </div>
            </div>
          )}

          {/* API Host */}
          <div className={`space-y-3 ${selected.type !== "local" ? "mt-6" : ""}`}>
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
              defaultValue={selected.apiHost || ""}
              className="bg-secondary/50 border-border/50"
            />
            <p className="text-xs text-muted-foreground">
              {selected.type === "local"
                ? `Ensure ${selected.name} is running locally before connecting`
                : `Preview: ${selected.apiHost || "https://api.provider.com"}/v1/chat/completions`}
            </p>
          </div>

          {/* Connection test — local providers only */}
          {selected.type === "local" && (
            <div className="space-y-3 mt-6">
              <h3 className="text-sm font-medium text-foreground">Connection</h3>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    /** MOCKED — Would ping the local server to verify it's running */
                    toast(`Pinging ${selected.apiHost}...`);
                  }}
                >
                  <RefreshCw className="h-3 w-3" /> Test Connection
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Make sure {selected.name} is running and accessible at the URL above
              </p>
            </div>
          )}

          {/* Models */}
          <div className="space-y-3 mt-6">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-foreground">Models</h3>
              <Badge variant="secondary" className="text-[10px]">{selected.models ?? 0}</Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5">
                <RefreshCw className="h-3 w-3" /> Fetch model list
              </Button>
              <Button variant="outline" size="sm" className="gap-1">
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {selected.type === "local"
                ? `Models pulled in ${selected.name} will appear here after fetching`
                : <>Check <a href="#" className="text-primary hover:underline">{selected.name} Docs</a> and{" "}
                  <a href="#" className="text-primary hover:underline">Models</a> for more details</>}
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
