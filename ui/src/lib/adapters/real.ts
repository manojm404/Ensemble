/* eslint-disable @typescript-eslint/no-explicit-any */
import { authApi } from "./auth";
import type {
  Agent,
  Approval,
  AuditEvent,
  ChatMessage,
  ChatTopic,
  ChatGenerateInput,
  Company,
  CompanyOperations,
  CompanyTask,
  DashboardStats,
  DeviceSession,
  GeneratedWorkflow,
  Issue,
  MarketplacePack,
  NodeKind,
  NodeStatus,
  ProviderConfig,
  PreparedTaskRun,
  Run,
  RunEvent,
  RunNodeStatus,
  RunStatus,
  Team,
  TaskReportEmailResult,
  Workflow,
  WorkflowNode,
  WorkflowResult,
  WorkflowResultOutput,
  WorkflowStagePlan,
  WorkflowStatus,
  WorkflowSummary,
} from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE_URL ?? "";
const DIRECT_BACKEND_BASE = import.meta.env.VITE_DIRECT_API_URL ?? "http://127.0.0.1:8088";

const nowIso = () => new Date().toISOString();

function endpoint(path: string) {
  return `${API_BASE}${path}`;
}

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function formatApiErrorMessage(value: unknown, fallback: string) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const detail = (value as any).detail ?? (value as any).message ?? (value as any).error;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      const nested = (detail as any).message ?? (detail as any).error ?? (detail as any).detail;
      if (typeof nested === "string") return nested;
      try {
        return JSON.stringify(detail);
      } catch {
        /* fall through */
      }
    }
    try {
      return JSON.stringify(value);
    } catch {
      /* fall through */
    }
  }
  return fallback;
}

function shouldUseDirectFallback(err: unknown) {
  return err instanceof TypeError || (err instanceof ApiRequestError && err.status === 404);
}

function authHeaders() {
  const token = authApi.getToken();
  const user = authApi.getCachedUser();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(user?.id ? { "X-0101-User-Id": user.id } : {}),
    ...(user?.email ? { "X-0101-User-Email": user.email } : {}),
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await requestAt<T>(endpoint(path), init);
  } catch (err) {
    if (!shouldUseDirectFallback(err)) throw err;
    return requestAt<T>(`${DIRECT_BACKEND_BASE}${path}`, init);
  }
}

async function requestText(path: string, init: RequestInit = {}): Promise<string> {
  try {
    return await requestTextAt(endpoint(path), init);
  } catch (err) {
    if (!shouldUseDirectFallback(err)) throw err;
    return requestTextAt(`${DIRECT_BACKEND_BASE}${path}`, init);
  }
}

async function requestBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  try {
    return await requestBlobAt(endpoint(path), init);
  } catch (err) {
    if (!shouldUseDirectFallback(err)) throw err;
    return requestBlobAt(`${DIRECT_BACKEND_BASE}${path}`, init);
  }
}

