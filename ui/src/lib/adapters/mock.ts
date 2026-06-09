/**
 * Single isolated mock adapter implementation.
 * No other file in the app may contain fake business data.
 *
 * To swap to a real backend, implement the same interfaces in a sibling
 * `real.ts` and switch the export in `index.ts`.
 */

import type {
  Agent,
  Approval,
  Artifact,
  AuditEvent,
  ChatMessage,
  ChatTopic,
  Company,
  CompanyOperations,
  CompanyTask,
  DashboardStats,
  DeviceSession,
  Evaluation,
  Issue,
  MarketplacePack,
  PreparedTaskRun,
  ProviderConfig,
  Run,
  RunEvent,
  RunStatus,
  TaskReportEmailResult,
  Team,
  Workflow,
  WorkflowNode,
  WorkflowStatus,
  WorkflowSummary,
} from "./types";

const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));

const now = () => Date.now();
const ago = (mins: number) => new Date(now() - mins * 60_000).toISOString();

/* -------------------- seed data -------------------- */

const COMPANIES: Company[] = [
  {
    id: "c_atlas",
    name: "Atlas Capital",
    slug: "atlas",
    industry: "Private Equity",
    mission: "Autonomous diligence pods for mid-market PE.",
    agents: 42,
    teams: 6,
    runs_30d: 1284,
    spend_30d: 3120.55,
  },
  {
    id: "c_nimbus",
    name: "Nimbus Labs",
    slug: "nimbus",
    industry: "SaaS",
    mission: "Continuous compliance: SOC2 + ISO 27001 always-on.",
    agents: 18,
    teams: 3,
    runs_30d: 612,
    spend_30d: 980.12,
  },
  {
    id: "c_orca",
    name: "Orca Health",
    slug: "orca",
    industry: "Clinical",
    mission: "Trial intake, IRB drafting, protocol QA.",
    agents: 27,
    teams: 4,
    runs_30d: 503,
    spend_30d: 2210.4,
  },
  {
    id: "c_kite",
    name: "Kite Logistics",
    slug: "kite",
    industry: "Logistics",
    mission: "Freight exception triage and carrier nudges.",
    agents: 12,
    teams: 2,
    runs_30d: 244,
    spend_30d: 410.0,
  },
];

const WORKFLOW_SUMMARIES: WorkflowSummary[] = [
  {
    id: "wf_001",
    name: "Diligence — SaaS target",
    status: "active",
    updated_at: ago(12),
    runs: 184,
    pass_rate: 96,
    company_name: "Atlas Capital",
  },
  {
    id: "wf_002",
    name: "SOC2 evidence sweep",
    status: "active",
    updated_at: ago(54),
    runs: 76,
    pass_rate: 99,
    company_name: "Nimbus Labs",
  },
  {
    id: "wf_003",
    name: "IRB protocol draft",
    status: "draft",
    updated_at: ago(60 * 3),
    runs: 12,
    pass_rate: 88,
    company_name: "Orca Health",
  },
  {
    id: "wf_004",
    name: "Carrier exception triage",
    status: "active",
    updated_at: ago(60 * 6),
    runs: 311,
    pass_rate: 92,
    company_name: "Kite Logistics",
  },
  {
    id: "wf_005",
    name: "Pricing-page A/B critique",
    status: "paused",
    updated_at: ago(60 * 26),
    runs: 22,
    pass_rate: 81,
    company_name: "Nimbus Labs",
  },
  {
    id: "wf_006",
    name: "Quarterly board memo",
    status: "active",
    updated_at: ago(60 * 50),
    runs: 4,
    pass_rate: 100,
    company_name: "Atlas Capital",
  },
];

const DEFAULT_NODES: WorkflowNode[] = [
  { id: "n1", kind: "source", label: "Trigger", role: "system", x: 60, y: 160 },
  { id: "n2", kind: "planner", label: "Plan", role: "planner", x: 240, y: 160 },
  { id: "n3", kind: "tool", label: "browser.fetch", role: "tool", x: 420, y: 100 },
  { id: "n4", kind: "agent", label: "Analyst", role: "analyst", x: 420, y: 220 },
  { id: "n5", kind: "eval", label: "Citation gate", role: "eval", x: 600, y: 160 },
  { id: "n6", kind: "approval", label: "Human approval", role: "approver", x: 780, y: 160 },
  { id: "n7", kind: "sink", label: "Artifact", role: "system", x: 960, y: 160 },
];
const DEFAULT_EDGES: Array<[string, string]> = [
  ["n1", "n2"],
  ["n2", "n3"],
  ["n2", "n4"],
  ["n3", "n5"],
  ["n4", "n5"],
  ["n5", "n6"],
  ["n6", "n7"],
];

function buildWorkflow(id: string): Workflow {
  const summary = WORKFLOW_SUMMARIES.find((w) => w.id === id) ?? WORKFLOW_SUMMARIES[0];
  return {
    id,
    name: summary.name,
    description: "Production workflow. Versioned, evaluated, audited.",
    status: summary.status,
    version: 14,
    updated_at: summary.updated_at,
    company_name: summary.company_name,
    nodes: DEFAULT_NODES,
    edges: DEFAULT_EDGES,
    contract: { input: { topic: "string" }, output: { artifact: "markdown" } },
    stats: { runs: summary.runs, pass_rate: summary.pass_rate, last_run_at: ago(8) },
  };
}

