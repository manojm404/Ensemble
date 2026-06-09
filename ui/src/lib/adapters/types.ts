/**
 * Shared type contracts for the 0101 frontend.
 * Backend team: these are the wire shapes the UI assumes — keep your
 * responses isomorphic to these and you can swap mock.ts for real impl.
 */

export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "awaiting_approval";

export type NodeStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "awaiting_approval";

export type WorkflowStatus = "draft" | "active" | "paused" | "archived";
export type NodeKind = "planner" | "agent" | "tool" | "eval" | "approval" | "sink" | "source";

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  resource: string;
  trace_id?: string;
  cost_usd?: number;
}

export interface Artifact {
  id: string;
  name: string;
  path: string;
  size_bytes: number;
  mime?: string;
  sha256?: string;
}

export interface Evaluation {
  id: string;
  name: string;
  status: "pass" | "fail" | "warn";
  score?: number;
  detail?: string;
}

export interface RunEvent {
  at: string;
  kind: string;
  title: string;
  node_id?: string;
  detail?: string;
}

export interface RunNodeStatus {
  node_id: string;
  label: string;
  role?: string;
  status: NodeStatus;
  selection_reason?: string;
  error?: string;
  completed_at?: string;
}

export interface Run {
  run_id: string;
  workflow_id: string;
  workflow_name?: string;
  status: RunStatus;
  started_at: string;
  finished_at?: string;
  current_step?: number;
  current_node_label?: string;
  current_node_role?: string;
  node_statuses: Record<string, NodeStatus> | RunNodeStatus[];
  failed_node?: { id: string; label: string; role: string };
  failure_reason?: string;
  output_markdown?: string;
  artifacts: Artifact[];
  evaluations: Evaluation[];
  events: RunEvent[];
  audit: { actor: string; trace_id: string };
  cost?: { usd: number; tokens_in?: number; tokens_out?: number };
  duration_ms?: number;
}

export interface WorkflowNode {
  id: string;
  kind: NodeKind;
  label: string;
  role?: string;
  config?: Record<string, unknown>;
  /** Optional canvas placement, in editor pixel units. */
  x?: number;
  y?: number;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  version: number;
  updated_at: string;
  company_id?: string;
  company_name?: string;
  nodes: WorkflowNode[];
  edges: Array<[string, string]>;
  contract: { input: Record<string, unknown>; output: Record<string, unknown> };
  stats: { runs: number; pass_rate: number; last_run_at?: string };
}

export interface WorkflowStagePlan {
  stage: string;
  agent_id?: string;
  company_agent_id?: string;
  agent_name?: string;
  requested_role?: string;
  role?: string;
  selection_reason?: string;
  match_confidence?: number;
  output_contract?: string;
  required_capabilities?: string[];
  capability_gaps?: string[];
  tools?: string[];
  candidate_agents?: string[];
  match_type?: string;
}

export interface GeneratedWorkflow {
  id?: string;
  name: string;
  description?: string;
  prompt: string;
  output_type: "auto" | "web" | "document" | "research";
  nodes: WorkflowNode[];
  edges: Array<[string, string]>;
  metadata: {
    domain?: string;
    domain_title?: string;
    routing_reason?: string;
    stage_plan?: WorkflowStagePlan[];
    [key: string]: unknown;
  };
  raw?: unknown;
}

export interface WorkflowResultOutput {
  agent_id?: string;
  node_id: string;
  label: string;
  role?: string;
  selection_reason?: string;
  completed_at?: string;
  markdown: string;
  files: Artifact[];
  task?: string;
  package?: Record<string, unknown>;
}

export interface WorkflowResult {
  workflow_id: string;
  run_id?: string;
  outputs: WorkflowResultOutput[];
  latest?: WorkflowResultOutput;
  files: Artifact[];
  package?: {
    package_type?: string;
    primary_artifact?: string;
    artifact_count?: number;
    has_preview?: boolean;
    artifact_paths?: string[];
    [key: string]: unknown;
  };
  messages: RunEvent[];
  events: RunEvent[];
  evaluations: Evaluation[];
}

export interface WorkflowSummary {
  id: string;
  name: string;
  status: WorkflowStatus;
  updated_at: string;
  runs: number;
  pass_rate: number;
  company_name?: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  industry?: string;
  mission?: string;
  agents: number;
  teams: number;
  runs_30d: number;
  spend_30d: number;
}