async function requestAt<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed with ${res.status}`;
    try {
      const body = await res.json();
      message = formatApiErrorMessage(body, message);
    } catch {
      message = await res.text().catch(() => message);
    }
    throw new ApiRequestError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function requestTextAt(url: string, init: RequestInit = {}): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new ApiRequestError(await res.text().catch(() => ""), res.status);
  return res.text();
}

async function requestBlobAt(url: string, init: RequestInit = {}): Promise<Blob> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new ApiRequestError(await res.text().catch(() => ""), res.status);
  return res.blob();
}

function asArray<T = any>(raw: any, keys: string[] = []): T[] {
  if (Array.isArray(raw)) return raw as T[];
  for (const key of keys) {
    if (Array.isArray(raw?.[key])) return raw[key] as T[];
  }
  if (Array.isArray(raw?.data)) return raw.data as T[];
  if (Array.isArray(raw?.items)) return raw.items as T[];
  return [];
}

function normalizeStatus(raw: any): RunStatus {
  const value = String(raw ?? "").toLowerCase();
  if (["queued", "running", "failed", "cancelled", "awaiting_approval"].includes(value)) {
    return value as RunStatus;
  }
  if (["success", "succeeded", "completed", "passed", "pass"].includes(value)) return "succeeded";
  if (["approval", "pending_approval", "pending approval"].includes(value))
    return "awaiting_approval";
  return "queued";
}

function normalizeWorkflowStatus(raw: any): WorkflowStatus {
  const value = String(raw ?? "").toLowerCase();
  if (["draft", "active", "paused", "archived"].includes(value)) return value as WorkflowStatus;
  if (value === "idle") return "active";
  return "draft";
}

function graphFrom(raw: any): { nodes: WorkflowNode[]; edges: Array<[string, string]> } {
  const graphRaw =
    raw?.graph ??
    raw?.definition ??
    raw?.graph_json ??
    (Array.isArray(raw?.nodes) || Array.isArray(raw?.edges) ? raw : {});
  let graph = graphRaw;
  if (typeof graphRaw === "string") {
    try {
      graph = JSON.parse(graphRaw);
    } catch {
      graph = {};
    }
  }
  const rawNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const nodes: WorkflowNode[] = rawNodes.map((node: any, index: number) => {
    const data = node.data ?? {};
    const nodeType = String(node.kind ?? node.type ?? data.kind ?? data.type ?? "agent");
    const kind = nodeType === "agentNode" ? "agent" : nodeType;
    return {
      id: String(node.id ?? node.node_id ?? data.node_id ?? `node_${index + 1}`),
      kind: kind as NodeKind,
      label: String(
        data.label ??
          node.label ??
          node.name ??
          data.name ??
          data.requested_role ??
          `Agent ${index + 1}`,
      ),
      role: data.role ?? node.role ?? data.agent_id ?? node.agent_id ?? data.requested_role,
      config: node.config ?? data ?? {},
      x: node.x ?? node.position?.x ?? 80 + index * 180,
      y: node.y ?? node.position?.y ?? 160,
    };
  });
  const edges: Array<[string, string]> = Array.isArray(graph?.edges)
    ? graph.edges.map((edge: any) =>
        Array.isArray(edge)
          ? [String(edge[0]), String(edge[1])]
          : [String(edge.source), String(edge.target)],
      )
    : [];
  return { nodes, edges };
}

function normalizeStagePlan(raw: any): WorkflowStagePlan[] {
  const metadata = raw?.metadata ?? raw?.planner_metadata ?? {};
  return asArray<any>(metadata.stage_plan ?? raw?.stage_plan).map((stage, index) => ({
    stage: String(stage.stage ?? stage.name ?? `stage_${index + 1}`),
    agent_id: stage.agent_id,
    agent_name: stage.agent_name ?? stage.name,
    requested_role: stage.requested_role ?? stage.role,
    role: stage.role,
    selection_reason: stage.selection_reason ?? stage.reason,
    match_confidence:
      stage.match_confidence != null
        ? Number(stage.match_confidence)
        : stage.confidence != null
          ? Number(stage.confidence)
          : undefined,
    output_contract: stage.output_contract ?? stage.contract,
    required_capabilities: asArray<string>(stage.required_capabilities ?? stage.capabilities),
    capability_gaps: asArray<string>(stage.capability_gaps ?? stage.gaps),
    tools: asArray<string>(stage.tools),
    candidate_agents: asArray<string>(stage.candidate_agents),
    match_type: stage.match_type,
  }));
}

function mapGeneratedWorkflow(
  raw: any,
  input: { prompt: string; outputType: GeneratedWorkflow["output_type"] },
): GeneratedWorkflow {
  const workflow = raw?.workflow ?? raw;
  const { nodes, edges } = graphFrom(workflow);
  const metadata = {
    ...(workflow?.metadata ?? {}),
    ...(raw?.planner_metadata ? { planner_metadata: raw.planner_metadata } : {}),
  };
  const stagePlan = normalizeStagePlan(workflow);
  return {
    id: workflow?.id,
    name: (workflow?.name ?? workflow?.title ?? input.prompt.slice(0, 72)) || "Generated workflow",
    description: workflow?.description ?? input.prompt,
    prompt: input.prompt,
    output_type: input.outputType,
    nodes,
    edges,
    metadata: {
      ...metadata,
      stage_plan: stagePlan,
      domain: metadata.domain as string | undefined,
      domain_title: (metadata.domain_title ?? metadata.title) as string | undefined,
      routing_reason: (metadata.routing_reason ?? metadata.reason) as string | undefined,
    },
    raw,
  };
}

function mapWorkflowSummary(raw: any): WorkflowSummary {
  return {
    id: String(raw.id ?? raw.workflow_id),
    name: raw.name ?? raw.title ?? "Untitled workflow",
    status: normalizeWorkflowStatus(raw.status),
    updated_at: raw.updated_at ?? raw.created_at ?? nowIso(),
    runs: Number(raw.runs ?? raw.total_runs ?? 0),
    pass_rate: Number(raw.pass_rate ?? raw.eval_pass_rate ?? 0),
    company_name: raw.company_name ?? raw.company?.name ?? raw.companies?.name,
  };
}

function mapWorkflow(raw: any): Workflow {
  const summary = mapWorkflowSummary(raw);
  const { nodes, edges } = graphFrom(raw);
  return {
    ...summary,
    description: raw.description ?? raw.mission,
    version: Number(raw.version ?? 1),
    company_id: raw.company_id,
    company_name: summary.company_name,
    nodes,
    edges,
    contract: raw.contract ?? { input: {}, output: {} },
    stats: {
      runs: summary.runs,
      pass_rate: summary.pass_rate,
      last_run_at: raw.last_run_at ?? raw.lastRun,
    },
  };
}

function mapRun(raw: any): Run {
  const status = normalizeStatus(raw.status);
  const runId = String(raw.run_id ?? raw.id);
  const events: RunEvent[] = asArray(raw.events).map((event: any) => ({
    at: event.at ?? event.timestamp ?? nowIso(),
    kind: event.kind ?? event.type ?? event.action_type ?? "event",
    title: event.title ?? event.message ?? event.action ?? "Run event",
    node_id: event.node_id,
    detail: event.detail ?? event.details,
  }));
  const nodeStatusesRaw = raw.node_statuses ?? raw.nodes ?? {};
  const nodeStatuses = Array.isArray(nodeStatusesRaw)
    ? nodeStatusesRaw.map(
        (node: any, index: number): RunNodeStatus => ({
          node_id: String(node.node_id ?? node.id ?? `node_${index + 1}`),
          label: node.label ?? node.name ?? node.node_id ?? `Agent ${index + 1}`,
          role: node.role,
          status: (normalizeStatus(node.status) === "succeeded"
            ? "succeeded"
            : normalizeStatus(node.status) === "failed"
              ? "failed"
              : normalizeStatus(node.status) === "running"
                ? "running"
                : normalizeStatus(node.status) === "awaiting_approval"
                  ? "awaiting_approval"
                  : "pending") as NodeStatus,
          selection_reason: node.selection_reason,
          error: node.error,
          completed_at: node.completed_at ?? node.completedAt,
        }),
      )
    : (nodeStatusesRaw as Record<string, NodeStatus>);
  return {
    run_id: runId,
    workflow_id: String(raw.workflow_id ?? raw.workflowId ?? ""),
    workflow_name: raw.workflow_name ?? raw.workflowName ?? raw.name,
    status,
    started_at: raw.started_at ?? raw.created_at ?? raw.timestamp ?? nowIso(),
    finished_at: raw.finished_at ?? raw.completed_at,
    current_step: raw.current_step,
    current_node_label: raw.current_node_label ?? raw.last_agent_id,
    current_node_role: raw.current_node_role,
    node_statuses: nodeStatuses as Record<string, NodeStatus>,
    failed_node: raw.failed_node,
    failure_reason: raw.failure_reason ?? raw.error,
    output_markdown: raw.output_markdown ?? raw.output ?? raw.result_markdown,
    artifacts: asArray(raw.artifacts),
    evaluations: asArray(raw.evaluations),
    events,
    audit: raw.audit ?? { actor: raw.actor ?? "system", trace_id: raw.trace_id ?? runId },
    cost: raw.cost ?? { usd: Number(raw.cost_usd ?? 0) },
    duration_ms: raw.duration_ms,
  };
}

function mapArtifact(raw: any, index = 0): import("./types").Artifact {
  const path = String(raw.path ?? raw.url ?? raw.name ?? `artifact_${index + 1}`);
  return {
    id: String(raw.id ?? raw.sha256 ?? raw.hash ?? path),
    name: String(raw.name ?? path.split("/").pop() ?? `Artifact ${index + 1}`),
    path,
    size_bytes: Number(raw.size_bytes ?? raw.size ?? 0),
    mime: raw.mime ?? raw.content_type,
    sha256: raw.sha256 ?? raw.hash,
  };
}

function mapWorkflowResultOutput(raw: any, index = 0): WorkflowResultOutput {
  const output = raw.output ?? {};
  const files = asArray<any>(output.files ?? raw.files).map(mapArtifact);
  return {
    agent_id: raw.agent_id,
    node_id: String(raw.node_id ?? raw.agent_id ?? `node_${index + 1}`),
    label: raw.label ?? raw.agent_name ?? raw.agent_id ?? `Agent ${index + 1}`,
    role: raw.role ?? output.role,
    selection_reason: raw.selection_reason ?? output.selection_reason,
    completed_at: raw.completedAt ?? raw.completed_at ?? raw.timestamp,
    markdown: String(output.markdown ?? raw.markdown ?? raw.output_markdown ?? raw.content ?? ""),
    files,
    task: raw.task ?? output.task,
    package: raw.package ?? output.package,
  };
}

function mapWorkflowResult(raw: any): WorkflowResult {
  const outputs = asArray<any>(raw.outputs).map(mapWorkflowResultOutput);
  const latestRaw = raw.latest ?? outputs[0];
  const latest =
    latestRaw && "markdown" in latestRaw
      ? (latestRaw as WorkflowResultOutput)
      : latestRaw
        ? mapWorkflowResultOutput(latestRaw)
        : undefined;
  return {
    workflow_id: String(raw.workflow_id ?? ""),
    run_id: raw.run_id,
    outputs,
    latest,
    files: asArray<any>(raw.files ?? raw.artifacts).map(mapArtifact),
    package: raw.package,
    messages: asArray<any>(raw.messages).map((message) => ({
      at: message.at ?? message.timestamp ?? nowIso(),
      kind: message.kind ?? message.role ?? "message",
      title: message.title ?? message.content ?? message.body ?? "Message",
      node_id: message.node_id ?? message.agent_id,
      detail: message.detail,
    })),
    events: asArray<any>(raw.events).map((event) => ({
      at: event.at ?? event.timestamp ?? nowIso(),
      kind: event.kind ?? event.type ?? event.action_type ?? "event",
      title: event.title ?? event.message ?? event.action ?? "Run event",
      node_id: event.node_id,
      detail: event.detail ?? event.details,
    })),
    evaluations: asArray<any>(raw.evaluations),
  };
}

function mapCompany(raw: any): Company {
  const name = raw.name ?? "Untitled company";
  return {
    id: String(raw.id ?? raw.company_id),
    name,
    slug: raw.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    industry: raw.industry ?? raw.category,
    mission: raw.mission ?? raw.description,
    agents: Number(
      raw.agents ??
        raw.agent_count ??
        raw.teams?.reduce?.((sum: number, team: any) => sum + (team.agents?.length ?? 0), 0) ??
        0,
    ),
    teams: Number(
      raw.teams_count ?? (Array.isArray(raw.teams) ? raw.teams.length : raw.teams) ?? 0,
    ),
    runs_30d: Number(raw.runs_30d ?? 0),
    spend_30d: Number(raw.spend_30d ?? 0),
  };
}

function mapAgent(raw: any): Agent {
  return {
    id: String(raw.id ?? raw.agent_id ?? raw.name),
    name: raw.display_name ?? raw.name ?? raw.title ?? "Agent",
    role: raw.role ?? raw.category ?? "agent",
    status:
      raw.status === "fired"
        ? "fired"
        : raw.status === "disabled"
          ? "disabled"
          : raw.status === "running"
            ? "running"
            : raw.status === "paused"
              ? "paused"
              : raw.status === "waiting_approval"
                ? "waiting_approval"
                : raw.status === "idle"
                  ? "idle"
                  : "active",
    capabilities: raw.capabilities ?? raw.skills ?? [],
    description: raw.description ?? raw.instructions,
    skill_source: raw.skill_source ?? raw.skill_id ?? raw.source ?? raw.filepath,
    skill_id: raw.skill_id,
    team_id: raw.team_id,
    category: raw.category ?? raw.source,
    last_activity_at: raw.last_activity_at,
    fired_at: raw.fired_at,
  };
}

function mapCompanyTask(raw: any): CompanyTask {
  const report = raw.report ?? {};
  return {
    id: String(raw.id),
    company_id: String(raw.company_id ?? ""),
    title: raw.title ?? "CEO task",
    prompt: raw.prompt ?? raw.description ?? raw.title ?? "",
    status: raw.status ?? "draft",
    type: raw.type ?? raw.task_type ?? "one_time",
    department_id: raw.department_id ?? raw.team_id,
    agent_id: raw.agent_id ?? raw.assigned_agent_id,
    workflow_id: raw.workflow_id,
    run_id: raw.run_id,
    output_type: raw.output_type,
    report_recipient_email: raw.report_recipient_email ?? report.recipient_email,
    report_on_completion: Boolean(raw.report_on_completion ?? report.on_completion),
    report_sent_at: raw.report_sent_at ?? report.sent_at,
    report_delivery_status: raw.report_delivery_status ?? report.delivery_status,
    report_delivery_details: raw.report_delivery_details ?? report.delivery_details,
    report: {
      recipient_email: raw.report_recipient_email ?? report.recipient_email,
      on_completion: Boolean(raw.report_on_completion ?? report.on_completion),
      sent_at: raw.report_sent_at ?? report.sent_at,
      delivery_status: raw.report_delivery_status ?? report.delivery_status,
      delivery_details: raw.report_delivery_details ?? report.delivery_details,
    },
    route: raw.route ?? {
      selected_agents: [],
      missing_roles: [],
      route_quality: "draft",
      routing_reason: "",
    },
    schedule: raw.schedule ?? {},
    created_at: raw.created_at ?? nowIso(),
    updated_at: raw.updated_at ?? raw.created_at ?? nowIso(),
  };
}

export const dashboardApi = {
  async getStats(): Promise<DashboardStats> {
    const raw = await request<any>("/api/dashboard/stats");
    return {
      active_workflows: Number(raw.active_workflows ?? raw.total_workflows ?? 0),
      agents_deployed: Number(raw.total_agents ?? raw.agents_deployed ?? raw.agents_running ?? 0),
      agents_available: Number(raw.total_agents ?? raw.agents_available ?? 0),
      runs_24h: Number(raw.runs_24h ?? raw.tokens_today ?? 0),
      cost_24h_usd: Number(raw.cost_24h_usd ?? raw.monthly_cost ?? 0),
      pass_rate: Number(raw.pass_rate ?? 0),
      open_approvals: Number(raw.open_approvals ?? 0),
      attention_count: Number(raw.attention_count ?? 0),
    };
  },
  async getRecentWorkflows() {
    return asArray(await request<any>("/api/dashboard/workflows")).map(mapWorkflowSummary);
  },
  async getRecentRuns() {
    return asArray(await request<any>("/api/dashboard/pipeline-status"), ["runs", "pipelines"]).map(
      mapRun,
    );
  },
  async getActivity() {
    return asArray<any>(await request<any>("/api/dashboard/activity")).map((event) => ({
      id: String(event.id ?? event.timestamp ?? crypto.randomUUID()),
      at: event.at ?? event.timestamp ?? nowIso(),
      actor: event.actor ?? event.agent_id ?? "system",
      action: event.action ?? event.action_type ?? "activity",
      resource: event.message ?? event.resource ?? event.details ?? "",
      trace_id: event.trace_id,
      cost_usd: event.cost_usd,
    }));
  },
  async getAttention() {
    return (await this.getRecentRuns()).filter(
      (run) => run.status === "failed" || run.status === "awaiting_approval",
    );
  },
};

export const workflowApi = {
  async list(query?: string, statusFilter?: WorkflowStatus | "all"): Promise<WorkflowSummary[]> {
    const qs = query ? `?search=${encodeURIComponent(query)}` : "";
    let workflows = asArray(await request<any>(`/api/workflows${qs}`)).map(mapWorkflowSummary);
    if (statusFilter && statusFilter !== "all")
      workflows = workflows.filter((wf) => wf.status === statusFilter);
    return workflows;
  },
  async getById(id: string): Promise<Workflow> {
    return mapWorkflow(await request<any>(`/api/workflows/${encodeURIComponent(id)}`));
  },
  async generateWorkflow(
    prompt: string,
    agentCount: number,
    outputType: GeneratedWorkflow["output_type"] = "auto",
  ): Promise<GeneratedWorkflow> {
    const raw = await request<any>("/api/workflows/magicflow", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        agent_count: agentCount,
        output_type: outputType,
      }),
    });
    return mapGeneratedWorkflow(raw, { prompt, outputType });
  },
  async validateWorkflow(nodes: WorkflowNode[], edges: Array<[string, string]>) {
    return request<any>("/api/workflows/validate", {
      method: "POST",
      body: JSON.stringify({ nodes, edges }),
    });
  },
  async create(input: {
    name: string;
    description?: string;
    companyId?: string;
    nodes?: WorkflowNode[];
    edges?: Array<[string, string]>;
    metadata?: Record<string, unknown>;
    prompt?: string;
    outputType?: string;
  }): Promise<Workflow> {
    const result = await request<any>("/api/workflows", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        graph_json: JSON.stringify({
          nodes: input.nodes ?? [],
          edges: input.edges ?? [],
          description: input.description,
          company_id: input.companyId,
          metadata: input.metadata ?? {},
          prompt: input.prompt,
          output_type: input.outputType,
        }),
      }),
    });
    return this.getById(result.id);
  },
  async update(id: string, patch: Partial<Workflow>): Promise<void> {
    await request("/api/workflows", {
      method: "POST",
      body: JSON.stringify({
        id,
        name: patch.name ?? "Untitled workflow",
        graph_json: JSON.stringify({
          nodes: patch.nodes ?? [],
          edges: patch.edges ?? [],
          contract: patch.contract,
        }),
      }),
    });
  },
  async delete(id: string): Promise<void> {
    await request(`/api/workflows/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async run(
    id: string,
    options?: {
      taskId?: string;
      companyId?: string;
      initialInput?: string;
      graph?: { nodes?: any[]; edges?: any[]; metadata?: Record<string, unknown> };
    },
  ): Promise<{ run_id: string }> {
    const graph = options?.graph;
    const hasExplicitGraph =
      !!graph && ((Array.isArray(graph.nodes) && graph.nodes.length > 0) || (Array.isArray(graph.edges) && graph.edges.length > 0));
    const wf = hasExplicitGraph
      ? { nodes: graph?.nodes ?? [], edges: graph?.edges ?? [] }
      : await this.getById(id);
    const raw = await request<any>("/api/workflows/run", {
      method: "POST",
      body: JSON.stringify({
        id,
        workflow_id: id,
        nodes: wf.nodes,
        edges: wf.edges,
        graph: options?.graph
          ? {
              nodes: options.graph.nodes ?? [],
              edges: options.graph.edges ?? [],
              metadata: options.graph.metadata ?? {},
            }
          : undefined,
        metadata: options?.graph?.metadata,
        task_id: options?.taskId,
        company_id: options?.companyId,
        initialInput: options?.initialInput ?? "",
        input: {},
      }),
    });
    return { run_id: raw.run_id ?? raw.id };
  },
  async rerun(runId: string): Promise<{ run_id: string }> {
    const raw = await request<any>(`/api/runs/${encodeURIComponent(runId)}/fork`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    return { run_id: raw.new_run_id ?? raw.run_id ?? raw.id };
  },
  async listRuns(workflowId: string) {
    return (await dashboardApi.getRecentRuns()).filter(
      (run) => !workflowId || run.workflow_id === workflowId,
    );
  },
  async getRunStatus(runId: string) {
    const raw = await request<any>(`/api/runs/${encodeURIComponent(runId)}/status`);
    return { run_id: runId, status: normalizeStatus(raw.status) };
  },
  async getRunOutput(runId: string): Promise<Run> {
    const status = await request<any>(`/api/runs/${encodeURIComponent(runId)}/status`).catch(
      () => ({ run_id: runId }),
    );
    const events = await request<any>(`/api/runs/${encodeURIComponent(runId)}/events`).catch(
      () => [],
    );
    return mapRun({ ...status, run_id: runId, events: asArray(events) });
  },
  async getWorkflowResult(workflowId: string, runId?: string): Promise<WorkflowResult> {
    const qs = runId ? `?run_id=${encodeURIComponent(runId)}` : "";
    return mapWorkflowResult(
      await request<any>(`/api/workflows/${encodeURIComponent(workflowId)}/result${qs}`),
    );
  },
  async getWorkflowPreview(workflowId: string): Promise<string> {
    return requestText(`/api/workflows/${encodeURIComponent(workflowId)}/preview`);
  },
  async exportWorkflowPackage(workflowId: string): Promise<Blob> {
    return requestBlob(`/api/workflows/${encodeURIComponent(workflowId)}/export`);
  },
};

