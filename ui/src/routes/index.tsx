import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Boxes,
  Brain,
  Cog,
  FileCheck2,
  GitBranch,
  Layers,
  Lock,
  ShieldCheck,
  Workflow,
  ScrollText,
  Sparkles,
  Plus,
  Minus,
} from "lucide-react";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { Wordmark } from "@/components/brand/Wordmark";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "0101 — Govern the agents you ship" },
      {
        name: "description",
        content:
          "The control plane for AI agent workflows. Design SOPs, run them safely, audit every step, prove the cost.",
      },
      { property: "og:title", content: "0101 — Govern the agents you ship" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <TrustBar />
        <Pillars />
        <BigMetrics />
        <Architecture />
        <FlowDiagram />
        <Features />
        <UseCases />
        <Testimonials />
        <FAQ />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ---------- HERO ---------- */
function Hero() {
  return (
    <section className="relative px-6 pt-28 pb-32 md:pt-40 md:pb-44">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}
          className="flex flex-col items-center text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-white/10 mb-8">
            <span className="size-1.5 rounded-full bg-rim animate-pulse" />
            <span className="text-xs font-mono tracking-wider text-foreground/80">
              v1.0 — CONTROL PLANE FOR AGENTIC WORK
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-semibold tracking-tight leading-[0.95] mb-6 max-w-5xl">
            <span className="text-chrome">Govern the agents</span>
            <br />
            <span className="text-foreground/70">you actually ship.</span>
          </h1>

          <p className="max-w-2xl text-base md:text-lg text-muted-foreground mb-10 leading-relaxed">
            0101 runs AI agents like controlled business processes — every workflow an SOP, every
            action logged, every artifact versioned, every cost proven.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-14">
            <GlassButton asChild variant="primary" size="lg">
              <Link to="/auth/signup">
                Start free <ArrowUpRight />
              </Link>
            </GlassButton>
            <GlassButton asChild variant="glass" size="lg">
              <Link to="/auth/login">Sign in</Link>
            </GlassButton>
          </div>

          <HeroMockup />
        </motion.div>
      </div>
    </section>
  );
}

function HeroMockup() {
  const stats = [
    { label: "Runs today", value: "1,284", trend: "+12%" },
    { label: "Cost / run", value: "$0.41", trend: "-8%" },
    { label: "Eval pass-rate", value: "97.2%", trend: "+1.1%" },
    { label: "Open approvals", value: "3", trend: "live" },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
      className="w-full max-w-5xl"
    >
      <GlassPanel variant="strong" padding="none" rim className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-red-500/70" />
            <span className="size-2.5 rounded-full bg-yellow-500/70" />
            <span className="size-2.5 rounded-full bg-green-500/70" />
          </div>
          <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
            0101 · DASHBOARD
          </div>
          <Wordmark size={28} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/5">
          {stats.map((s) => (
            <div key={s.label} className="bg-black/40 p-5 text-left">
              <div className="text-[10px] font-mono tracking-widest text-muted-foreground/80 uppercase mb-2">
                {s.label}
              </div>
              <div className="text-2xl font-semibold tracking-tight text-chrome">{s.value}</div>
              <div className="text-[11px] text-rim/80 mt-1">{s.trend}</div>
            </div>
          ))}
        </div>
        <div className="p-6 grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 h-44 rounded-xl glass-inset relative overflow-hidden">
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 400 160"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.78 0.06 240 / 0.5)" />
                  <stop offset="100%" stopColor="oklch(0.78 0.06 240 / 0)" />
                </linearGradient>
              </defs>
              <path
                d="M0,120 C40,90 80,110 120,80 C160,50 200,70 240,55 C280,40 320,60 360,30 L400,20 L400,160 L0,160 Z"
                fill="url(#hero-area)"
              />
              <path
                d="M0,120 C40,90 80,110 120,80 C160,50 200,70 240,55 C280,40 320,60 360,30 L400,20"
                stroke="oklch(0.85 0.06 240)"
                strokeWidth="1.5"
                fill="none"
              />
            </svg>
          </div>
          <div className="rounded-xl glass-inset p-4 space-y-2">
            {[
              { name: "research-v3", state: "passed" },
              { name: "code-review", state: "approval" },
              { name: "compliance", state: "running" },
            ].map((r) => (
              <div key={r.name} className="flex items-center justify-between text-xs font-mono">
                <span className="text-foreground/80">{r.name}</span>
                <span
                  className={
                    r.state === "passed"
                      ? "text-emerald-300/80"
                      : r.state === "approval"
                        ? "text-amber-300/80"
                        : "text-rim"
                  }
                >
                  {r.state}
                </span>
              </div>
            ))}
          </div>
        </div>
      </GlassPanel>
    </motion.div>
  );
}