const AGENTS: Agent[] = [
  {
    id: "ag_1",
    name: "Research Lead",
    role: "researcher",
    status: "active",
    category: "Research",
    capabilities: ["web-search", "summarize", "cite"],
    description: "Plans and executes governed web research with citation guarantees.",
    skill_source: "skills/research-lead",
    last_activity_at: ago(3),
  },
  {
    id: "ag_2",
    name: "Code Reviewer",
    role: "reviewer",
    status: "active",
    category: "Engineering",
    capabilities: ["static-analysis", "diff-read"],
    description: "Reviews PRs against your style and security policies.",
    skill_source: "skills/code-review",
    last_activity_at: ago(11),
  },
  {
    id: "ag_3",
    name: "Compliance Sweeper",
    role: "compliance",
    status: "active",
    category: "Compliance",
    capabilities: ["evidence-collect", "control-map"],
    description: "Continuously gathers SOC2 / ISO evidence.",
    skill_source: "skills/compliance-sweeper",
    last_activity_at: ago(2),
  },
  {
    id: "ag_4",
    name: "Outbound SDR",
    role: "sdr",
    status: "idle",
    category: "Sales",
    capabilities: ["crm-read", "draft-email"],
    description: "Researches accounts and drafts outbound sequences.",
    skill_source: "skills/sdr",
    last_activity_at: ago(60 * 4),
  },
  {
    id: "ag_5",
    name: "Tier-1 Support",
    role: "support",
    status: "active",
    category: "Support",
    capabilities: ["kb-search", "escalate"],
    description: "Co-pilots support agents with KB-grounded drafts.",
    skill_source: "skills/support",
    last_activity_at: ago(28),
  },
  {
    id: "ag_6",
    name: "Finance Closer",
    role: "finance",
    status: "disabled",
    category: "Finance",
    capabilities: ["reconcile", "accrual"],
    description: "Reconciles ledgers and proposes accruals.",
    skill_source: "skills/finance-close",
    last_activity_at: ago(60 * 24 * 2),
  },
  {
    id: "ag_7",
    name: "Citation Checker",
    role: "eval",
    status: "active",
    category: "Research",
    capabilities: ["verify", "score"],
    description: "Verifies citations against source URLs.",
    skill_source: "skills/citation-check",
    last_activity_at: ago(5),
  },
  {
    id: "ag_8",
    name: "IRB Drafter",
    role: "writer",
    status: "active",
    category: "Clinical",
    capabilities: ["draft", "format"],
    description: "Drafts IRB protocols from intake forms.",
    skill_source: "skills/irb-drafter",
    last_activity_at: ago(45),
  },
];

const PACKS: MarketplacePack[] = [
  {
    id: "p_research",
    name: "Research Pod",
    version: "2.4.1",
    agents: 6,
    category: "Research",
    description:
      "Planner, browser, librarian, synthesizer, citation-checker, archivist. Deep research with citation guarantees.",
  },
  {
    id: "p_code",
    name: "Code Review",
    version: "1.8.0",
    agents: 5,
    category: "Engineering",
    description:
      "Reviewer, static-analyst, test-author, refactorer, doc-writer. Wires into GitHub checks.",
  },
  {
    id: "p_compliance",
    name: "Compliance Sweep",
    version: "3.0.2",
    agents: 7,
    category: "Compliance",
    description: "SOC2 / ISO / HIPAA evidence collectors with cryptographic chain-of-custody.",
    installed: true,
  },
  {
    id: "p_sdr",
    name: "Outbound SDR",
    version: "1.2.0",
    agents: 4,
    category: "Sales",
    description: "Researcher, persona-fitter, copy-writer, sequencer. Respects opt-outs.",
  },
  {
    id: "p_support",
    name: "Tier-1 Support",
    version: "2.0.0",
    agents: 5,
    category: "Support",
    description: "Triage, KB-search, drafter, escalator, QA. Never sends without approval.",
  },
  {
    id: "p_finance",
    name: "Finance Close",
    version: "1.1.0",
    agents: 6,
    category: "Finance",
    description:
      "Reconciler, accrual-suggester, variance-explainer, memo-writer, approver, archivist.",
  },
];

const AUDIT: AuditEvent[] = [
  {
    id: "ev1",
    at: ago(3),
    actor: "sasha@0101.dev",
    action: "workflow.promote",
    resource: "wf_002 (v14 → prod)",
  },
  {
    id: "ev2",
    at: ago(11),
    actor: "agent:reviewer",
    action: "artifact.write",
    resource: "cas/sha256:9f3a…/diligence.md",
  },
  {
    id: "ev3",
    at: ago(22),
    actor: "miles@atlas.fund",
    action: "approval.grant",
    resource: "run_4188",
    cost_usd: 0.84,
  },
  { id: "ev4", at: ago(40), actor: "system", action: "budget.alert", resource: "company:c_nimbus" },
  {
    id: "ev5",
    at: ago(75),
    actor: "sasha@0101.dev",
    action: "secret.rotate",
    resource: "vault/openai",
  },
  {
    id: "ev6",
    at: ago(140),
    actor: "agent:planner",
    action: "tool.call",
    resource: "browser.fetch(arxiv.org)",
  },
  {
    id: "ev7",
    at: ago(60 * 4),
    actor: "ci",
    action: "eval.run",
    resource: "wf_001 · suite=regression",
  },
  {
    id: "ev8",
    at: ago(60 * 8),
    actor: "sasha@0101.dev",
    action: "audit.export",
    resource: "bundle_2026-06-05.tgz",
  },
];

