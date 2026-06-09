import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";

export const Route = createFileRoute("/solutions")({
  head: () => ({
    meta: [
      { title: "Solutions — 0101 for diligence, compliance, research, support" },
      {
        name: "description",
        content:
          "Governance-sensitive workflows where correctness, evidence, and repeatability matter more than novelty.",
      },
      { property: "og:title", content: "Solutions — 0101" },
      {
        property: "og:description",
        content:
          "Diligence, compliance, research, and support workflows that ship with audit and approval gates.",
      },
    ],
  }),
  component: SolutionsPage,
});

const SOLUTIONS = [
  {
    title: "Investment diligence",
    role: "Private equity, venture, family offices",
    pain: "Memos are slow, reviews are inconsistent, sources rarely land in the audit trail.",
    flow: "Researcher → Source Verifier → Analyst → Writer → Reviewer",
    outcome: "Cited memos in hours, not days, with every claim mapped back to a source URL.",
  },
  {
    title: "Continuous compliance",
    role: "SaaS, fintech, healthtech",
    pain: "SOC2 / ISO evidence sweeps run quarterly, never continuously, always behind.",
    flow: "Sweeper → Control Mapper → Evidence Collector → Compliance Reviewer → Archivist",
    outcome:
      "Always-on evidence trail, signed bundles per quarter, drift caught the day it happens.",
  },
  {
    title: "Code review at scale",
    role: "Platform engineering teams",
    pain: "AI suggestions are untracked, inconsistent, and never block a merge when they should.",
    flow: "Repo Scanner → Security Reviewer → Test Planner → Patch Advisor → Human Approval",
    outcome: "Every PR gets the same review, the same evidence, the same approval boundary.",
  },
  {
    title: "Clinical & regulated content",
    role: "Pharma, medtech, clinical research",
    pain: "Drafts need citations, claims need traceability, and reviewers need a trail.",
    flow: "Intake → Drafter → Claims Checker → Compliance Reviewer → Publisher Gate",
    outcome:
      "Publish-ready drafts with citation coverage, claim verification, and reviewer sign-off.",
  },
  {
    title: "Support deflection",
    role: "Customer operations",
    pain: "Generative replies go out without grounding, escalations get lost.",
    flow: "Triage → KB Search → Drafter → QA → Escalator",
    outcome: "Grounded replies, automatic escalation on uncertainty, full conversation audit.",
  },
  {
    title: "Logistics exception triage",
    role: "Operations, supply chain",
    pain: "Carrier exceptions over budget threshold need approval no one is tracking.",
    flow: "Detector → Cost Modeler → Reroute Planner → Approval → Carrier Nudge",
    outcome: "Auto-rebook below threshold, human approval above it, every decision logged.",
  },
];

function SolutionsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="flex-1 px-6 pt-36 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="font-mono text-xs tracking-[0.3em] text-rim/80 uppercase mb-4">
              Solutions
            </div>
            <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-chrome mb-6">
              Where 0101 earns its keep.
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
              Six production workflows already running on 0101. Each one ships with a default SOP,
              eval suite, and audit bundle.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {SOLUTIONS.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <GlassPanel padding="lg" className="h-full">
                  <div className="font-mono text-[10px] tracking-widest text-rim/80 uppercase mb-2">
                    {s.role}
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight mb-3">{s.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{s.pain}</p>
                  <div className="rounded-xl glass-inset p-3 mb-4 font-mono text-[11px] tracking-wider text-rim/90">
                    {s.flow}
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">{s.outcome}</p>
                </GlassPanel>
              </motion.div>
            ))}
          </div>

          <div className="mt-24 text-center">
            <GlassButton asChild variant="primary" size="lg">
              <Link to="/auth/signup">
                Try a workflow <ArrowUpRight />
              </Link>
            </GlassButton>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
