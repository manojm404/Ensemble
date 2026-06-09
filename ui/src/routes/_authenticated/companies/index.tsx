import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { companyApi } from "@/lib/adapters";

export const Route = createFileRoute("/_authenticated/companies/")({
  head: () => ({ meta: [{ title: "Companies — 0101" }] }),
  component: CompaniesPage,
});

function CompaniesPage() {
  const q = useQuery({
    queryKey: ["companies"],
    queryFn: () => companyApi.list(),
  });

  return (
    <div>
      <PageHeader
        kicker="Organize"
        title="Companies"
        subtitle="Operational workspaces grouping workflows, runs, and audit history."
        actions={<NewCompanyDialog />}
      />
      {q.data && q.data.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {q.data.map((c) => (
            <GlassPanel key={c.id} padding="lg" sheen className="group">
              <div className="font-mono text-[10px] tracking-widest text-rim/80 mb-2">
                COMPANY · {c.industry ?? "GENERAL"}
              </div>
              <h3 className="text-lg font-semibold tracking-tight mb-1">{c.name}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2 min-h-10">
                {c.mission ?? "—"}
              </p>
              <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                <span className="font-mono">/{c.slug}</span>
                <Link
                  to="/companies/$id"
                  params={{ id: c.id }}
                  className="text-rim hover:underline"
                >
                  Open →
                </Link>
              </div>
            </GlassPanel>
          ))}
        </div>
      ) : q.isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : (
        <EmptyState
          title="No companies yet"
          body="A company is a workspace that holds workflows, runs, and audit history."
          action={<NewCompanyDialog />}
        />
      )}
    </div>
  );
}

function NewCompanyDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [industry, setIndustry] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      await companyApi.create({
        name: name.trim(),
        industry: industry.trim() || undefined,
        mission: description.trim() || undefined,
      });

      toast.success("Company created.");
      setName("");
      setIndustry("");
      setDescription("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["companies"] });
    } catch (err) {
      console.error("Create company failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create company");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <GlassButton variant="rim">
          <Plus /> New company
        </GlassButton>
      </DialogTrigger>
      <DialogContent className="glass-strong border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-chrome">Create company</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name">
            <GlassInput
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Atlas Capital"
            />
          </Field>
          <Field label="Industry">
            <GlassInput
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="Finance"
            />
          </Field>
          <Field label="Mission">
            <GlassInput
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this workspace do?"
            />
          </Field>
          <GlassButton type="submit" variant="rim" size="lg" className="w-full" disabled={saving}>
            {saving ? "Creating…" : "Create company"}
          </GlassButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