const APPROVALS: Approval[] = [
  {
    id: "ap_1",
    run_id: "run_4188",
    workflow_name: "Diligence — SaaS target",
    requested_at: ago(7),
    requested_by: "agent:reviewer",
    risk: "medium",
    summary: "Send acquisition memo draft to Miles for review.",
    context: "Final memo synthesizes 12 sources. Eval suite passed. Cost $0.84.",
    cost_usd: 0.84,
  },
  {
    id: "ap_2",
    run_id: "run_4191",
    workflow_name: "SOC2 evidence sweep",
    requested_at: ago(22),
    requested_by: "agent:compliance",
    risk: "low",
    summary: "Promote new evidence bundle to Q2 archive.",
    context: "All 47 controls have collected evidence. No deltas vs Q1.",
  },
  {
    id: "ap_3",
    run_id: "run_4195",
    workflow_name: "Carrier exception triage",
    requested_at: ago(48),
    requested_by: "agent:planner",
    risk: "high",
    summary: "Approve auto-rebook on 3 freight exceptions over $5k.",
    context: "Carriers: Schneider, Knight, JBHunt. Total reroute cost $14,210.",
  },
];

const ISSUES: Issue[] = [
  {
    id: "is_1",
    title: "Citation gate flaky on long PDFs",
    severity: "medium",
    status: "acknowledged",
    owner: "sasha@0101.dev",
    opened_at: ago(60 * 12),
    related_run_id: "run_4180",
  },
  {
    id: "is_2",
    title: "OpenAI key rotation pending",
    severity: "high",
    status: "open",
    owner: "ops@atlas.fund",
    opened_at: ago(60 * 30),
  },
  {
    id: "is_3",
    title: "Workflow wf_003 missing approval gate",
    severity: "low",
    status: "open",
    opened_at: ago(60 * 50),
  },
];

const TASKS: CompanyTask[] = [
  {
    id: "task_demo_1",
    company_id: "c_nimbus",
    title: "Write a SOC2 evidence review",
    prompt: "Write a SOC2 evidence review",
    status: "ready",
    type: "one_time",
    agent_id: "ag_3",
    output_type: "auto",
    report_recipient_email: "operator@0101.dev",
    report_on_completion: true,
    route: {
      selected_agents: [
        {
          stage: "stage_1",
          agent_id: "ag_3",
          agent_name: "Compliance Sweeper",
          requested_role: "compliance",
          selection_reason: "Explicitly selected by the CEO.",
          match_confidence: 0.94,
        },
      ],
      missing_roles: [],
      route_quality: "ready",
      routing_reason: "Routed through the active hired workforce for this company.",
    },
    schedule: {},
    created_at: ago(15),
    updated_at: ago(15),
  },
];

const TOPICS: ChatTopic[] = [
  {
    id: "t_atlas",
    title: "Atlas diligence — target shortlist",
    updated_at: ago(4),
    unread: 2,
    assistant_id: "ag_1",
  },
  { id: "t_soc2", title: "SOC2 Q2 evidence gaps", updated_at: ago(38), assistant_id: "ag_3" },
  {
    id: "t_pricing",
    title: "Pricing page critique",
    updated_at: ago(60 * 3),
    assistant_id: "ag_2",
  },
  {
    id: "t_irb",
    title: "IRB protocol draft — v3 review",
    updated_at: ago(60 * 10),
    assistant_id: "ag_5",
  },
];

const TOPIC_MESSAGES: Record<string, ChatMessage[]> = {
  t_atlas: [
    {
      id: "m1",
      topic_id: "t_atlas",
      role: "user",
      author: "Sasha",
      at: ago(60),
      body: "Shortlist three SaaS targets in mid-market security.",
    },
    {
      id: "m2",
      topic_id: "t_atlas",
      role: "agent",
      author: "Research Lead",
      at: ago(58),
      body: "Pulled 14 candidates, filtered to 3 by ARR + retention. Memo attached.",
    },
    {
      id: "m3",
      topic_id: "t_atlas",
      role: "agent",
      author: "Citation Checker",
      at: ago(55),
      body: "All 12 citations verified against source URLs.",
    },
  ],
};

const PROVIDERS: ProviderConfig[] = [
  {
    id: "pc_1",
    scope: "account",
    provider: "OpenAI",
    model: "gpt-5",
    api_key_suffix: "k7Q3",
    base_url: "https://api.openai.com/v1",
    created_at: ago(60 * 24 * 30),
    updated_at: ago(60 * 24 * 4),
  },
  {
    id: "pc_2",
    scope: "workspace",
    workspace_id: "c_atlas",
    provider: "Anthropic",
    model: "claude-opus-4.5",
    api_key_suffix: "9aZX",
    created_at: ago(60 * 24 * 18),
    updated_at: ago(60 * 24 * 18),
  },
];

