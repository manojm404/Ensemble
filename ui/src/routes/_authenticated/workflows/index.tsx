import * as React from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  FileText,
  Layers3,
  Play,
  Route as RouteIcon,
  Sparkles,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/glass/Primitives";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput, GlassTextarea } from "@/components/glass/GlassInput";
import { StateView, StatusChip } from "@/components/glass/StateView";
import { companyApi, workflowApi } from "@/lib/adapters";
import type { GeneratedWorkflow, Workflow, WorkflowStagePlan } from "@/lib/adapters/types";

type OutputType = GeneratedWorkflow["output_type"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

export const Route = createFileRoute("/_authenticated/workflows/")({
  head: () => ({ meta: [{ title: "Workflows - 0101" }] }),
  component: WorkflowsPage,
});

function WorkflowsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [prompt, setPrompt] = React.useState("Build a local business website");
  const [companyId, setCompanyId] = React.useState("");
  const [agentCount, setAgentCount] = React.useState(4);
  const [outputType, setOutputType] = React.useState<OutputType>("auto");
  const [generated, setGenerated] = React.useState<GeneratedWorkflow | null>(null);
  const [saved, setSaved] = React.useState<Workflow | null>(null);

  const workflows = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowApi.list(),
  });
  const companies = useQuery({
    queryKey: ["companies-mini"],
    queryFn: () => companyApi.list(),
  });

  React.useEffect(() => {
    if (companies.data?.[0] && !companyId) setCompanyId(companies.data[0].id);
  }, [companies.data, companyId]);

  const generate = useMutation({
    mutationFn: () => workflowApi.generateWorkflow(prompt.trim(), agentCount, outputType),
    onSuccess: (data) => {
      setGenerated(data);
      setSaved(null);
      toast.success("Agents selected. Review the route before saving.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not generate flow"),
  });

  const save = useMutation({
    mutationFn: async (input: { runAfterSave?: boolean }) => {
      if (!generated) throw new Error("Generate a workflow first.");
      const workflow = await workflowApi.create({
        name: generated.name,
        description: generated.description ?? prompt,
        companyId: companyId || undefined,
        nodes: generated.nodes,
        edges: generated.edges,
        metadata: generated.metadata,
        prompt,
        outputType,
      });
      return { workflow, runAfterSave: input.runAfterSave };
    },
    onSuccess: async ({ workflow, runAfterSave }) => {
      setSaved(workflow);
      qc.invalidateQueries({ queryKey: ["workflows"] });
      toast.success("Workflow saved.");
      if (runAfterSave) {
        try {
          const run = await workflowApi.run(workflow.id);
          router.navigate({ to: "/runs/$runId", params: { runId: run.run_id } });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not start the run");
        }
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save workflow"),
  });

  async function runSavedWorkflow() {
    if (!saved) {
      save.mutate({ runAfterSave: true });
      return;
    }

    try {
      const run = await workflowApi.run(saved.id);
      qc.invalidateQueries({ queryKey: ["workflows"] });
      router.navigate({ to: "/runs/$runId", params: { runId: run.run_id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the run");
    }
  }

  async function generateFlow(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return toast.error("Describe what you want 0101 to build or review.");
    generate.mutate();
  }

  return (
    <div>
      <PageHeader
        kicker="Design"
        title="Workflows"
        subtitle="Describe the outcome. 0101 selects the agents, explains the route, then packages the run output."
      />

      <div className="grid xl:grid-cols-[1.05fr_0.95fr] gap-4 mb-8">
        <GlassPanel padding="lg" className="min-h-[520px]">
          <form onSubmit={generateFlow} className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="size-4 text-rim" /> Describe
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Start with a plain-English request. Keep it specific enough for routing.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-rim/80">
                MagicFlow
              </div>
            </div>

            <Field label="Prompt">
              <GlassTextarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={7}
                placeholder="Example: Build a local business website with homepage copy, service sections, SEO, and a polished preview."
              />
            </Field>

            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Company">
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="h-10 w-full rounded-xl bg-black/30 border border-white/10 px-3 text-sm text-foreground focus:outline-none focus:border-rim/60"
                >
                  <option value="" className="bg-background text-foreground">
                    No company context
                  </option>
                  {companies.data?.map((company) => (
                    <option
                      key={company.id}
                      value={company.id}
                      className="bg-background text-foreground"
                    >
                      {company.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Agents">
                <GlassInput
                  type="number"
                  min={1}
                  max={5}
                  value={agentCount}
                  onChange={(e) => setAgentCount(Number(e.target.value))}
                />
              </Field>
              <Field label="Output">
                <select
                  value={outputType}
                  onChange={(e) => setOutputType(e.target.value as OutputType)}
                  className="h-10 w-full rounded-xl bg-black/30 border border-white/10 px-3 text-sm text-foreground focus:outline-none focus:border-rim/60"
                >
                  {["auto", "web", "document", "research"].map((type) => (
                    <option key={type} value={type} className="bg-background text-foreground">
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <GlassButton type="submit" variant="rim" size="lg" disabled={generate.isPending}>
                <RouteIcon /> {generate.isPending ? "Selecting agents..." : "Review agents"}
              </GlassButton>
              {generated && (
                <GlassButton
                  type="button"
                  variant="glass"
                  size="lg"
                  onClick={() => save.mutate({ runAfterSave: false })}
                  disabled={save.isPending}
                >
                  <CheckCircle2 />{" "}
                  {saved ? "Saved" : save.isPending ? "Saving..." : "Save workflow"}
                </GlassButton>
              )}
              {generated && (
                <GlassButton
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={runSavedWorkflow}
                  disabled={save.isPending}
                >
                  <Play /> Run now
                </GlassButton>
              )}
              {saved && (
                <GlassButton asChild type="button" variant="ghost" size="lg">
                  <Link to="/workflows/$id" params={{ id: saved.id }}>
                    Open workflow <ArrowRight />
                  </Link>
                </GlassButton>
              )}
            </div>
          </form>
        </GlassPanel>

        <AgentReview generated={generated} loading={generate.isPending} />
      </div>

      <StateView loading={workflows.isLoading} error={workflows.error}>
        {workflows.data && workflows.data.length > 0 ? (
          <GlassPanel padding="none" className="overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="text-sm font-medium flex items-center gap-2">
                <Layers3 className="size-4 text-rim" /> Saved workflows
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                Advanced editor lives inside each workflow.
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase border-b border-white/5">
                  <th className="text-left px-5 py-3">Name</th>
                  <th className="text-left px-5 py-3">Company</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {workflows.data.map((wf) => (
                  <tr key={wf.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                    <td className="px-5 py-3 font-medium">{wf.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{wf.company_name ?? "-"}</td>
                    <td className="px-5 py-3">
                      <StatusChip status={wf.status} />
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {new Date(wf.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to="/workflows/$id"
                        params={{ id: wf.id }}
                        className="text-rim hover:underline text-xs"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassPanel>
        ) : (
          <EmptyState
            title="No workflows saved yet"
            body="Generate a route from the prompt composer, review the selected agents, then save it."
          />
        )}
      </StateView>
    </div>
  );
}

function AgentReview({
  generated,
  loading,
}: {
  generated: GeneratedWorkflow | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <GlassPanel padding="lg" className="min-h-[520px] grid place-items-center">
        <div className="text-center">
          <div className="mx-auto mb-4 size-12 rounded-full border border-rim/40 grid place-items-center animate-pulse-rim">
            <Boxes className="size-5 text-rim" />
          </div>
          <div className="text-sm font-medium">Routing against real backend agents</div>
          <p className="text-sm text-muted-foreground mt-1">Matching roles, contracts, and gaps.</p>
        </div>
      </GlassPanel>
    );
  }

  if (!generated) {
    return (
      <GlassPanel padding="lg" className="min-h-[520px] flex flex-col justify-between">
        <div>
          <div className="text-sm font-medium flex items-center gap-2">
            <FileText className="size-4 text-rim" /> Review
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            The selected agents, reasons, contracts, and capability gaps will appear here before
            anything is saved.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {["Design", "Frontend", "Research", "Evaluation"].map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
                Ready
              </div>
              <div className="text-sm font-medium mt-2">{item}</div>
            </div>
          ))}
        </div>
      </GlassPanel>
    );
  }

  const stages = stagesFromGenerated(generated);
  return (
    <GlassPanel padding="lg" className="min-h-[520px]">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <div className="text-sm font-medium">{generated.name}</div>
          <p className="text-sm text-muted-foreground mt-1">
            {generated.metadata.routing_reason ??
              generated.description ??
              "Review the selected route."}
          </p>
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-rim/80 rounded-full border border-white/10 px-3 py-1">
          {generated.metadata.domain_title ?? generated.output_type}
        </div>
      </div>

      <div className="space-y-3">
        {stages.map((stage, index) => (
          <AgentCard key={`${stage.stage}-${index}`} stage={stage} index={index} />
        ))}
      </div>
    </GlassPanel>
  );
}

function stagesFromGenerated(generated: GeneratedWorkflow): WorkflowStagePlan[] {
  if (generated.metadata.stage_plan?.length) return generated.metadata.stage_plan;
  return generated.nodes.map((node, index) => ({
    stage: `stage_${index + 1}`,
    agent_id: String(node.config?.agent_id ?? node.id),
    agent_name: node.label,
    requested_role: node.role ?? String(node.config?.requested_role ?? "agent"),
    selection_reason: String(node.config?.selection_reason ?? "Selected by backend routing."),
    output_contract: String(
      node.config?.output_contract ?? "Produce a usable section of the final package.",
    ),
  }));
}

function AgentCard({ stage, index }: { stage: WorkflowStagePlan; index: number }) {
  const confidence =
    stage.match_confidence != null ? Math.round(stage.match_confidence * 100) : null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
            Agent {index + 1} · {stage.stage}
          </div>
          <div className="text-base font-semibold text-chrome mt-1 truncate">
            {stage.agent_name ?? stage.agent_id ?? stage.requested_role ?? "Selected agent"}
          </div>
          <div className="text-xs text-rim/85 mt-1">
            {stage.requested_role ?? stage.role ?? "workflow role"}
          </div>
        </div>
        {confidence != null && (
          <div className="rounded-full border border-white/10 px-3 py-1 text-xs font-mono text-foreground/80">
            {confidence}%
          </div>
        )}
      </div>
      <p className="text-sm text-foreground/80 mt-3 leading-relaxed">
        {stage.selection_reason ?? "This agent best matches the requested role and output."}
      </p>
      <div className="mt-3 rounded-xl glass-inset p-3">
        <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-1">
          Output contract
        </div>
        <div className="text-sm text-foreground/85">
          {stage.output_contract ?? "Deliver a clear, reviewable artifact for the next stage."}
        </div>
      </div>
      {!!stage.capability_gaps?.length && (
        <div className="mt-3 text-xs text-amber-200/90">
          Gaps: {stage.capability_gaps.join(", ")}
        </div>
      )}
    </div>
  );
}
