import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Workflow,
  Cog,
  ShieldCheck,
  FileCheck2,
  ScrollText,
  Layers,
  GitBranch,
  Boxes,
} from "lucide-react";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";

export const Route = createFileRoute("/platform")({
  head: () => ({
    meta: [
      { title: "Platform — 0101 control plane for agentic work" },
      {
        name: "description",
        content:
          "The 0101 platform: visual workflow studio, DAG execution, content-addressed artifacts, approvals, evaluations, and audit.",
      },
      { property: "og:title", content: "Platform — 0101" },
      {
        property: "og:description",
        content:
          "Visual workflow studio, DAG execution, content-addressed artifacts, approvals, evaluations, and audit.",
      },
    ],
  }),
  component: PlatformPage,
});

const CAPABILITIES = [
  {
    icon: Workflow,
    title: "Workflow Studio",
    body: "Drag-and-drop canvas with typed contracts on every edge. Edits version automatically.",
  },
  {
    icon: Cog,
    title: "DAG Runtime",
    body: "Deterministic execution. Parallel fan-out. Resumable from any failed node.",
  },
  {
    icon: GitBranch,
    title: "Content-addressed artifacts",
    body: "Every output hashed and versioned. Re-runs reuse what didn't change.",
  },
  {
    icon: ShieldCheck,
    title: "Approval gates",
    body: "Pre-allocated budgets, risk classification, human sign-off on sensitive actions.",
  },
  {
    icon: FileCheck2,
    title: "Evaluation engine",
    body: "Per-workflow acceptance criteria. Pass / warn / fail verdict on every run.",
  },
  {
    icon: ScrollText,
    title: "Audit bundle",
    body: "Workflow version, prompts, tool calls, approvals, costs — one signed export.",
  },
  {
    icon: Layers,
    title: "Multi-company tenancy",
    body: "Companies group teams, agents, workflows, budgets, and history under one mission.",
  },
  {
    icon: Boxes,
    title: "Open agent format",
    body: "Bring agents from MetaGPT, CrewAI, LangChain, AutoGen. Or define new ones in YAML.",
  },
];

function PlatformPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="flex-1 px-6 pt-36 pb-24">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="font-mono text-xs tracking-[0.3em] text-rim/80 uppercase mb-4">
                Platform
              </div>
              <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-chrome mb-6">
                One control plane for every agent you ship.
              </h1>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                0101 is the operating layer between your humans, your agents, and your tools. It
                treats every workflow as a versioned SOP and every run as auditable evidence.
              </p>
            </div>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CAPABILITIES.map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
              >
                <GlassPanel padding="lg" className="h-full">
                  <c.icon className="size-5 text-rim mb-4" />
                  <h3 className="text-base font-semibold tracking-tight mb-2">{c.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{c.body}</p>
                </GlassPanel>
              </motion.div>
            ))}
          </div>

          <div className="mt-24">
            <GlassPanel variant="strong" rim padding="lg" className="text-center py-14">
              <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-chrome mb-3">
                See it in your workspace.
              </h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                Spin up your first governed workflow in under five minutes.
              </p>
              <GlassButton asChild variant="primary" size="lg">
                <Link to="/auth/signup">
                  Start free <ArrowUpRight />
                </Link>
              </GlassButton>
            </GlassPanel>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