const SESSIONS: DeviceSession[] = [
  { id: "sess_1", device: "Chrome · macOS 14", last_active: ago(0), current: true },
  { id: "sess_2", device: "Safari · iOS 18", last_active: ago(60 * 14), current: false },
];

function buildRun(id: string, opts: { failed?: boolean } = {}): Run {
  const failed = opts.failed ?? id.endsWith("fail");
  const status: RunStatus = failed ? "failed" : "succeeded";
  const events: RunEvent[] = [
    { at: ago(3), kind: "run.start", title: "Run started · workflow wf_001" },
    { at: ago(2.7), kind: "agent.plan", title: "Planner produced 6-step plan", node_id: "n2" },
    {
      at: ago(2.4),
      kind: "tool.call",
      title: "browser.fetch → sec.gov 10-K filings",
      node_id: "n3",
    },
    { at: ago(2.1), kind: "agent.handoff", title: "Handoff: planner → analyst", node_id: "n4" },
    {
      at: ago(1.8),
      kind: "artifact.write",
      title: "Wrote artifacts/diligence-draft.md (12.4kB)",
      node_id: "n4",
    },
    failed
      ? {
          at: ago(1.5),
          kind: "eval.fail",
          title: "Eval failed: citation-coverage 71% (threshold 90%)",
          node_id: "n5",
          detail: "Missing source URLs for 4 of 14 citations.",
        }
      : { at: ago(1.5), kind: "eval.pass", title: "Eval: citation-coverage 98%", node_id: "n5" },
    ...(failed
      ? []
      : [
          {
            at: ago(1.2),
            kind: "approval.requested",
            title: "Approval requested from miles@atlas.fund",
            node_id: "n6",
          },
          { at: ago(0.9), kind: "approval.granted", title: "Approval granted", node_id: "n6" },
          { at: ago(0.3), kind: "run.succeeded", title: "Run completed · cost $0.84 · 32.1s" },
        ]),
  ];

  const node_statuses: Record<string, import("./types").NodeStatus> = failed
    ? {
        n1: "succeeded",
        n2: "succeeded",
        n3: "succeeded",
        n4: "succeeded",
        n5: "failed",
        n6: "skipped",
        n7: "skipped",
      }
    : {
        n1: "succeeded",
        n2: "succeeded",
        n3: "succeeded",
        n4: "succeeded",
        n5: "succeeded",
        n6: "succeeded",
        n7: "succeeded",
      };

  const artifacts: Artifact[] = [
    {
      id: "a_1",
      name: "diligence-draft.md",
      path: "/artifacts/diligence-draft.md",
      size_bytes: 12_400,
      mime: "text/markdown",
      sha256: "9f3a8b2c…",
    },
    {
      id: "a_2",
      name: "sources.json",
      path: "/artifacts/sources.json",
      size_bytes: 4_120,
      mime: "application/json",
      sha256: "1d2e7f44…",
    },
  ];

  const evaluations: Evaluation[] = failed
    ? [
        {
          id: "ev_a",
          name: "citation-coverage",
          status: "fail",
          score: 71,
          detail: "Threshold 90%. Missing 4 sources.",
        },
        { id: "ev_b", name: "schema-conformance", status: "pass", score: 100 },
      ]
    : [
        { id: "ev_a", name: "citation-coverage", status: "pass", score: 98 },
        { id: "ev_b", name: "schema-conformance", status: "pass", score: 100 },
        {
          id: "ev_c",
          name: "tone-policy",
          status: "warn",
          score: 88,
          detail: "Two passive-voice sentences.",
        },
      ];

  return {
    run_id: id,
    workflow_id: "wf_001",
    workflow_name: "Diligence — SaaS target",
    status,
    started_at: ago(3),
    finished_at: ago(0),
    current_step: 5,
    current_node_label: failed ? "Citation gate" : "Artifact",
    current_node_role: failed ? "eval" : "system",
    node_statuses,
    failed_node: failed ? { id: "n5", label: "Citation gate", role: "eval" } : undefined,
    failure_reason: failed
      ? "Eval failed: citation-coverage 71% (threshold 90%). 4 of 14 citations missing source URLs."
      : undefined,
    output_markdown: failed
      ? `# Run failed\n\nThe **citation gate** rejected this draft.\n\n## Why\n\n- Required coverage: \`90%\`\n- Actual coverage: \`71%\`\n- Missing sources for 4 of 14 citations\n\nRerun with the \`--retry-missing-sources\` flag, or open the draft and fix manually.\n`
      : `# Diligence memo — Acme Corp\n\n_Generated by **0101** workflow \`wf_001\` v14, approved by miles@atlas.fund._\n\n## Summary\n\nAcme is a vertical-SaaS player in **regulated logistics** with $42M ARR, 118% NDR, and a defensible compliance moat.\n\n## Key findings\n\n1. **Retention** — Net dollar retention has held above 115% for six quarters.\n2. **Concentration** — Top 10 customers = 38% of ARR. Acceptable.\n3. **Compliance** — SOC2 Type II + ISO 27001 in force.\n\n## Risks\n\n- Single-vendor dependency on AWS us-east-1.\n- Founder concentration on the technical roadmap.\n\n## Recommendation\n\n**Pursue** at an indicative range of 6–8× ARR, contingent on a clean Q.\n`,
    artifacts,
    evaluations,
    events,
    audit: { actor: "sasha@0101.dev", trace_id: "trc_8f1a-7d3e" },
    cost: { usd: 0.84, tokens_in: 18_420, tokens_out: 6_120 },
    duration_ms: 32_100,
  };
}

