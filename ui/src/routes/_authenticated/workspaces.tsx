import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  HardDrive,
  Cloud,
  Trash2,
  FolderOpen,
  FileText,
  Folder,
  RefreshCw,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/glass/Primitives";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/glass/Field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { companyApi } from "@/lib/adapters";
import {
  deleteHandle,
  ensurePermission,
  getHandle,
  isFsAccessSupported,
  listEntries,
  pickDirectory,
  saveHandle,
  type FolderEntry,
} from "@/lib/folder-handles";

export const Route = createFileRoute("/_authenticated/workspaces")({
  head: () => ({ meta: [{ title: "Workspaces — 0101" }] }),
  component: WorkspacesPage,
});

const LOCAL_KEY = "0101.workspaces.local.v1";

type LocalWorkspace = {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  description: string | null;
  folder_name: string | null;
  created_at: string;
};

function readLocal(): LocalWorkspace[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as LocalWorkspace[]) : [];
  } catch {
    return [];
  }
}
function writeLocal(items: LocalWorkspace[]) {
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

function WorkspacesPage() {
  const qc = useQueryClient();

  const companies = useQuery({
    queryKey: ["companies", "minimal"],
    queryFn: () => companyApi.list(),
  });

  const online = useQuery({
    queryKey: ["workspaces", "online"],
    queryFn: async () =>
      (await companyApi.list()).map((company) => ({
        id: company.id,
        name: company.name,
        description: company.mission ?? null,
        company_id: company.id,
        created_at: new Date().toISOString(),
      })),
  });

  const [local, setLocal] = React.useState<LocalWorkspace[]>(() => readLocal());
  const [openLocal, setOpenLocal] = React.useState<LocalWorkspace | null>(null);

  const companyName = (id: string) =>
    companies.data?.find((c) => c.id === id)?.name ?? "Unknown company";

  async function deleteLocal(id: string) {
    const next = local.filter((w) => w.id !== id);
    writeLocal(next);
    setLocal(next);
    await deleteHandle(id).catch(() => {});
    toast.success("Local workspace removed.");
  }

  async function deleteOnline(id: string) {
    toast.info("Online workspaces are managed from Companies.");
    void id;
    qc.invalidateQueries({ queryKey: ["workspaces", "online"] });
  }

  const empty = !online.isLoading && (online.data?.length ?? 0) === 0 && local.length === 0;

  const createDialog = (
    <NewWorkspaceDialog
      companies={companies.data ?? []}
      onLocalCreated={(w) => {
        const next = [w, ...local];
        writeLocal(next);
        setLocal(next);
      }}
    />
  );

  return (
    <div>
      <PageHeader
        kicker="Spaces"
        title="Workspaces"
        subtitle="A workspace is a folder agents can read and write. Local lives on your disk; online syncs to a company."
        actions={createDialog}
      />

      {empty ? (
        <EmptyState
          title="No workspaces yet"
          body="Create a local workspace pointing at a folder on your disk, or an online workspace synced to a company."
          action={createDialog}
        />
      ) : (
        <div className="space-y-8">
          <Section
            icon={<HardDrive className="size-4 text-rim" />}
            title="Local"
            hint="Folders on your disk. Files stay on your machine."
            count={local.length}
          >
            {local.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No local workspaces yet.</p>
            ) : (
              <Grid>
                {local.map((w) => (
                  <Card
                    key={w.id}
                    badge="LOCAL"
                    title={w.name}
                    subtitle={w.company_name}
                    description={w.description}
                    footer={
                      <button
                        onClick={() => setOpenLocal(w)}
                        className="text-rim hover:underline text-xs font-mono"
                      >
                        {w.folder_name ? `📁 ${w.folder_name}` : "Open"}
                      </button>
                    }
                    onDelete={() => deleteLocal(w.id)}
                  />
                ))}
              </Grid>
            )}
          </Section>

          <Section
            icon={<Cloud className="size-4 text-rim" />}
            title="Online"
            hint="Synced through 0101. Visible to company members."
            count={online.data?.length ?? 0}
          >
            {online.isLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading…</p>
            ) : (online.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No online workspaces yet.</p>
            ) : (
              <Grid>
                {online.data!.map((w) => (
                  <Card
                    key={w.id}
                    badge="ONLINE"
                    title={w.name}
                    subtitle={companyName(w.company_id)}
                    description={w.description}
                    footer={
                      <Link
                        to="/companies/$id"
                        params={{ id: w.company_id }}
                        className="text-rim hover:underline text-xs"
                      >
                        Open company →
                      </Link>
                    }
                    onDelete={() => deleteOnline(w.id)}
                  />
                ))}
              </Grid>
            )}
          </Section>
        </div>
      )}

      <LocalFolderDialog workspace={openLocal} onClose={() => setOpenLocal(null)} />
    </div>
  );
}

