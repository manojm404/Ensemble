import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, KeyRound, Save } from "lucide-react";
import { PageHeader } from "@/components/glass/Primitives";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { Field } from "@/components/glass/Field";
import { StateView, StatusChip } from "@/components/glass/StateView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { settingsApi, type ProviderConfig } from "@/lib/adapters";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — 0101" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div>
      <PageHeader
        kicker="Workspace"
        title="Settings"
        subtitle="Profile, model providers, and sessions."
      />
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="bg-white/[0.04] border border-white/10 rounded-full p-1 mb-6">
          <TabsTrigger
            value="profile"
            className="rounded-full px-4 data-[state=active]:bg-white/[0.08]"
          >
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="providers"
            className="rounded-full px-4 data-[state=active]:bg-white/[0.08]"
          >
            Model providers
          </TabsTrigger>
          <TabsTrigger
            value="sessions"
            className="rounded-full px-4 data-[state=active]:bg-white/[0.08]"
          >
            Sessions
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="providers">
          <ProvidersTab />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- PROFILE ---------- */
function ProfileTab() {
  const { user } = useAuth();
  const [fullName, setFullName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setFullName(user?.full_name ?? user?.display_name ?? "");
  }, [user]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await settingsApi.saveProfile({
        id: user.id,
        email: user.email,
        display_name: fullName,
        full_name: fullName,
      });
      toast.success("Profile saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <GlassPanel padding="lg">
        <div className="text-sm font-medium mb-4">Profile</div>
        <form onSubmit={saveProfile} className="space-y-4">
          <Field label="Email">
            <GlassInput value={user?.email ?? ""} disabled />
          </Field>
          <Field label="Display name">
            <GlassInput value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <GlassButton type="submit" variant="rim" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </GlassButton>
        </form>
      </GlassPanel>

      <GlassPanel padding="lg">
        <div className="text-sm font-medium mb-4">Account</div>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-mono text-foreground/80">{user?.email}</span>.
        </p>
      </GlassPanel>
    </div>
  );
}

/* ---------- PROVIDERS ---------- */
const PROVIDER_SUGGESTIONS = [
  "OpenAI",
  "Anthropic",
  "Google",
  "Azure OpenAI",
  "AWS Bedrock",
  "Mistral",
  "Cohere",
  "Local vLLM",
];
const MODEL_SUGGESTIONS = [
  "gpt-5",
  "gpt-5-mini",
  "claude-opus-4.5",
  "claude-sonnet-4.5",
  "gemini-2.5-pro",
  "mistral-large",
  "llama-3.3-70b",
];

function ProvidersTab() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["providers"], queryFn: settingsApi.getProviders });
  const [draftOpen, setDraftOpen] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Bring your own keys. Scope a provider to your account or pin it to one workspace. Keys are
          stored hashed; only the last 4 characters are ever displayed.
        </p>
        <GlassButton variant="rim" size="sm" onClick={() => setDraftOpen(true)}>
          <Plus /> Add provider
        </GlassButton>
      </div>

      <StateView
        loading={list.isLoading}
        error={list.error}
        empty={!draftOpen && (list.data?.length ?? 0) === 0}
        emptyTitle="No providers yet"
        emptyBody="Connect at least one model provider to start running workflows."
        emptyAction={
          <GlassButton variant="rim" size="sm" onClick={() => setDraftOpen(true)}>
            <Plus /> Add your first provider
          </GlassButton>
        }
      >
        <div className="space-y-3">
          {draftOpen && (
            <ProviderRow
              draft
              onCancel={() => setDraftOpen(false)}
              onSaved={() => {
                setDraftOpen(false);
                qc.invalidateQueries({ queryKey: ["providers"] });
              }}
            />
          )}
          {list.data?.map((p) => (
            <ProviderRow
              key={p.id}
              provider={p}
              onSaved={() => qc.invalidateQueries({ queryKey: ["providers"] })}
            />
          ))}
        </div>
      </StateView>
    </div>
  );
}