const RECENT_RUNS = [
  {
    run_id: "run_4188",
    workflow_id: "wf_001",
    workflow_name: "Diligence — SaaS target",
    status: "succeeded" as RunStatus,
    started_at: ago(2),
    finished_at: ago(0),
    cost_usd: 0.84,
  },
  {
    run_id: "run_4187",
    workflow_id: "wf_002",
    workflow_name: "SOC2 evidence sweep",
    status: "succeeded" as RunStatus,
    started_at: ago(11),
    finished_at: ago(10),
    cost_usd: 0.12,
  },
  {
    run_id: "run_4186fail",
    workflow_id: "wf_001",
    workflow_name: "Diligence — SaaS target",
    status: "failed" as RunStatus,
    started_at: ago(22),
    finished_at: ago(21),
    cost_usd: 0.41,
  },
  {
    run_id: "run_4185",
    workflow_id: "wf_004",
    workflow_name: "Carrier exception triage",
    status: "awaiting_approval" as RunStatus,
    started_at: ago(33),
    cost_usd: 0.22,
  },
  {
    run_id: "run_4184",
    workflow_id: "wf_002",
    workflow_name: "SOC2 evidence sweep",
    status: "succeeded" as RunStatus,
    started_at: ago(60),
    finished_at: ago(59),
    cost_usd: 0.08,
  },
];

/* -------------------- adapter implementations -------------------- */

export const dashboardApi = {
  async getStats(): Promise<DashboardStats> {
    await wait();
    return {
      active_workflows: WORKFLOW_SUMMARIES.filter((w) => w.status === "active").length,
      agents_deployed: AGENTS.filter((a) => a.status === "active").length,
      agents_available: AGENTS.length,
      runs_24h: 1842,
      cost_24h_usd: 24.17,
      pass_rate: 96.4,
      open_approvals: APPROVALS.length,
      attention_count: RECENT_RUNS.filter(
        (r) => r.status === "failed" || r.status === "awaiting_approval",
      ).length,
    };
  },
  async getRecentWorkflows() {
    await wait();
    return WORKFLOW_SUMMARIES.slice(0, 5);
  },
  async getRecentRuns() {
    await wait();
    return RECENT_RUNS.slice(0, 8);
  },
  async getActivity() {
    await wait();
    return AUDIT.slice(0, 6);
  },
  async getAttention() {
    await wait();
    return RECENT_RUNS.filter((r) => r.status === "failed" || r.status === "awaiting_approval");
  },
};

export const workflowApi = {
  async list(query?: string, statusFilter?: WorkflowStatus | "all"): Promise<WorkflowSummary[]> {
    await wait();
    let out = WORKFLOW_SUMMARIES;
    if (statusFilter && statusFilter !== "all") out = out.filter((w) => w.status === statusFilter);
    if (query) out = out.filter((w) => w.name.toLowerCase().includes(query.toLowerCase()));
    return out;
  },
  async getById(id: string): Promise<Workflow> {
    await wait();
    return buildWorkflow(id);
  },
  async create(input: {
    name: string;
    description?: string;
    companyId?: string;
  }): Promise<Workflow> {
    await wait(200);
    const id = `wf_${Math.random().toString(36).slice(2, 6)}`;
    WORKFLOW_SUMMARIES.unshift({
      id,
      name: input.name,
      status: "draft",
      updated_at: new Date().toISOString(),
      runs: 0,
      pass_rate: 0,
    });
    return buildWorkflow(id);
  },
  async update(id: string, _patch: Partial<Workflow>): Promise<void> {
    await wait();
    void id;
    void _patch;
  },
  async delete(id: string): Promise<void> {
    await wait();
    const i = WORKFLOW_SUMMARIES.findIndex((w) => w.id === id);
    if (i >= 0) WORKFLOW_SUMMARIES.splice(i, 1);
  },
  async run(
    id: string,
    options?: {
      taskId?: string;
      companyId?: string;
      initialInput?: string;
      graph?: { nodes?: unknown[]; edges?: unknown[]; metadata?: Record<string, unknown> };
    },
  ): Promise<{ run_id: string }> {
    await wait(200);
    void options;
    void id;
    return { run_id: `run_${Math.floor(Math.random() * 9999)}` };
  },
  async rerun(runId: string): Promise<{ run_id: string }> {
    await wait();
    void runId;
    return { run_id: `run_${Math.floor(Math.random() * 9999)}` };
  },
  async listRuns(workflowId: string) {
    await wait();
    void workflowId;
    return RECENT_RUNS;
  },
  async getRunStatus(runId: string) {
    await wait();
    return { run_id: runId, status: "succeeded" as RunStatus };
  },
  async getRunOutput(runId: string): Promise<Run> {
    await wait();
    return buildRun(runId);
  },
};