export interface CompanyOperations {
  company: Company & {
    team_count: number;
    agent_count: number;
    issue_count: number;
  };
  counts: {
    teams: number;
    agents: number;
    issues: { total: number; queued: number; running: number; completed: number; failed: number; blocked: number };
    workflows: { total: number; running: number; completed: number; failed: number; paused: number };
    open_issues: number;
    approvals_waiting: number;
    blocked_items: number;
    failed_runs: number;
    agent_health: { idle: number; running: number; paused: number };
    evaluation_pass_rate: number;
    health_score: number;
  };
  recent: {
    issues: CompanyTask[];
    activity: AuditEvent[];
    runs: Array<{
      run_id: string;
      workflow_id?: string;
      status: string;
      current_node?: string;
      last_agent_id?: string;
      started_at?: string;
      completed_at?: string;
    }>;
    artifacts: Array<{
      issue_id?: string;
      title?: string;
      workflow_id?: string;
      run_id?: string;
      artifact_hash?: string;
    }>;
  };
  generated_at: string;
}

export interface Team {
  id: string;
  name: string;
  agents: number;
  mission?: string;
  emoji?: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: "active" | "idle" | "disabled" | "running" | "paused" | "waiting_approval" | "fired";
  capabilities: string[];
  description?: string;
  skill_source?: string;
  skill_id?: string;
  team_id?: string;
  category?: string;
  last_activity_at?: string;
  fired_at?: string;
}

export interface CompanyTaskRoute {
  selected_agents: WorkflowStagePlan[];
  missing_roles: Array<{ role: string; reason: string }>;
  route_quality: "ready" | "needs_hiring" | string;
  routing_reason: string;
}

export interface CompanyTask {
  id: string;
  company_id: string;
  title: string;
  prompt: string;
  status: string;
  type: "one_time" | "workflow" | string;
  department_id?: string;
  agent_id?: string;
  workflow_id?: string;
  run_id?: string;
  output_type?: string;
  report_recipient_email?: string;
  report_on_completion?: boolean;
  report_sent_at?: string;
  report_delivery_status?: "sent" | "logged" | "failed" | string;
  report_delivery_details?: string;
  report?: {
    recipient_email?: string;
    on_completion?: boolean;
    sent_at?: string;
    delivery_status?: "sent" | "logged" | "failed" | string;
    delivery_details?: string;
  };
  route: CompanyTaskRoute;
  schedule: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PreparedTaskRun {
  task_id: string;
  workflow_id: string;
  graph: { nodes: unknown[]; edges: unknown[]; metadata?: Record<string, unknown> };
  initial_input: string;
  approved: boolean;
}

export interface TaskReportEmailResult {
  task_id: string;
  recipient_email: string;
  delivery_status: "sent" | "logged" | "failed" | string;
  delivery_details?: string;
  report_markdown?: string;
  sent_at?: string;
}

export interface Approval {
  id: string;
  run_id: string;
  workflow_name: string;
  requested_at: string;
  requested_by: string;
  risk: "low" | "medium" | "high";
  summary: string;
  context: string;
  cost_usd?: number;
}

export interface Issue {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "acknowledged" | "resolved";
  owner?: string;
  opened_at: string;
  related_run_id?: string;
}

export interface MarketplacePack {
  id: string;
  name: string;
  version: string;
  agents: number;
  category: string;
  description: string;
  installed?: boolean;
}

export interface DashboardStats {
  active_workflows: number;
  agents_deployed: number;
  agents_available: number;
  runs_24h: number;
  cost_24h_usd: number;
  pass_rate: number;
  open_approvals: number;
  attention_count: number;
}

export interface ProviderConfig {
  id: string;
  scope: "account" | "workspace";
  workspace_id?: string;
  provider: string;
  model: string;
  api_key_suffix?: string;
  base_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  display_name?: string;
  full_name?: string;
  avatar_url?: string;
}

export interface SessionInfo {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: Profile;
}

export interface DeviceSession {
  id: string;
  device: string;
  last_active: string;
  current: boolean;
}

export interface ChatTopic {
  id: string;
  title: string;
  updated_at: string;
  unread?: number;
  assistant_id?: string;
}

export interface ChatMessage {
  id: string;
  topic_id: string;
  role: "user" | "agent" | "assistant" | "system";
  author?: string;
  at: string;
  body: string;
}

export interface ChatGenerateInput {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  message?: string;
  system_prompt?: string;
  agent_id?: string;
  assistant_id?: string;
  use_skills?: boolean;
}