export const companyApi = {
  async list(): Promise<Company[]> {
    return asArray(await request<any>("/api/companies")).map(mapCompany);
  },
  async getById(id: string): Promise<Company> {
    return mapCompany(await request<any>(`/api/companies/${encodeURIComponent(id)}`));
  },
  async getOperations(companyId: string): Promise<CompanyOperations> {
    const raw = await request<any>(`/api/companies/${encodeURIComponent(companyId)}/operations`);
    return {
      company: {
        ...mapCompany(raw.company ?? raw),
        team_count: Number(raw.company?.team_count ?? raw.counts?.teams ?? raw.counts?.team_count ?? 0),
        agent_count: Number(
          raw.company?.agent_count ?? raw.counts?.agents ?? raw.counts?.agent_count ?? 0,
        ),
        issue_count: Number(
          raw.company?.issue_count ?? raw.counts?.open_issues ?? raw.counts?.issue_count ?? 0,
        ),
      },
      counts: {
        teams: Number(raw.counts?.teams ?? 0),
        agents: Number(raw.counts?.agents ?? 0),
        issues: {
          total: Number(raw.counts?.issues?.total ?? 0),
          queued: Number(raw.counts?.issues?.queued ?? 0),
          running: Number(raw.counts?.issues?.running ?? 0),
          completed: Number(raw.counts?.issues?.completed ?? 0),
          failed: Number(raw.counts?.issues?.failed ?? 0),
          blocked: Number(raw.counts?.issues?.blocked ?? 0),
        },
        workflows: {
          total: Number(raw.counts?.workflows?.total ?? 0),
          running: Number(raw.counts?.workflows?.running ?? 0),
          completed: Number(raw.counts?.workflows?.completed ?? 0),
          failed: Number(raw.counts?.workflows?.failed ?? 0),
          paused: Number(raw.counts?.workflows?.paused ?? 0),
        },
        open_issues: Number(raw.counts?.open_issues ?? 0),
        approvals_waiting: Number(raw.counts?.approvals_waiting ?? 0),
        blocked_items: Number(raw.counts?.blocked_items ?? 0),
        failed_runs: Number(raw.counts?.failed_runs ?? 0),
        agent_health: {
          idle: Number(raw.counts?.agent_health?.idle ?? 0),
          running: Number(raw.counts?.agent_health?.running ?? 0),
          paused: Number(raw.counts?.agent_health?.paused ?? 0),
        },
        evaluation_pass_rate: Number(raw.counts?.evaluation_pass_rate ?? 0),
        health_score: Number(raw.counts?.health_score ?? 0),
      },
      recent: {
        issues: asArray<any>(raw.recent?.issues).map(mapCompanyTask),
        activity: asArray<any>(raw.recent?.activity).map((event) => ({
          id: String(event.id ?? event.timestamp ?? crypto.randomUUID()),
          at: event.at ?? event.timestamp ?? event.created_at ?? nowIso(),
          actor: event.actor ?? event.agent_id ?? "system",
          action: event.action ?? event.action_type ?? "activity",
          resource: event.message ?? event.resource ?? event.details ?? "",
          trace_id: event.trace_id,
          cost_usd: event.cost_usd,
        })),
        runs: asArray<any>(raw.recent?.runs).map((run) => ({
          run_id: String(run.run_id ?? run.id ?? crypto.randomUUID()),
          workflow_id: run.workflow_id,
          status: String(run.status ?? "queued"),
          current_node: run.current_node,
          last_agent_id: run.last_agent_id,
          started_at: run.started_at,
          completed_at: run.completed_at,
        })),
        artifacts: asArray<any>(raw.recent?.artifacts).map((artifact) => ({
          issue_id: artifact.issue_id,
          title: artifact.title,
          workflow_id: artifact.workflow_id,
          run_id: artifact.run_id,
          artifact_hash: artifact.artifact_hash,
        })),
      },
      generated_at: raw.generated_at ?? nowIso(),
    };
  },
  async create(input: { name: string; industry?: string; mission?: string }): Promise<Company> {
    return mapCompany(
      await request<any>("/api/companies", { method: "POST", body: JSON.stringify(input) }),
    );
  },
  async getTeams(companyId: string): Promise<Team[]> {
    return asArray<any>(
      await request<any>(`/api/companies/${encodeURIComponent(companyId)}/departments`),
    ).map((team) => ({
      id: team.id ?? team.name,
      name: team.name,
      agents: Number(team.agents?.length ?? team.agents ?? 0),
      mission: team.description ?? team.mission,
      emoji: team.emoji,
    }));
  },
  async getAgents(companyId: string): Promise<Agent[]> {
    return asArray<any>(
      await request<any>(`/api/companies/${encodeURIComponent(companyId)}/agents`),
    ).map(mapAgent);
  },
  async hireAgent(
    companyId: string,
    input: {
      skill_id: string;
      skill_name?: string;
      team_id?: string;
      display_name?: string;
      role?: string;
      model_provider?: string;
      model_name?: string;
      tool_policy?: Record<string, unknown>;
    },
  ): Promise<Agent> {
    const companyPath = `/api/companies/${encodeURIComponent(companyId)}/agents`;
    const init = {
      method: "POST",
      body: JSON.stringify(input),
    };
    let raw: any;
    try {
      raw = await request<any>(`${companyPath}/hire`, init);
    } catch (err) {
      if (!(err instanceof ApiRequestError && err.status === 404)) throw err;
      raw = await request<any>(companyPath, init);
    }
    return mapAgent(raw);
  },
  async updateAgent(companyId: string, agentId: string, input: Partial<Agent>): Promise<Agent> {
    return mapAgent(
      await request<any>(
        `/api/companies/${encodeURIComponent(companyId)}/agents/${encodeURIComponent(agentId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      ),
    );
  },
  async fireAgent(companyId: string, agentId: string): Promise<Agent> {
    return mapAgent(
      await request<any>(
        `/api/companies/${encodeURIComponent(companyId)}/agents/${encodeURIComponent(agentId)}/fire`,
        { method: "POST", body: JSON.stringify({}) },
      ),
    );
  },
  async listTasks(companyId: string): Promise<CompanyTask[]> {
    return asArray<any>(
      await request<any>(`/api/companies/${encodeURIComponent(companyId)}/tasks`),
    ).map(mapCompanyTask);
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
    return mapCompanyTask(
      await request<any>(`/api/companies/${encodeURIComponent(companyId)}/tasks`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  },
  async getTask(companyId: string, taskId: string): Promise<CompanyTask> {
    return mapCompanyTask(
      await request<any>(
        `/api/companies/${encodeURIComponent(companyId)}/tasks/${encodeURIComponent(taskId)}`,
      ),
    );
  },
  async prepareTaskRun(companyId: string, taskId: string): Promise<PreparedTaskRun> {
    return request<PreparedTaskRun>(
      `/api/companies/${encodeURIComponent(companyId)}/tasks/${encodeURIComponent(taskId)}/run`,
      { method: "POST", body: JSON.stringify({ approved: true }) },
    );
  },
  async approveTask(companyId: string, taskId: string, note?: string): Promise<CompanyTask> {
    return mapCompanyTask(
      await request<any>(
        `/api/companies/${encodeURIComponent(companyId)}/tasks/${encodeURIComponent(taskId)}/approve`,
        { method: "POST", body: JSON.stringify({ note }) },
      ),
    );
  },
  async cancelTask(companyId: string, taskId: string, note?: string): Promise<CompanyTask> {
    return mapCompanyTask(
      await request<any>(
        `/api/companies/${encodeURIComponent(companyId)}/tasks/${encodeURIComponent(taskId)}/cancel`,
        { method: "POST", body: JSON.stringify({ note }) },
      ),
    );
  },
  async sendTaskReportEmail(
    companyId: string,
    taskId: string,
    recipientEmail?: string,
  ): Promise<TaskReportEmailResult> {
    return request<TaskReportEmailResult>(
      `/api/companies/${encodeURIComponent(companyId)}/tasks/${encodeURIComponent(taskId)}/report-email`,
      {
        method: "POST",
        body: JSON.stringify({ recipient_email: recipientEmail }),
      },
    );
  },
  async getIssues(companyId: string): Promise<Issue[]> {
    return (await this.listTasks(companyId)).map((issue) => ({
      id: String(issue.id ?? issue.title),
      title: issue.title ?? issue.summary ?? "Issue",
      severity: (issue as any).severity ?? "medium",
      status: issue.status ?? "open",
      owner: issue.agent_id,
      opened_at: issue.created_at ?? nowIso(),
      related_run_id: issue.run_id,
    }));
  },
  async getActivity(companyId: string): Promise<AuditEvent[]> {
    return asArray<any>(
      await request<any>(`/api/dashboard/activity?company_id=${encodeURIComponent(companyId)}`),
    ).map((event) => ({
      id: String(event.id ?? event.timestamp ?? crypto.randomUUID()),
      at: event.at ?? event.timestamp ?? nowIso(),
      actor: event.actor ?? event.agent_id ?? "system",
      action: event.action ?? event.action_type ?? "activity",
      resource: event.message ?? event.resource ?? event.details ?? "",
      trace_id: event.trace_id,
      cost_usd: event.cost_usd,
    }));
  },
  async getReports(companyId: string) {
    const stats = await dashboardApi.getStats();
    return [
      {
        id: `${companyId}-current`,
        title: "Current operating snapshot",
        period: "Current",
        pass_rate: stats.pass_rate,
        runs: stats.runs_24h,
        cost_usd: stats.cost_24h_usd,
      },
    ];
  },
};

export const agentApi = {
  async list(query?: string, category?: string): Promise<Agent[]> {
    let agents = asArray(await request<any>("/api/skills"), ["skills", "agents"]).map(mapAgent);
    if (category && category !== "All")
      agents = agents.filter((agent) => agent.category === category);
    if (query)
      agents = agents.filter((agent) =>
        `${agent.name} ${agent.role}`.toLowerCase().includes(query.toLowerCase()),
      );
    return agents;
  },
  async getById(id: string): Promise<Agent | undefined> {
    return (await this.list()).find((agent) => agent.id === id);
  },
  async categories(): Promise<string[]> {
    return [
      "All",
      ...Array.from(
        new Set((await this.list()).map((agent) => agent.category).filter(Boolean) as string[]),
      ),
    ];
  },
};

export const approvalApi = {
  async listPending(): Promise<Approval[]> {
    return asArray<any>(await request<any>("/governance/pending")).map((item) => ({
      id: String(item.id ?? item.approval_id),
      run_id: String(item.run_id ?? item.execution_id ?? item.approval_id),
      workflow_name: item.workflow_name ?? item.workflow ?? "Workflow approval",
      requested_at: item.requested_at ?? item.created_at ?? nowIso(),
      requested_by: item.requested_by ?? item.agent_id ?? "system",
      risk: item.risk ?? "medium",
      summary: item.summary ?? item.action ?? "Approval requested",
      context: item.context ?? item.details ?? "",
      cost_usd: item.cost_usd,
    }));
  },
  async getById(id: string): Promise<Approval | undefined> {
    return (await this.listPending()).find((approval) => approval.id === id);
  },
  async approve(id: string): Promise<void> {
    await request(`/governance/decision/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({ approved: true }),
    });
  },
  async reject(id: string, reason?: string): Promise<void> {
    await request(`/governance/decision/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({ approved: false, reason }),
    });
  },
};

export const marketplaceApi = {
  async listPacks(query?: string, category?: string): Promise<MarketplacePack[]> {
    let packs = asArray<any>(await request<any>("/api/marketplace/packs"), ["packs"]).map(
      (pack) => ({
        id: String(pack.id ?? pack.pack_id ?? pack.name),
        name: pack.name,
        version: pack.version ?? "1.0.0",
        agents: Number(pack.agents ?? pack.agent_count ?? pack.skills?.length ?? 0),
        category: pack.category ?? "General",
        description: pack.description ?? "",
        installed: Boolean(pack.installed),
      }),
    );
    if (category && category !== "All") packs = packs.filter((pack) => pack.category === category);
    if (query)
      packs = packs.filter((pack) => pack.name.toLowerCase().includes(query.toLowerCase()));
    return packs;
  },
  async install(id: string): Promise<void> {
    await request("/api/marketplace/install", {
      method: "POST",
      body: JSON.stringify({ pack_id: id }),
    });
  },
  async categories(): Promise<string[]> {
    return ["All", ...Array.from(new Set((await this.listPacks()).map((pack) => pack.category)))];
  },
};

export const auditApi = {
  async list(): Promise<AuditEvent[]> {
    return asArray<any>(await request<any>("/audit/events"), ["events"]).map((event) => ({
      id: String(event.id ?? event.timestamp ?? crypto.randomUUID()),
      at: event.at ?? event.timestamp ?? nowIso(),
      actor: event.actor ?? event.agent_id ?? "system",
      action: event.action ?? event.action_type ?? "event",
      resource: event.resource ?? event.details ?? "",
      trace_id: event.trace_id,
      cost_usd: event.cost_usd,
    }));
  },
};

export const chatApi = {
  async listTopics(): Promise<ChatTopic[]> {
    return asArray<any>(await request<any>("/api/chat/topics")).map((topic) => ({
      id: String(topic.id),
      title: topic.title ?? "Untitled topic",
      updated_at: topic.updated_at ?? topic.created_at ?? nowIso(),
      unread: topic.unread,
      assistant_id: topic.assistant_id ?? topic.assistantId,
    }));
  },
  async getMessages(topicId: string): Promise<ChatMessage[]> {
    return asArray<any>(
      await request<any>(`/api/chat/messages/${encodeURIComponent(topicId)}`),
    ).map((message) => ({
      id: String(message.id),
      topic_id: topicId,
      role: message.role === "assistant" ? "agent" : message.role,
      author: message.agent_id,
      at: message.at ?? message.timestamp ?? nowIso(),
      body: message.body ?? message.content ?? "",
    }));
  },
  async createTopic(input: { title: string; assistant_id?: string }): Promise<ChatTopic> {
    const topic = await request<any>("/api/chat/topics", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return {
      id: String(topic.id),
      title: topic.title ?? input.title,
      updated_at: topic.updated_at ?? topic.created_at ?? nowIso(),
    };
  },
  async deleteTopic(topicId: string): Promise<void> {
    await request(`/api/chat/topics/${encodeURIComponent(topicId)}`, { method: "DELETE" });
  },
  async sendMessage(
    topicId: string,
    body: string,
    role: "user" | "assistant" | "system" = "user",
    agentId?: string,
  ): Promise<ChatMessage> {
    const saved = await request<any>("/api/chat/messages", {
      method: "POST",
      body: JSON.stringify({ topic_id: topicId, role, content: body, agent_id: agentId }),
    });
    return {
      id: String(saved.id ?? crypto.randomUUID()),
      topic_id: topicId,
      role: role === "assistant" ? "agent" : role,
      author: role === "user" ? "You" : agentId,
      at: saved.timestamp ?? nowIso(),
      body,
    };
  },
  async generate(input: ChatGenerateInput): Promise<string> {
    const raw = await request<any>("/api/chat/generate", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return String(raw.text ?? raw.content ?? raw.message ?? raw.response ?? "");
  },
};

function providerConfigFrom(raw: any): ProviderConfig {
  const config = raw.config ?? raw.settings ?? raw;
  return {
    id: String(config.id ?? config.provider ?? "active-provider"),
    scope: "account",
    provider: config.provider ?? "gemini",
    model: config.model ?? "",
    api_key_suffix: config.api_key_suffix ?? config.key_suffix,
    base_url: config.base_url,
    created_at: config.created_at ?? nowIso(),
    updated_at: config.updated_at ?? nowIso(),
  };
}

export const settingsApi = {
  async getProfile() {
    const session = await authApi.getSession();
    if (!session) throw new Error("Authentication required");
    return session.user;
  },
  async saveProfile(_p: Partial<import("./types").Profile>): Promise<void> {
    await request("/api/settings", { method: "PUT", body: JSON.stringify({ profile: _p }) });
  },
  async getProviders(): Promise<ProviderConfig[]> {
    const provider = await request<any>("/api/settings/provider").then(providerConfigFrom);
    const keys = await request<any>("/api/settings/api-keys").catch(() => ({ keys: [] }));
    const keyConfigs = asArray<any>(keys, ["keys"]).map((key) => ({
      ...provider,
      id: String(key.id),
      provider: key.provider,
      api_key_suffix: key.key_suffix,
      created_at: key.created_at ?? provider.created_at,
      updated_at: key.last_used_at ?? provider.updated_at,
    }));
    return keyConfigs.length ? keyConfigs : [provider];
  },
  async saveProvider(
    input: Omit<ProviderConfig, "id" | "created_at" | "updated_at" | "api_key_suffix"> & {
      api_key?: string;
      id?: string;
    },
  ): Promise<ProviderConfig> {
    await request("/api/settings/provider", {
      method: "POST",
      body: JSON.stringify({
        provider: input.provider,
        model: input.model,
        base_url: input.base_url,
      }),
    });
    if (input.api_key) {
      await request("/api/settings/api-keys", {
        method: "POST",
        body: JSON.stringify({ provider: input.provider, api_key: input.api_key }),
      });
    }
    return providerConfigFrom({
      ...input,
      id: input.id ?? input.provider,
      api_key_suffix: input.api_key?.slice(-6),
    });
  },
  async deleteProvider(id: string): Promise<void> {
    await request(`/api/settings/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async getSessions(): Promise<DeviceSession[]> {
    return [{ id: "current", device: navigator.userAgent, last_active: nowIso(), current: true }];
  },
  async revokeSession(_id: string): Promise<void> {},
};
