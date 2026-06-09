/**
 * Demo fixtures used when VITE_API_BASE_URL is not configured.
 * Lets every page render production-quality content offline.
 */

export const DEMO_USER = {
  id: "u_demo",
  email: "operator@0101.dev",
  full_name: "Sasha Mendel",
  display_name: "Sasha",
  tier: "enterprise",
  role: "owner",
};

const now = Date.now();
const ago = (mins: number) => new Date(now - mins * 60_000).toISOString();
const rel = (mins: number) => {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 60 / 24)}d ago`;
};

const COMPANIES = [
  {
    id: "c_atlas",
    name: "Atlas Capital",
    mission: "Autonomous diligence pods for mid-market private equity.",
    agents: 42,
    teams: 6,
    runs_30d: 1284,
    spend_30d: 3120.55,
  },
  {
    id: "c_nimbus",
    name: "Nimbus Labs",
    mission: "Continuous compliance for SaaS — SOC2 + ISO 27001 always-on.",
    agents: 18,
    teams: 3,
    runs_30d: 612,
    spend_30d: 980.12,
  },
  {
    id: "c_orca",
    name: "Orca Health",
    mission: "Clinical-trial intake, IRB drafting, and protocol QA.",
    agents: 27,
    teams: 4,
    runs_30d: 503,
    spend_30d: 2210.4,
  },
  {
    id: "c_kite",
    name: "Kite Logistics",
    mission: "Freight ops agents — exception triage and carrier nudges.",
    agents: 12,
    teams: 2,
    runs_30d: 244,
    spend_30d: 410.0,
  },
];

const WORKFLOWS = [
  {
    id: "wf_001",
    name: "Diligence — SaaS target",
    status: "active",
    updated_at: rel(12),
    runs: 184,
    pass_rate: 96,
  },
  {
    id: "wf_002",
    name: "SOC2 evidence sweep",
    status: "active",
    updated_at: rel(54),
    runs: 76,
    pass_rate: 99,
  },
  {
    id: "wf_003",
    name: "IRB protocol draft",
    status: "draft",
    updated_at: rel(60 * 3),
    runs: 12,
    pass_rate: 88,
  },
  {
    id: "wf_004",
    name: "Carrier exception triage",
    status: "active",
    updated_at: rel(60 * 6),
    runs: 311,
    pass_rate: 92,
  },
  {
    id: "wf_005",
    name: "Pricing-page A/B critique",
    status: "paused",
    updated_at: rel(60 * 26),
    runs: 22,
    pass_rate: 81,
  },
  {
    id: "wf_006",
    name: "Quarterly board memo",
    status: "active",
    updated_at: rel(60 * 50),
    runs: 4,
    pass_rate: 100,
  },
];

const ACTIVITY = [
  { id: "a1", title: "Run #4188 passed eval suite", kind: "run.succeeded", at: rel(2) },
  {
    id: "a2",
    title: "Approval requested — Atlas diligence v3",
    kind: "approval.requested",
    at: rel(7),
  },
  { id: "a3", title: "Budget threshold 60% — Nimbus", kind: "budget.warn", at: rel(18) },
  {
    id: "a4",
    title: "New agent pack installed: Research v2.4",
    kind: "marketplace.install",
    at: rel(33),
  },
  {
    id: "a5",
    title: "Workflow promoted to production: SOC2 evidence sweep",
    kind: "wf.promoted",
    at: rel(64),
  },
  { id: "a6", title: "Audit bundle exported — Orca Health Q2", kind: "audit.export", at: rel(120) },
  { id: "a7", title: "Run #4180 failed — schema mismatch", kind: "run.failed", at: rel(180) },
];

const PACKS = [
  {
    id: "p_research",
    name: "Research Pod",
    version: "2.4.1",
    agents: 6,
    description:
      "Planner, browser, librarian, synthesizer, citation-checker, archivist. Built for deep web + corpus research with citation guarantees.",
  },
  {
    id: "p_code",
    name: "Code Review",
    version: "1.8.0",
    agents: 5,
    description:
      "Reviewer, static-analyst, test-author, refactorer, doc-writer. Wires into GitHub checks and produces a single decision artifact.",
  },
  {
    id: "p_compliance",
    name: "Compliance Sweep",
    version: "3.0.2",
    agents: 7,
    description:
      "SOC2 / ISO / HIPAA evidence collectors with cryptographic chain-of-custody and exportable audit bundles.",
  },
  {
    id: "p_sdr",
    name: "Outbound SDR",
    version: "1.2.0",
    agents: 4,
    description:
      "Researcher, persona-fitter, copy-writer, sequencer. Pulls from your CRM and respects opt-outs.",
  },
  {
    id: "p_support",
    name: "Tier-1 Support",
    version: "2.0.0",
    agents: 5,
    description:
      "Triage, KB-search, drafter, escalator, QA. Co-pilots agents and never sends without approval.",
  },
  {
    id: "p_finance",
    name: "Finance Close",
    version: "1.1.0",
    agents: 6,
    description:
      "Reconciler, accrual-suggester, variance-explainer, memo-writer, approver, archivist.",
  },
];

const AUDIT = [
  {
    id: "ev1",
    at: rel(3),
    actor: "sasha@0101.dev",
    action: "workflow.promote",
    resource: "wf_002 (v14 → prod)",
  },
  {
    id: "ev2",
    at: rel(11),
    actor: "agent:reviewer",
    action: "artifact.write",
    resource: "cas/sha256:9f3a…/diligence.md",
  },
  {
    id: "ev3",
    at: rel(22),
    actor: "miles@atlas.fund",
    action: "approval.grant",
    resource: "run_4188",
  },
  { id: "ev4", at: rel(40), actor: "system", action: "budget.alert", resource: "company:c_nimbus" },
  {
    id: "ev5",
    at: rel(75),
    actor: "sasha@0101.dev",
    action: "secret.rotate",
    resource: "vault/openai",
  },
  {
    id: "ev6",
    at: rel(140),
    actor: "agent:planner",
    action: "tool.call",
    resource: "browser.fetch(arxiv.org)",
  },
  {
    id: "ev7",
    at: rel(60 * 4),
    actor: "ci",
    action: "eval.run",
    resource: "wf_001 · suite=regression",
  },
  {
    id: "ev8",
    at: rel(60 * 8),
    actor: "sasha@0101.dev",
    action: "audit.export",
    resource: "bundle_2026-06-05.tgz",
  },
];

const TREE = [
  { name: "runs", path: "/runs", kind: "dir" },
  { name: "artifacts", path: "/artifacts", kind: "dir" },
  { name: "evals", path: "/evals", kind: "dir" },
  { name: "exports", path: "/exports", kind: "dir" },
  { name: "diligence-atlas.md", path: "/artifacts/diligence-atlas.md", kind: "file" },
  { name: "soc2-evidence-2026Q2.tgz", path: "/exports/soc2-evidence-2026Q2.tgz", kind: "file" },
  { name: "irb-protocol-v3.pdf", path: "/artifacts/irb-protocol-v3.pdf", kind: "file" },
  { name: "carriers-exceptions.csv", path: "/artifacts/carriers-exceptions.csv", kind: "file" },
];

const TOPICS = [
  { id: "t_atlas", title: "Atlas diligence — target shortlist", updated_at: rel(4) },
  { id: "t_soc2", title: "SOC2 Q2 evidence gaps", updated_at: rel(38) },
  { id: "t_pricing", title: "Pricing page critique", updated_at: rel(60 * 3) },
  { id: "t_irb", title: "IRB protocol draft — v3 review", updated_at: rel(60 * 10) },
];

const RUN_EVENTS = [
  { at: ago(0.3), kind: "run.start", title: "Run started · workflow wf_001" },
  { at: ago(0.5), kind: "agent.plan", title: "Planner produced 6-step plan" },
  { at: ago(0.7), kind: "tool.call", title: "browser.fetch → sec.gov 10-K filings" },
  { at: ago(0.9), kind: "agent.handoff", title: "Handoff: librarian → analyst" },
  { at: ago(1.1), kind: "artifact.write", title: "Wrote artifacts/diligence-draft.md (12.4kB)" },
  { at: ago(1.4), kind: "eval.pass", title: "Eval: citation-coverage 98%" },
  { at: ago(1.6), kind: "approval.requested", title: "Approval requested from miles@atlas.fund" },
  { at: ago(1.9), kind: "approval.granted", title: "Approval granted" },
  { at: ago(2.0), kind: "run.succeeded", title: "Run completed · cost $0.84 · 32.1s" },
];

function matchCompany(id: string) {
  return COMPANIES.find((c) => c.id === id) ?? { ...COMPANIES[0], id };
}
function matchWorkflow(id: string) {
  const wf = WORKFLOWS.find((w) => w.id === id) ?? { ...WORKFLOWS[0], id };
  return {
    ...wf,
    nodes: [
      { id: "n1", kind: "planner", label: "Plan" },
      { id: "n2", kind: "tool", label: "browser.fetch" },
      { id: "n3", kind: "agent", label: "Analyst" },
      { id: "n4", kind: "eval", label: "Citation gate" },
      { id: "n5", kind: "approval", label: "Human approval" },
      { id: "n6", kind: "sink", label: "Artifact" },
    ],
    edges: [
      ["n1", "n2"],
      ["n2", "n3"],
      ["n3", "n4"],
      ["n4", "n5"],
      ["n5", "n6"],
    ],
    contract: { input: { topic: "string" }, output: { artifact: "markdown" } },
  };
}

export function getDemoResponse(path: string): unknown | undefined {
  const p = path.split("?")[0];
  if (p === "/auth/me") return DEMO_USER;
  if (p === "/api/dashboard/stats")
    return { total_runs: 1842, cost_today: 24.17, pass_rate: 96.4, open_approvals: 3 };
  if (p === "/api/dashboard/activity") return ACTIVITY;
  if (p === "/api/dashboard/workflows") return WORKFLOWS.slice(0, 5);
  if (p === "/api/workflows") return WORKFLOWS;
  if (p === "/api/companies") return COMPANIES;
  if (p === "/api/marketplace/packs") return PACKS;
  if (p === "/api/chat/topics") return TOPICS;
  if (p === "/api/workspace/tree") return TREE;
  if (p === "/audit/events") return AUDIT;

  let m = p.match(/^\/api\/companies\/([^/]+)$/);
  if (m) return matchCompany(m[1]);
  m = p.match(/^\/api\/companies\/([^/]+)\/teams$/);
  if (m)
    return [
      { id: "team_a", name: "Diligence pod", agents: 8 },
      { id: "team_b", name: "Compliance pod", agents: 5 },
      { id: "team_c", name: "Comms pod", agents: 3 },
    ];
  m = p.match(/^\/api\/workflows\/([^/]+)$/);
  if (m) return matchWorkflow(m[1]);
  m = p.match(/^\/api\/runs\/([^/]+)\/status$/);
  if (m)
    return {
      id: m[1],
      state: "succeeded",
      workflow: "wf_001",
      cost_usd: 0.84,
      duration_ms: 32100,
      started_at: ago(2),
      finished_at: ago(0),
    };
  m = p.match(/^\/api\/runs\/([^/]+)\/events$/);
  if (m) return RUN_EVENTS;

  return undefined;
}