export const companyApi = {
  async list(): Promise<Company[]> {
    await wait();
    return COMPANIES;
  },
  async getById(id: string): Promise<Company> {
    await wait();
    return COMPANIES.find((c) => c.id === id) ?? COMPANIES[0];
  },
  async getOperations(companyId: string): Promise<CompanyOperations> {
    await wait();
    const company = await this.getById(companyId);
    const tasks = TASKS.filter((task) => task.company_id === companyId || companyId === "c_nimbus");
    const agents = await this.getAgents(companyId);
    const activeAgents = agents.filter((agent) => !["disabled", "fired"].includes(agent.status));
    const runningAgents = agents.filter((agent) => agent.status === "running");
    const pausedAgents = agents.filter((agent) => agent.status === "paused");
    const completed = tasks.filter((task) => ["completed", "completed_passed"].includes(task.status));
    const failed = tasks.filter((task) => task.status === "failed");
    const openTasks = tasks.filter((task) => ["queued", "running", "needs_hiring", "blocked"].includes(task.status));
    return {
      company: {
        ...company,
        team_count: 3,
        agent_count: agents.length,
        issue_count: tasks.length,
      },
      counts: {
        teams: 3,
        agents: agents.length,
        issues: {
          total: tasks.length,
          queued: tasks.filter((task) => task.status === "queued").length,
          running: tasks.filter((task) => task.status === "running").length,
          completed: completed.length,
          failed: failed.length,
          blocked: tasks.filter((task) => task.status === "blocked").length,
        },
        workflows: {
          total: tasks.filter((task) => task.type === "workflow").length,
          running: tasks.filter((task) => task.type === "workflow" && task.status === "queued").length,
          completed: completed.filter((task) => task.type === "workflow").length,
          failed: failed.filter((task) => task.type === "workflow").length,
          paused: 0,
        },
        open_issues: openTasks.length,
        approvals_waiting: tasks.filter((task) => task.status === "blocked").length,
        blocked_items: tasks.filter((task) => task.status === "blocked").length,
        failed_runs: failed.length,
        agent_health: {
          idle: agents.filter((agent) => agent.status === "idle").length,
          running: runningAgents.length,
          paused: pausedAgents.length,
        },
        evaluation_pass_rate:
          tasks.length > 0 ? Math.round((completed.length / tasks.length) * 1000) / 10 : 0,
        health_score: Math.max(35, 100 - failed.length * 18 - openTasks.length * 4),
      },
      recent: {
        issues: tasks.slice(0, 6),
        activity: AUDIT.slice(0, 8),
        runs: [
          {
            run_id: "run_mock_01",
            workflow_id: "wf_001",
            status: "running",
            current_node: "Research",
            last_agent_id: activeAgents[0]?.id,
            started_at: ago(12),
          },
          {
            run_id: "run_mock_02",
            workflow_id: "wf_002",
            status: "succeeded",
            current_node: "Validate",
            last_agent_id: activeAgents[1]?.id,
            started_at: ago(40),
            completed_at: ago(18),
          },
        ],
        artifacts: [],
      },
      generated_at: new Date().toISOString(),
    };
  },
  async create(input: { name: string; industry?: string; mission?: string }): Promise<Company> {
    await wait();
    const c: Company = {
      id: `c_${Math.random().toString(36).slice(2, 6)}`,
      name: input.name,
      slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      industry: input.industry,
      mission: input.mission,
      agents: 0,
      teams: 0,
      runs_30d: 0,
      spend_30d: 0,
    };
    COMPANIES.unshift(c);
    return c;
  },
  async getTeams(companyId: string): Promise<Team[]> {
    await wait();
    void companyId;
    return [
      {
        id: "team_a",
        name: "Diligence pod",
        agents: 8,
        mission: "Acquisition memos and target screens.",
      },
      {
        id: "team_b",
        name: "Compliance pod",
        agents: 5,
        mission: "SOC2 + ISO continuous evidence.",
      },
      { id: "team_c", name: "Comms pod", agents: 3, mission: "Board memos and internal updates." },
    ];
  },
  async getAgents(companyId: string): Promise<Agent[]> {
    await wait();
    void companyId;
    return AGENTS.slice(0, 6);
  },
  async listTasks(companyId: string): Promise<CompanyTask[]> {
    await wait();
    return TASKS.filter((task) => task.company_id === companyId || companyId === "c_nimbus");
  },
  async createTask(
    companyId: string,
    input: {
      title?: string;
      prompt: string;
      department_id?: string;
      agent_ids?: string[];
      output_type?: string;
      task_type?: "one_time" | "workflow";
      schedule?: Record<string, unknown>;
      report_recipient_email?: string;
      report_on_completion?: boolean;
    },
  ): Promise<CompanyTask> {
    await wait(180);
    const selectedAgent = AGENTS.find((agent) => agent.id === input.agent_ids?.[0]);
    const task: CompanyTask = {
      id: `task_${Math.random().toString(36).slice(2, 8)}`,
      company_id: companyId,
      title: input.title ?? input.prompt.slice(0, 80),
      prompt: input.prompt,
      status: selectedAgent ? "ready" : "needs_hiring",
      type: input.task_type ?? "one_time",
      department_id: input.department_id,
      agent_id: selectedAgent?.id,
      output_type: input.output_type ?? "auto",
      report_recipient_email: input.report_recipient_email,
      report_on_completion: Boolean(input.report_on_completion && input.report_recipient_email),
      route: {
        selected_agents: selectedAgent
          ? [
              {
                stage: "stage_1",
                agent_id: selectedAgent.id,
                agent_name: selectedAgent.name,
                requested_role: selectedAgent.role,
                selection_reason: "Explicitly selected by the CEO.",
                match_confidence: 0.95,
              },
            ]
          : [],
        missing_roles: selectedAgent
          ? []
          : [{ role: "Workflow Architect", reason: "Hire or select an active agent first." }],
        route_quality: selectedAgent ? "ready" : "needs_hiring",
        routing_reason: selectedAgent
          ? "Routed through the selected hired agent."
          : "No active hired agents matched this CEO task.",
      },
      schedule: input.task_type === "workflow" ? (input.schedule ?? {}) : {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    TASKS.unshift(task);
    return task;
  },
  async getTask(companyId: string, taskId: string): Promise<CompanyTask> {
    await wait();
    const task = TASKS.find((item) => item.id === taskId && item.company_id === companyId);
    if (!task) throw new Error("Task not found");
    return task;
  },
  async prepareTaskRun(companyId: string, taskId: string): Promise<PreparedTaskRun> {
    await wait(160);
    const task = await this.getTask(companyId, taskId);
    const workflowId = task.workflow_id ?? `task_wf_${Math.random().toString(36).slice(2, 8)}`;
    task.workflow_id = workflowId;
    task.status = "queued";
    task.updated_at = new Date().toISOString();
    return {
      task_id: task.id,
      workflow_id: workflowId,
      graph: {
        nodes: [
          {
            id: "task_agent_1",
            type: "agentNode",
            data: {
              label: task.route.selected_agents[0]?.agent_name ?? "Assigned agent",
              role: task.route.selected_agents[0]?.requested_role ?? "Agent",
            },
          },
        ],
        edges: [],
        metadata: { task_id: task.id, internal_task: true },
      },
      initial_input: task.prompt,
      approved: true,
    };
  },
  async sendTaskReportEmail(
    companyId: string,
    taskId: string,
    recipientEmail?: string,
  ): Promise<TaskReportEmailResult> {
    await wait(180);
    const task = await this.getTask(companyId, taskId);
    const recipient = recipientEmail ?? task.report_recipient_email ?? "operator@0101.dev";
    task.report_recipient_email = recipient;
    task.report_on_completion = true;
    task.report_sent_at = new Date().toISOString();
    task.report_delivery_status = "logged";
    task.report_delivery_details = "Mock delivery logged.";
    return {
      task_id: task.id,
      recipient_email: recipient,
      delivery_status: "logged",
      delivery_details: "Mock delivery logged.",
      sent_at: task.report_sent_at,
    };
  },
  async getIssues(companyId: string): Promise<Issue[]> {
    await wait();
    void companyId;
    return ISSUES;
  },
  async getActivity(companyId: string): Promise<AuditEvent[]> {
    await wait();
    void companyId;
    return AUDIT;
  },
  async getReports(companyId: string) {
    await wait();
    void companyId;
    return [
      {
        id: "r_1",
        title: "Q2 quality trend",
        period: "2026-Q2",
        pass_rate: 96.4,
        runs: 1842,
        cost_usd: 412.18,
      },
      {
        id: "r_2",
        title: "Q1 quality trend",
        period: "2026-Q1",
        pass_rate: 94.1,
        runs: 1610,
        cost_usd: 388.5,
      },
    ];
  },
};

export const agentApi = {
  async list(query?: string, category?: string): Promise<Agent[]> {
    await wait();
    let out = AGENTS;
    if (category && category !== "All") out = out.filter((a) => a.category === category);
    if (query)
      out = out.filter((a) => (a.name + " " + a.role).toLowerCase().includes(query.toLowerCase()));
    return out;
  },
  async getById(id: string): Promise<Agent | undefined> {
    await wait();
    return AGENTS.find((a) => a.id === id);
  },
  async categories(): Promise<string[]> {
    await wait();
    return ["All", ...Array.from(new Set(AGENTS.map((a) => a.category!).filter(Boolean)))];
  },
};

export const approvalApi = {
  async listPending(): Promise<Approval[]> {
    await wait();
    return APPROVALS;
  },
  async getById(id: string): Promise<Approval | undefined> {
    await wait();
    return APPROVALS.find((a) => a.id === id);
  },
  async approve(id: string): Promise<void> {
    await wait(200);
    const i = APPROVALS.findIndex((a) => a.id === id);
    if (i >= 0) APPROVALS.splice(i, 1);
  },
  async reject(id: string, _reason?: string): Promise<void> {
    await wait(200);
    void _reason;
    const i = APPROVALS.findIndex((a) => a.id === id);
    if (i >= 0) APPROVALS.splice(i, 1);
  },
};

export const marketplaceApi = {
  async listPacks(query?: string, category?: string): Promise<MarketplacePack[]> {
    await wait();
    let out = PACKS;
    if (category && category !== "All") out = out.filter((p) => p.category === category);
    if (query) out = out.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
    return out;
  },
  async install(id: string): Promise<void> {
    await wait(300);
    const p = PACKS.find((x) => x.id === id);
    if (p) p.installed = true;
  },
  async categories(): Promise<string[]> {
    await wait();
    return ["All", ...Array.from(new Set(PACKS.map((p) => p.category)))];
  },
};

export const auditApi = {
  async list(): Promise<AuditEvent[]> {
    await wait();
    return AUDIT;
  },
};

export const chatApi = {
  async listTopics(): Promise<ChatTopic[]> {
    await wait();
    return TOPICS;
  },
  async createTopic(input: { title: string; assistant_id?: string }): Promise<ChatTopic> {
    await wait(120);
    const topic: ChatTopic = {
      id: `t_${Math.random().toString(36).slice(2, 8)}`,
      title: input.title,
      updated_at: new Date().toISOString(),
      assistant_id: input.assistant_id,
    };
    TOPICS.unshift(topic);
    return topic;
  },
  async deleteTopic(topicId: string): Promise<void> {
    await wait(90);
    const index = TOPICS.findIndex((topic) => topic.id === topicId);
    if (index >= 0) TOPICS.splice(index, 1);
    delete TOPIC_MESSAGES[topicId];
  },
  async getMessages(topicId: string): Promise<ChatMessage[]> {
    await wait();
    return (
      TOPIC_MESSAGES[topicId] ?? [
        {
          id: "m_seed",
          topic_id: topicId,
          role: "system",
          at: new Date().toISOString(),
          body: "No messages yet. Start a conversation with your agents.",
        },
      ]
    );
  },
  async sendMessage(topicId: string, body: string, role: "user" | "assistant" | "system" = "user", agentId?: string): Promise<ChatMessage> {
    await wait(150);
    const m: ChatMessage = {
      id: `m_${Math.random().toString(36).slice(2)}`,
      topic_id: topicId,
      role: role === "assistant" ? "agent" : role,
      author: role === "user" ? "You" : agentId,
      at: new Date().toISOString(),
      body,
    };
    (TOPIC_MESSAGES[topicId] ??= []).push(m);
    return m;
  },
  async generate(input: { messages: Array<{ role: "user" | "assistant" | "system"; content: string }>; message?: string; system_prompt?: string; agent_id?: string; assistant_id?: string; use_skills?: boolean; }): Promise<string> {
    await wait(120);
    const agentName = input.agent_id ?? input.assistant_id ?? "0101";
    return `(${agentName}) I read your message and can help with that.`;
  },
};

export const settingsApi = {
  async getProfile(): Promise<import("./types").Profile> {
    await wait();
    return {
      id: "u_demo",
      email: "operator@0101.dev",
      display_name: "Sasha",
      full_name: "Sasha Mendel",
    };
  },
  async saveProfile(_p: Partial<import("./types").Profile>): Promise<void> {
    await wait(180);
    void _p;
  },
  async getProviders(): Promise<ProviderConfig[]> {
    await wait();
    return PROVIDERS;
  },
  async saveProvider(
    input: Omit<ProviderConfig, "id" | "created_at" | "updated_at" | "api_key_suffix"> & {
      api_key?: string;
      id?: string;
    },
  ): Promise<ProviderConfig> {
    await wait(220);
    const suffix = input.api_key ? input.api_key.slice(-4) : undefined;
    if (input.id) {
      const i = PROVIDERS.findIndex((p) => p.id === input.id);
      if (i >= 0) {
        PROVIDERS[i] = {
          ...PROVIDERS[i],
          ...input,
          api_key_suffix: suffix ?? PROVIDERS[i].api_key_suffix,
          updated_at: new Date().toISOString(),
        };
        return PROVIDERS[i];
      }
    }
    const p: ProviderConfig = {
      id: `pc_${Math.random().toString(36).slice(2, 6)}`,
      scope: input.scope,
      workspace_id: input.workspace_id,
      provider: input.provider,
      model: input.model,
      base_url: input.base_url,
      api_key_suffix: suffix,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    PROVIDERS.push(p);
    return p;
  },
  async deleteProvider(id: string): Promise<void> {
    await wait(150);
    const i = PROVIDERS.findIndex((p) => p.id === id);
    if (i >= 0) PROVIDERS.splice(i, 1);
  },
  async getSessions(): Promise<DeviceSession[]> {
    await wait();
    return SESSIONS;
  },
  async revokeSession(id: string): Promise<void> {
    await wait();
    const i = SESSIONS.findIndex((s) => s.id === id);
    if (i >= 0 && !SESSIONS[i].current) SESSIONS.splice(i, 1);
  },
};