function Section({
  icon,
  title,
  hint,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-mono tracking-widest uppercase text-foreground">{title}</h2>
          <span className="text-xs font-mono text-muted-foreground">({count})</span>
        </div>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}

function Card({
  badge,
  title,
  subtitle,
  description,
  footer,
  onDelete,
}: {
  badge: string;
  title: string;
  subtitle: string;
  description: string | null;
  footer?: React.ReactNode;
  onDelete: () => void;
}) {
  return (
    <GlassPanel padding="lg" sheen className="group flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span
          className={cn(
            "font-mono text-[10px] tracking-widest px-2 py-0.5 rounded",
            badge === "LOCAL" ? "bg-white/[0.06] text-foreground/70" : "bg-rim/10 text-rim",
          )}
        >
          {badge}
        </span>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          aria-label="Delete"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <h3 className="text-lg font-semibold tracking-tight mb-1">{title}</h3>
      <div className="text-xs font-mono text-muted-foreground mb-2">{subtitle}</div>
      <p className="text-sm text-muted-foreground line-clamp-2 min-h-10">{description ?? "—"}</p>
      {footer && <div className="mt-4">{footer}</div>}
    </GlassPanel>
  );
}

function LocalFolderDialog({
  workspace,
  onClose,
}: {
  workspace: LocalWorkspace | null;
  onClose: () => void;
}) {
  const [entries, setEntries] = React.useState<FolderEntry[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const handle = await getHandle(id);
      if (!handle) {
        setError(
          "Folder handle missing. Browsers may clear handles after long idle periods — recreate the workspace.",
        );
        return;
      }
      const ok = await ensurePermission(handle, "readwrite");
      if (!ok) {
        setError("Permission denied for this folder.");
        return;
      }
      const list = await listEntries(handle);
      setEntries(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read folder");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (workspace) {
      setEntries(null);
      load(workspace.id);
    }
  }, [workspace, load]);

  return (
    <Dialog open={!!workspace} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-strong border-white/10 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-chrome flex items-center gap-2">
            <FolderOpen className="size-4 text-rim" />
            {workspace?.name}
            <span className="text-xs font-mono text-muted-foreground ml-2">
              {workspace?.folder_name}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-muted-foreground tracking-widest uppercase">
            FILES
          </span>
          <button
            onClick={() => workspace && load(workspace.id)}
            className="text-xs text-rim hover:underline flex items-center gap-1"
            disabled={loading}
          >
            <RefreshCw className={cn("size-3", loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        <div className="border border-white/5 rounded-lg max-h-96 overflow-auto">
          {error ? (
            <p className="text-sm text-destructive p-4">{error}</p>
          ) : loading && !entries ? (
            <p className="text-sm text-muted-foreground p-4">Reading folder…</p>
          ) : entries && entries.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">Folder is empty.</p>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {entries?.map((e) => (
                <li
                  key={e.name}
                  className="flex items-center justify-between px-3 py-2 text-sm font-mono hover:bg-white/[0.03]"
                >
                  <span className="flex items-center gap-2 truncate">
                    {e.kind === "directory" ? (
                      <Folder className="size-3.5 text-rim shrink-0" />
                    ) : (
                      <FileText className="size-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="truncate">{e.name}</span>
                  </span>
                  {e.size !== undefined && (
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {formatBytes(e.size)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground mt-3">
          Files never leave your machine. Agents can be granted read or write access per session.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function NewWorkspaceDialog({
  companies,
  onLocalCreated,
}: {
  companies: { id: string; name: string }[];
  onLocalCreated: (w: LocalWorkspace) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<"local" | "online">("local");
  const [companyId, setCompanyId] = React.useState<string>("");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [fsSupported, setFsSupported] = React.useState(true);

  React.useEffect(() => {
    setFsSupported(isFsAccessSupported());
  }, []);

  React.useEffect(() => {
    if (!companyId && companies[0]) setCompanyId(companies[0].id);
  }, [companies, companyId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");
    if (!companyId) return toast.error("Pick a company");

    setSaving(true);
    try {
      if (type === "local") {
        if (!fsSupported) {
          throw new Error(
            "Your browser doesn't support local folder access. Try Chrome, Edge, or Brave on desktop.",
          );
        }
        let handle: FileSystemDirectoryHandle;
        try {
          handle = await pickDirectory();
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") {
            setSaving(false);
            return; // user cancelled
          }
          throw e;
        }
        const id = crypto.randomUUID();
        await saveHandle(id, handle);
        const company = companies.find((c) => c.id === companyId);
        onLocalCreated({
          id,
          company_id: companyId,
          company_name: company?.name ?? "—",
          name: name.trim(),
          description: description.trim() || null,
          folder_name: handle.name,
          created_at: new Date().toISOString(),
        });
        toast.success(`Linked to folder “${handle.name}”.`);
      } else {
        await companyApi.create({
          name: name.trim(),
          mission: description.trim() || undefined,
        });
        toast.success("Online workspace created.");
        qc.invalidateQueries({ queryKey: ["workspaces", "online"] });
      }

      setName("");
      setDescription("");
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  const noCompanies = companies.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <GlassButton variant="rim">
          <Plus /> New workspace
        </GlassButton>
      </DialogTrigger>
      <DialogContent className="glass-strong border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-chrome">Create workspace</DialogTitle>
        </DialogHeader>

        {noCompanies ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              You need a company first. Workspaces always live inside one.
            </p>
            <Link
              to="/companies"
              onClick={() => setOpen(false)}
              className="text-rim hover:underline text-sm"
            >
              Go to Companies →
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Type">
              <div className="grid grid-cols-2 gap-2">
                <TypeOption
                  active={type === "local"}
                  onClick={() => setType("local")}
                  icon={<HardDrive className="size-4" />}
                  title="Local"
                  hint="Pick a folder on your disk"
                />
                <TypeOption
                  active={type === "online"}
                  onClick={() => setType("online")}
                  icon={<Cloud className="size-4" />}
                  title="Online"
                  hint="Synced & shared"
                />
              </div>
              {type === "local" && !fsSupported && (
                <p className="text-[11px] text-destructive mt-2">
                  This browser can't open local folders. Use Chrome, Edge, or Brave on desktop — or
                  switch to Online.
                </p>
              )}
            </Field>

            <Field label="Company">
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger className="glass border-white/10">
                  <SelectValue placeholder="Pick a company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Name">
              <GlassInput
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Q4 research"
              />
            </Field>

            <Field label="Description">
              <GlassInput
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this workspace for?"
              />
            </Field>

            <GlassButton
              type="submit"
              variant="rim"
              size="lg"
              className="w-full"
              disabled={saving || (type === "local" && !fsSupported)}
            >
              {saving
                ? "Creating…"
                : type === "local"
                  ? "Choose folder & create"
                  : "Create online workspace"}
            </GlassButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TypeOption({
  active,
  onClick,
  icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-3 text-left transition-colors",
        active
          ? "border-rim/60 bg-rim/10"
          : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]",
      )}
    >
      <div className="flex items-center gap-2 text-foreground">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="text-[11px] font-mono text-muted-foreground mt-1">{hint}</div>
    </button>
  );
}