/* ---------- PILLARS ---------- */
function Pillars() {
  const items = [
    {
      icon: Workflow,
      title: "Design",
      body: "Build workflows from curated role packs. Each one is an SOP — nodes, edges, contracts, gates.",
    },
    {
      icon: Cog,
      title: "Run",
      body: "Deterministic DAG execution with content-addressed artifacts between every step.",
    },
    {
      icon: ShieldCheck,
      title: "Govern",
      body: "Budgets, token grants, approval gates, tool policies, workspace permissions.",
    },
    {
      icon: FileCheck2,
      title: "Evaluate",
      body: "Acceptance criteria per workflow. Every run produces a pass / needs-review / fail verdict.",
    },
    {
      icon: ScrollText,
      title: "Audit",
      body: "Workflow version, prompts, tool calls, approvals, costs, hashes — exported as one bundle.",
    },
    {
      icon: Layers,
      title: "Organize",
      body: "Companies group teams, agents, workflows, budgets, and history under one mission.",
    },
  ];
  return (
    <section id="pillars" className="px-6 py-24 md:py-32">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          kicker="Release pillars"
          title="Six surfaces, one control plane"
          subtitle="Not another chatbot. Not an autonomous-company simulation. A real operating system for agentic work."
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-14">
          {items.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: i * 0.05 }}
            >
              <GlassPanel padding="lg" sheen className="h-full group">
                <div className="size-11 rounded-xl glass-inset flex items-center justify-center mb-5 group-hover:border-rim/40 transition-colors">
                  <item.icon className="size-5 text-rim" />
                </div>
                <h3 className="text-xl font-semibold tracking-tight mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
              </GlassPanel>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- ARCHITECTURE ---------- */
function Architecture() {
  const layers = [
    {
      id: "01",
      title: "Directive",
      body: "SOP YAML defines finite state machines — roles, transitions, contracts, artifacts.",
    },
    {
      id: "02",
      title: "Orchestration",
      body: "DAG engine, ManagedAgent, intelligent routing, budget enforcement, handover protocols.",
    },
    {
      id: "03",
      title: "Execution",
      body: "Sandboxed tools. Every action intercepted by the audit logger. Nothing untraced.",
    },
  ];
  return (
    <section id="architecture" className="px-6 py-24 md:py-32">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          kicker="Architecture"
          title="Three layers. Zero black boxes."
          subtitle="Code = SOP. Workflow as a standard operating procedure, executed by accountable agents."
        />
        <div className="mt-14 grid md:grid-cols-3 gap-4">
          {layers.map((l, i) => (
            <motion.div
              key={l.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <GlassPanel padding="lg" rim className="h-full">
                <div className="font-mono text-xs tracking-[0.3em] text-rim/80 mb-4">
                  LAYER · {l.id}
                </div>
                <h3 className="text-2xl font-semibold tracking-tight mb-3 text-chrome">
                  {l.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{l.body}</p>
              </GlassPanel>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- FEATURES ---------- */
function Features() {
  const features = [
    {
      icon: Boxes,
      title: "Visual Workflow Studio",
      body: "React Flow canvas, 186+ specialist agents, real-time node inspector and auto-layout.",
    },
    {
      icon: Brain,
      title: "Universal Agent Format",
      body: "Import from MetaGPT, CrewAI, LangChain, AutoGen. No framework lock-in.",
    },
    {
      icon: Lock,
      title: "Privacy-First Execution",
      body: "Local LLMs, local vector DB, zero telemetry. Your data never leaves the box.",
    },
    {
      icon: GitBranch,
      title: "Content-Addressed Storage",
      body: "Every artifact versioned with SHA-256 — immutable, traceable, reproducible.",
    },
    {
      icon: ShieldCheck,
      title: "Approval Gates",
      body: "Pre-allocate budgets. Lock funds at the start of high-complexity tasks. Require human sign-off on risk.",
    },
    {
      icon: Sparkles,
      title: "Evaluation Engine",
      body: "Per-workflow acceptance criteria. Verdicts on every run. No more vibes-based shipping.",
    },
  ];
  return (
    <section id="features" className="px-6 py-24 md:py-32">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          kicker="Features"
          title="Everything you need to ship agents safely"
          subtitle="The pieces a serious team needs to put agentic work into production — and keep it there."
        />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-14">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
            >
              <GlassPanel padding="md" className="h-full hover:border-white/20 transition-colors">
                <f.icon className="size-5 text-rim mb-4" />
                <h3 className="text-base font-semibold tracking-tight mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
              </GlassPanel>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- USE CASES ---------- */
function UseCases() {
  const cases = [
    {
      title: "Governed research reports",
      flow: "Researcher → Source Verifier → Analyst → Writer → Reviewer",
      pain: "Research is hard to verify and expensive to redo.",
    },
    {
      title: "Secure code review",
      flow: "Repo Scanner → Security Reviewer → Test Planner → Patch Advisor → Human Approval",
      pain: "AI tools create untracked recommendations and inconsistent review quality.",
    },
    {
      title: "Compliance-safe content",
      flow: "Creator → Claims Checker → Compliance Reviewer → Publisher Gate",
      pain: "Marketing and legal claims need citations and approval history.",
    },
    {
      title: "Internal policy audit",
      flow: "Document Reader → Control Mapper → Risk Scorer → Audit Report Writer",
      pain: "Teams need evidence-backed findings, not generic summaries.",
    },
  ];
  return (
    <section id="use-cases" className="px-6 py-24 md:py-32">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          kicker="Use cases"
          title="Governance-sensitive workflows, first"
          subtitle="Where correctness, evidence, and repeatability matter more than novelty."
        />
        <div className="grid md:grid-cols-2 gap-4 mt-14">
          {cases.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <GlassPanel padding="lg" className="h-full">
                <h3 className="text-xl font-semibold tracking-tight mb-3">{c.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{c.pain}</p>
                <div className="font-mono text-[11px] tracking-wider text-rim/90 leading-relaxed">
                  {c.flow}
                </div>
              </GlassPanel>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- CTA ---------- */
function CtaBand() {
  return (
    <section className="px-6 py-24 md:py-36">
      <div className="max-w-4xl mx-auto">
        <GlassPanel variant="strong" rim padding="lg" className="text-center py-16">
          <Wordmark size={96} className="mx-auto mb-8" />
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-chrome mb-4">
            Put your agents in the loop.
          </h2>
          <p className="max-w-xl mx-auto text-muted-foreground mb-8">
            Spin up your first governed workflow in under five minutes.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <GlassButton asChild variant="primary" size="lg">
              <Link to="/auth/signup">
                Create your workspace <ArrowUpRight />
              </Link>
            </GlassButton>
            <GlassButton asChild variant="ghost" size="lg">
              <Link to="/auth/login">I already have an account</Link>
            </GlassButton>
          </div>
        </GlassPanel>
      </div>
    </section>
  );
}

function SectionHeader({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <div className="font-mono text-xs tracking-[0.3em] text-rim/80 mb-4 uppercase">{kicker}</div>
      <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-chrome mb-4">
        {title}
      </h2>
      <p className="text-base text-muted-foreground">{subtitle}</p>
    </div>
  );
}

/* ---------- TRUST BAR ---------- */
function TrustBar() {
  const logos = [
    "ATLAS CAPITAL",
    "NIMBUS LABS",
    "ORCA HEALTH",
    "KITE LOGISTICS",
    "MERIDIAN",
    "HALCYON",
    "NORTHWIND",
  ];
  return (
    <section className="px-6 pb-10 -mt-12">
      <div className="max-w-6xl mx-auto">
        <div className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground/70 text-center mb-6 uppercase">
          Trusted by operations teams shipping agents into production
        </div>
        <div className="relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
          <div className="flex gap-12 md:gap-16 animate-[marquee_40s_linear_infinite] whitespace-nowrap">
            {[...logos, ...logos, ...logos].map((l, i) => (
              <span
                key={i}
                className="font-mono text-sm tracking-[0.25em] text-foreground/40 hover:text-chrome transition-colors"
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-33.333%); } }`}</style>
    </section>
  );
}

/* ---------- BIG METRICS ---------- */
function BigMetrics() {
  const metrics = [
    { value: "186+", label: "Specialist agents", hint: "Curated, evaluated, ready to compose." },
    {
      value: "99.97%",
      label: "Audit completeness",
      hint: "Every prompt, tool call, artifact hashed.",
    },
    {
      value: "<400ms",
      label: "Median step latency",
      hint: "Local models or hosted — your choice.",
    },
    { value: "$0.41", label: "Median cost per run", hint: "Budgets enforced at the planner." },
  ];
  return (
    <section className="px-6 py-24 md:py-28 border-y border-white/[0.05] bg-gradient-to-b from-transparent via-white/[0.015] to-transparent">
      <div className="max-w-6xl mx-auto">
        <div className="font-mono text-[10px] tracking-[0.3em] text-rim/80 text-center mb-3 uppercase">
          By the numbers
        </div>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-chrome text-center mb-16 max-w-2xl mx-auto">
          Production-grade telemetry, not demo-day theatre.
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-12">
          {metrics.map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="text-center"
            >
              <div className="text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-chrome mb-3 tabular-nums">
                {m.value}
              </div>
              <div className="font-mono text-[10px] tracking-widest text-rim/80 uppercase mb-2">
                {m.label}
              </div>
              <div className="text-xs text-muted-foreground max-w-[14rem] mx-auto leading-relaxed">
                {m.hint}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- FLOW DIAGRAM ---------- */
function FlowDiagram() {
  const nodes = [
    { label: "Trigger", role: "system", x: 40, y: 110 },
    { label: "Planner", role: "planner", x: 200, y: 110 },
    { label: "browser.fetch", role: "tool", x: 380, y: 50 },
    { label: "Analyst", role: "agent", x: 380, y: 170 },
    { label: "Citation gate", role: "eval", x: 560, y: 110 },
    { label: "Approval", role: "approver", x: 720, y: 110 },
    { label: "Artifact", role: "system", x: 880, y: 110 },
  ];
  const edges: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [1, 3],
    [2, 4],
    [3, 4],
    [4, 5],
    [5, 6],
  ];
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          kicker="A run, end to end"
          title="One DAG. Every node accountable."
          subtitle="Hover any step — that's the same level of detail you get in every audit bundle."
        />
        <GlassPanel padding="lg" rim className="mt-14 relative overflow-x-auto">
          <svg viewBox="0 0 980 240" className="w-full min-w-[860px] h-auto">
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path
                  d="M 24 0 L 0 0 0 24"
                  fill="none"
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth="1"
                />
              </pattern>
              <linearGradient id="edge" x1="0" x2="1">
                <stop offset="0%" stopColor="oklch(0.78 0.06 240 / 0.1)" />
                <stop offset="50%" stopColor="oklch(0.85 0.08 240 / 0.7)" />
                <stop offset="100%" stopColor="oklch(0.78 0.06 240 / 0.1)" />
              </linearGradient>
            </defs>
            <rect width="980" height="240" fill="url(#grid)" />
            {edges.map(([a, b], i) => {
              const from = nodes[a],
                to = nodes[b];
              const x1 = from.x + 60,
                y1 = from.y;
              const x2 = to.x,
                y2 = to.y;
              const mx = (x1 + x2) / 2;
              return (
                <path
                  key={i}
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  stroke="url(#edge)"
                  strokeWidth="1.5"
                  fill="none"
                />
              );
            })}
            {nodes.map((n, i) => (
              <g key={i} transform={`translate(${n.x},${n.y - 22})`}>
                <rect
                  width="120"
                  height="44"
                  rx="10"
                  fill="rgba(15,17,21,0.7)"
                  stroke="rgba(180,200,230,0.25)"
                  strokeWidth="1"
                />
                <text
                  x="60"
                  y="20"
                  textAnchor="middle"
                  fill="oklch(0.85 0.06 240)"
                  fontSize="9"
                  fontFamily="ui-monospace, monospace"
                  letterSpacing="2"
                >
                  {n.role.toUpperCase()}
                </text>
                <text
                  x="60"
                  y="34"
                  textAnchor="middle"
                  fill="white"
                  fontSize="11"
                  fontFamily="ui-sans-serif, system-ui"
                  fontWeight="500"
                >
                  {n.label}
                </text>
              </g>
            ))}
          </svg>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/5">
            {[
              { k: "Duration", v: "32.1s" },
              { k: "Cost", v: "$0.84" },
              { k: "Tokens", v: "24.5k" },
              { k: "Eval", v: "98% pass" },
            ].map((s) => (
              <div key={s.k} className="text-center">
                <div className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                  {s.k}
                </div>
                <div className="text-base font-semibold text-chrome tabular-nums mt-1">{s.v}</div>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>
    </section>
  );
}

/* ---------- TESTIMONIALS ---------- */
function Testimonials() {
  const quotes = [
    {
      body: "We replaced a 9-person diligence pod with three 0101 workflows. The auditor signed off on the trace bundle in 40 minutes.",
      author: "Miles Carrera",
      role: "Partner, Atlas Capital",
    },
    {
      body: "Every claim our marketing agent makes ships with citations and a human approval timestamp. Legal stopped vetoing AI copy.",
      author: "Reina Okafor",
      role: "Head of Brand, Nimbus Labs",
    },
    {
      body: "The cost-per-run chart pays for the platform on the first quarter. We finally know what an agent actually costs.",
      author: "Dr. Aman Sethi",
      role: "VP Operations, Orca Health",
    },
  ];
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          kicker="Operators"
          title="Built for the people who get paged at 3am."
          subtitle="Not researchers. Not influencers. Operators running governed work in regulated environments."
        />
        <div className="grid md:grid-cols-3 gap-4 mt-14">
          {quotes.map((q, i) => (
            <motion.div
              key={q.author}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
            >
              <GlassPanel padding="lg" className="h-full flex flex-col">
                <div className="text-rim/60 font-serif text-5xl leading-none mb-2 select-none">
                  “
                </div>
                <p className="text-sm text-foreground/85 leading-relaxed flex-1 mb-6">{q.body}</p>
                <div className="pt-4 border-t border-white/5">
                  <div className="text-sm font-semibold text-chrome">{q.author}</div>
                  <div className="text-xs font-mono text-muted-foreground tracking-wider mt-0.5">
                    {q.role}
                  </div>
                </div>
              </GlassPanel>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */
function FAQ() {
  const items = [
    {
      q: "How is this different from a multi-agent framework like CrewAI or LangGraph?",
      a: "Frameworks give you primitives. 0101 gives you the control plane around them — budgets, approvals, evaluation, audit, cost attribution. You can import workflows from CrewAI, LangGraph, AutoGen, and MetaGPT and run them under 0101's governance.",
    },
    {
      q: "Where does the model inference happen?",
      a: "Your choice. Bring your own keys (OpenAI, Anthropic, Google) at the account or workspace level, or wire in a private endpoint. Local-only deployments run inference on your machine; nothing leaves the box.",
    },
    {
      q: "What does the audit bundle actually contain?",
      a: "Workflow version, every prompt sent, every tool call made, every artifact written (with SHA-256), every approval granted, every evaluation verdict, total cost and tokens — exported as a single signed tarball.",
    },
    {
      q: "Can we self-host?",
      a: "Yes. The execution engine runs as a single container; storage is Postgres + object store of your choice. Enterprise customers get a Helm chart and an air-gapped install option.",
    },
    {
      q: "How do approvals work?",
      a: "Any node can be marked as requiring approval. The run pauses, a reviewer gets a link with the full context, and the run resumes on approve — or terminates with a recorded reason on reject. All decisions are part of the audit bundle.",
    },
  ];
  const [open, setOpen] = React.useState<number | null>(0);
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="max-w-3xl mx-auto">
        <SectionHeader
          kicker="FAQ"
          title="Questions we get on every demo."
          subtitle="If yours isn't here, the team replies in under an hour during business days."
        />
        <div className="mt-14 space-y-3">
          {items.map((it, i) => {
            const isOpen = open === i;
            return (
              <GlassPanel key={it.q} padding="none" className="overflow-hidden">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-start gap-4 text-left px-6 py-5 hover:bg-white/[0.02] transition-colors"
                  aria-expanded={isOpen}
                >
                  <span className="flex-1 text-sm md:text-base font-medium text-chrome">
                    {it.q}
                  </span>
                  <span className="size-7 rounded-full glass-inset flex items-center justify-center shrink-0 mt-0.5">
                    {isOpen ? (
                      <Minus className="size-3.5 text-rim" />
                    ) : (
                      <Plus className="size-3.5 text-rim" />
                    )}
                  </span>
                </button>
                <motion.div
                  initial={false}
                  animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                  transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed">{it.a}</p>
                </motion.div>
              </GlassPanel>
            );
          })}
        </div>
      </div>
    </section>
  );
}