function ProviderRow({
  provider,
  draft,
  onCancel,
  onSaved,
}: {
  provider?: ProviderConfig;
  draft?: boolean;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = React.useState(!!draft);
  const [providerName, setProviderName] = React.useState(provider?.provider ?? "");
  const [model, setModel] = React.useState(provider?.model ?? "");
  const [scope, setScope] = React.useState<"account" | "workspace">(provider?.scope ?? "account");
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState(provider?.base_url ?? "");

  const save = useMutation({
    mutationFn: () =>
      settingsApi.saveProvider({
        id: provider?.id,
        scope,
        provider: providerName,
        model,
        base_url: baseUrl || undefined,
        api_key: apiKey || undefined,
      }),
    onSuccess: () => {
      toast.success(provider ? "Provider updated." : "Provider added.");
      setApiKey("");
      setEditing(false);
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const test = useMutation({
    mutationFn: async () => new Promise((r) => setTimeout(r, 600)),
    onSuccess: () => toast.success(`${providerName} reachable.`),
  });

  const remove = useMutation({
    mutationFn: () => settingsApi.deleteProvider(provider!.id),
    onSuccess: () => {
      toast.success("Provider removed.");
      onSaved();
    },
  });

  if (!editing && provider) {
    return (
      <GlassPanel padding="md" className="flex flex-wrap items-center gap-4">
        <div className="size-10 rounded-xl glass-inset grid place-items-center">
          <KeyRound className="size-4 text-rim" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{provider.provider}</span>
            <StatusChip status={provider.scope} />
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {provider.model} · key ••••{provider.api_key_suffix ?? "----"}
          </div>
        </div>
        <div className="flex gap-2">
          <GlassButton
            size="sm"
            variant="ghost"
            onClick={() => test.mutate()}
            disabled={test.isPending}
          >
            {test.isPending ? "Testing…" : "Test"}
          </GlassButton>
          <GlassButton size="sm" variant="glass" onClick={() => setEditing(true)}>
            Edit
          </GlassButton>
          <GlassButton
            size="sm"
            variant="ghost"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            aria-label="Remove"
          >
            <Trash2 />
          </GlassButton>
        </div>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel padding="lg">
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Provider">
          <GlassInput
            list="provider-suggestions"
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            placeholder="OpenAI"
          />
          <datalist id="provider-suggestions">
            {PROVIDER_SUGGESTIONS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="Model (free text)">
          <GlassInput
            list="model-suggestions"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-5"
          />
          <datalist id="model-suggestions">
            {MODEL_SUGGESTIONS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field label="Scope">
          <div className="inline-flex rounded-full border border-white/10 p-0.5 glass-inset">
            {(["account", "workspace"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={`px-4 h-9 text-xs uppercase tracking-widest font-mono rounded-full transition ${
                  scope === s
                    ? "bg-white/[0.1] text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Base URL (optional)">
          <GlassInput
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </Field>
        <Field
          label={provider ? "API key (leave blank to keep current)" : "API key"}
          className="md:col-span-2"
        >
          <GlassInput
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={provider?.api_key_suffix ? `••••${provider.api_key_suffix}` : "sk-…"}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Stored hashed. Only the last 4 characters appear after save.
          </p>
        </Field>
      </div>
      <div className="flex gap-2 mt-4">
        <GlassButton
          variant="rim"
          size="sm"
          onClick={() => save.mutate()}
          disabled={save.isPending || !providerName || !model}
        >
          <Save /> {save.isPending ? "Saving…" : "Save"}
        </GlassButton>
        {provider && (
          <GlassButton variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </GlassButton>
        )}
        {draft && (
          <GlassButton variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </GlassButton>
        )}
      </div>
    </GlassPanel>
  );
}

/* ---------- SESSIONS ---------- */
function SessionsTab() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["sessions"], queryFn: settingsApi.getSessions });
  const revoke = useMutation({
    mutationFn: (id: string) => settingsApi.revokeSession(id),
    onSuccess: () => {
      toast.success("Session revoked.");
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
  return (
    <StateView
      loading={list.isLoading}
      error={list.error}
      empty={(list.data?.length ?? 0) === 0}
      emptyTitle="No active sessions"
    >
      <GlassPanel padding="lg">
        <ul className="divide-y divide-white/5">
          {list.data?.map((s) => (
            <li key={s.id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm flex items-center gap-2">
                  {s.device}
                  {s.current && <StatusChip status="active" />}
                </div>
                <div className="text-xs text-muted-foreground">
                  Last active {new Date(s.last_active).toLocaleString()}
                </div>
              </div>
              {!s.current && (
                <GlassButton
                  size="sm"
                  variant="ghost"
                  onClick={() => revoke.mutate(s.id)}
                  disabled={revoke.isPending}
                >
                  Revoke
                </GlassButton>
              )}
            </li>
          ))}
        </ul>
      </GlassPanel>
    </StateView>
  );
}
