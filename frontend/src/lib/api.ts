/**
 * API Client functions.
 */

export const API_BASE_URL = 'http://127.0.0.1:8088';
export const WS_BASE_URL = 'ws://127.0.0.1:8088';

/**
 * Check if the current access token is expired or about to expire (within 5 min).
 * If so, try to refresh it using the stored refresh token.
 * Returns true if the token is valid or was successfully refreshed.
 * Returns false and clears tokens if refresh failed.
 */
async function ensureValidToken(): Promise<boolean> {
  const expiresAt = localStorage.getItem('ensemble_token_expires_at');
  const refreshToken = localStorage.getItem('ensemble_refresh_token');

  // No token stored — not logged in
  if (!localStorage.getItem('ensemble_auth_token')) {
    return false;
  }

  // Check if token is expiring within the next 5 minutes
  const now = Date.now();
  const expiryMargin = 5 * 60 * 1000; // 5 minutes
  if (expiresAt && parseInt(expiresAt) - now > expiryMargin) {
    return true; // Token still valid
  }

  // Token is expired or expiring — try to refresh
  if (!refreshToken) {
    clearAuthTokens();
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      clearAuthTokens();
      return false;
    }

    const data = await response.json();
    if (data.token) {
      localStorage.setItem('ensemble_auth_token', data.token);
      if (data.refresh_token) localStorage.setItem('ensemble_refresh_token', data.refresh_token);
      if (data.expires_in) {
        const expiresAt = Date.now() + (data.expires_in * 1000);
        localStorage.setItem('ensemble_token_expires_at', expiresAt.toString());
      }
      return true;
    }

    clearAuthTokens();
    return false;
  } catch {
    clearAuthTokens();
    return false;
  }
}

function clearAuthTokens() {
  localStorage.removeItem('ensemble_auth_token');
  localStorage.removeItem('ensemble_refresh_token');
  localStorage.removeItem('ensemble_token_expires_at');
}

export async function fetchApi(endpoint: string, options: RequestInit = {}, silent = false) {
  // Try to ensure we have a valid token before making the request
  await ensureValidToken();

  const token = localStorage.getItem('ensemble_auth_token');
  const headers: HeadersInit = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
  if (!response.ok) {
    if (response.status === 401) {
      // Token is invalid even after refresh attempt
      if (!silent) {
        if (window.location.pathname !== '/auth') {
          console.warn(`API request to ${endpoint} returned 401 — redirecting to login`);
          localStorage.setItem('ensemble_auth_redirect', window.location.pathname);
          clearAuthTokens();
          window.location.href = '/auth';
        }
      }
      throw new Error('Authentication required. Please log in.');
    }
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail || `API request failed: ${response.statusText}`);
  }
  return response.json();
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: string;
  enabled: boolean;
  is_native: boolean;
  namespace?: string;
  pack_id?: string;
  tags?: string[];
  version?: string;
}

export interface WorkflowData {
  id: string;
  name: string;
  graph_json: string;
}

export async function getAgents(): Promise<AgentSkill[]> {
  try {
    const data = await fetchApi('/api/skills');
    if (data && Array.isArray(data)) {
      return data.map((d: any) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        emoji: d.emoji || "🤖",
        category: d.category || "General",
        enabled: d.enabled ?? true,
        is_native: d.is_native ?? false,
        namespace: d.namespace,
        pack_id: d.pack_id,
        tags: d.tags || [],
        version: d.version || "1.0.0"
      }));
    }
  } catch (e) {
    console.warn("Failed to fetch skills, returning empty list", e);
  }
  return [];
}

/**
 * Fetch a single workflow by ID.
 */
export async function getWorkflow(id: string): Promise<WorkflowData> {
  const result = await fetchApi(`/api/workflows/${id}`);
  return { 
    id: result.id, 
    name: result.name, 
    graph_json: typeof result.graph === 'string' ? result.graph : JSON.stringify(result.graph || {}) 
  };
}

/**
 * Delete a workflow.
 */
export async function deleteWorkflow(id: string): Promise<void> {
  return await fetchApi(`/api/workflows/${id}`, { method: 'DELETE' });
}

/**
 * Save or update a workflow.
 */
export async function saveWorkflow(
  name: string,
  graphJson: string,
  existingId?: string
): Promise<{ id: string }> {
  return await fetchApi('/api/workflows', {
    method: 'POST',
    body: JSON.stringify({
      id: existingId,
      name,
      graph_json: graphJson
    })
  });
}

/**
 * Run a Standard Operating Procedure.
 */
export async function runSOP(params: {
  sop_path?: string;
  yaml?: string;
  provider?: string;
  model?: string;
  assistant_id?: string;
  topic_id?: string;
  input?: string;
}): Promise<{ status: string; run_id: string }> {
  return await fetchApi('/sop/run', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

export async function getWorkspaceTree() {
  try {
    return await fetchApi('/api/workspace/tree');
  } catch (e) {
    console.warn("Failed to fetch workspace tree:", e);
    return [];
  }
}

export async function getPendingApprovals() {
  try {
    return await fetchApi('/api/governance/pending');
  } catch (e) {
    console.warn("Approvals API not ready yet", e);
    return [];
  }
}

export async function submitApproval(id: string, decision: 'APPROVE' | 'REJECT', feedback?: string) {
  return await fetchApi('/api/governance/decision', {
    method: 'POST',
    body: JSON.stringify({ pending_id: id, decision, feedback })
  });
}


// --- MOCKED / NEW SETTINGS ENDPOINTS ---

export async function getMCPServers() {
  try { return await fetchApi('/api/settings/mcp-servers'); }
  catch (e) { return []; }
}
export async function saveMCPServers(servers: any) {
  try { return await fetchApi('/api/settings/mcp-servers', { method: 'POST', body: JSON.stringify(servers) }); }
  catch (e) { return { status: 'error' }; }
}

export async function getMemories() {
  try { return await fetchApi('/api/settings/memories'); }
  catch (e) { return []; }
}
export async function saveMemories(memories: any) {
  try { return await fetchApi('/api/settings/memories', { method: 'POST', body: JSON.stringify(memories) }); }
  catch (e) { return { status: 'error' }; }
}

export async function getRegularPhrases() {
  try { return await fetchApi('/api/settings/phrases'); }
  catch (e) { return []; }
}
export async function saveRegularPhrases(phrases: any) {
  try { return await fetchApi('/api/settings/phrases', { method: 'POST', body: JSON.stringify(phrases) }); }
  catch (e) { return { status: 'error' }; }
}


export async function generateWorkflowAPI(prompt: string) {
  return await fetchApi('/api/workflows/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt })
  });
}

export async function deleteTopic(id: string) {
  return await fetchApi(`/api/chat/topics/${id}`, {
    method: 'DELETE'
  });
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  capabilities: string[];
}

export async function getModels(): Promise<ModelInfo[]> {
  try { return await fetchApi('/api/models'); }
  catch (e) { return []; }
}

export async function generateChatResponse(params: {
  messages: { role: string; content: string }[];
  model?: string;
  provider?: string;
  base_url?: string;
  api_key?: string;
  agent_id?: string;
  assistant_id?: string;
}): Promise<{ text: string; usage?: any }> {
  return await fetchApi('/api/chat/generate', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

export async function syncRegistry(): Promise<{ agents: AgentSkill[] }> {
  return await fetchApi('/api/registry/sync');
}

export async function toggleAgentStatus(id: string, enabled: boolean): Promise<any> {
    return await fetchApi(`/api/registry/agents/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled })
    });
}

export async function importExternalRepo(url: string): Promise<any> {
    return await fetchApi('/api/registry/import', {
        method: 'POST',
        body: JSON.stringify({ url })
    });
}

export async function deleteAgent(id: string): Promise<any> {
    return await fetchApi(`/api/registry/agents/${id}`, {
        method: 'DELETE'
    });
}

export async function forkAgent(id: string): Promise<any> {
    return await fetchApi(`/api/registry/agents/${id}/fork`, {
        method: 'POST'
    });
}

// --- 🛒 Marketplace API ---

export interface MarketplacePack {
  id: string;
  name: string;
  description: string;
  emoji: string;
  version: string;
  author: string;
  download_url: string;
  agent_files: string[];
  source?: string;  // NEW: Pack source (local, github, etc.)
  repo?: string;    // NEW: GitHub repository
}

export interface ConflictInfo {
  exact_matches: {
    file: string;
    existing_agents: {
      id: string;
      name: string;
      namespace: string;
    }[];
  }[];
  similar_agents: {
    new_name: string;
    existing_id: string;
    existing_name: string;
    similarity: number;
    recommendation: string;
  }[];
}

export interface InstallResult {
  status: 'success' | 'conflict';
  pack_id?: string;
  message?: string;
  installed_count?: number;
  skipped_count?: number;
  similar_agents_found?: number;
  conflicts?: ConflictInfo;
  resolution_options?: string[];
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: string;
  enabled: boolean;
  is_native: boolean;
  namespace?: string;  // NEW: Agent namespace
  pack_id?: string;    // NEW: Pack membership
  tags?: string[];     // NEW: Semantic tags
  version?: string;    // NEW: Agent version
}

export interface AgentStats {
  agent_id: string;
  usage_count: number;
  total_cost: number;
  last_used: string | null;
}

export async function getMarketplacePacks(): Promise<MarketplacePack[]> {
  const res = await fetchApi('/api/marketplace/packs');
  return res.packs || [];
}

export async function installPack(pack_id: string, download_url: string, version: string, conflict_action?: string): Promise<InstallResult> {
  return await fetchApi('/api/marketplace/install', {
    method: 'POST',
    body: JSON.stringify({ pack_id, download_url, version, conflict_action: conflict_action || 'prompt' })
  });
}

export async function uninstallPack(pack_id: string): Promise<any> {
  return await fetchApi('/api/marketplace/uninstall', {
    method: 'POST',
    body: JSON.stringify({ pack_id })
  });
}

export async function getInstalledPacks(): Promise<Array<{pack_id: string, agent_count: number, installed_at: string, source: string}>> {
  const res = await fetchApi('/api/marketplace/installed');
  return res.installed_packs || [];
}

export async function updatePack(pack_id: string): Promise<any> {
  return await fetchApi(`/api/marketplace/update/${pack_id}`, {
    method: 'POST'
  });
}

export async function rollbackPack(pack_id: string, version: string): Promise<any> {
  return await fetchApi(`/api/marketplace/rollback/${pack_id}`, {
    method: 'POST',
    body: JSON.stringify({ version })
  });
}

export async function getAgentStats(): Promise<AgentStats[]> {
  const res = await fetchApi('/api/agents/stats');
  return res.stats || [];
}

export async function exportAgent(agent_id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/marketplace/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id })
  });
  if (!response.ok) throw new Error("Export failed.");
  
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${agent_id}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function exportPack(pack_id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/marketplace/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pack_id })
    });
    if (!response.ok) throw new Error("Export failed.");

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pack_id}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

// --- Dashboard API ---

export interface DashboardStats {
  active_workflows: number;
  agents_running: number;
  tokens_today: number;
  monthly_cost: number;
  total_workflows: number;
  total_agents: number;
  execution_stats: Record<string, number>;
}

export interface DashboardWorkflow {
  id: string;
  name: string;
  agents: number;
  runs: number;
  status: "active" | "idle";
  lastRun: string;
}

export interface DashboardActivity {
  agent_id: string;
  action_type: string;
  details: Record<string, any>;
  timestamp: string;
  message: string;
}

export interface TokenUsageDay {
  day: string;
  date: string;
  tokens: number;
}

export interface AgentStat {
  rank: number;
  agent_id: string;
  name: string;
  emoji: string;
  category: string;
  runs: number;
  cost: number;
}

export interface PipelineStatus {
  id: string;
  workflow_id: string;
  name: string;
  status: string;
  current_step: string;
  current_step_index: number;
  total_steps: number;
  started_at: string;
  time: string;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    return await fetchApi('/api/dashboard/stats');
  } catch (e) {
    console.warn("Dashboard stats API not ready", e);
    return {
      active_workflows: 0, agents_running: 0, tokens_today: 0,
      monthly_cost: 0, total_workflows: 0, total_agents: 0, execution_stats: {}
    };
  }
}

export async function getDashboardWorkflows(): Promise<DashboardWorkflow[]> {
  try {
    return await fetchApi('/api/dashboard/workflows');
  } catch (e) {
    console.warn("Dashboard workflows API not ready", e);
    return [];
  }
}

export async function getDashboardActivity(limit = 20): Promise<DashboardActivity[]> {
  try {
    return await fetchApi(`/api/dashboard/activity?limit=${limit}`);
  } catch (e) {
    console.warn("Dashboard activity API not ready", e);
    return [];
  }
}

export async function getTokenUsage(days = 7): Promise<TokenUsageDay[]> {
  try {
    return await fetchApi(`/api/dashboard/token-usage?days=${days}`);
  } catch (e) {
    console.warn("Token usage API not ready", e);
    return [];
  }
}

export async function getDashboardAgentStats(): Promise<AgentStat[]> {
  try {
    return await fetchApi('/api/dashboard/agent-stats');
  } catch (e) {
    console.warn("Agent stats API not ready", e);
    return [];
  }
}

export async function getPipelineStatus(): Promise<PipelineStatus[]> {
  try {
    return await fetchApi('/api/dashboard/pipeline-status');
  } catch (e) {
    console.warn("Pipeline status API not ready", e);
    return [];
  }
}

// 🆕 Namespace & Pack Agent Endpoints
export interface NamespaceStats {
  [namespace: string]: number;
}

export interface NamespaceStatsResponse {
  stats: NamespaceStats;
  total_agents: number;
}

export interface PackAgentsResponse {
  pack_id: string;
  agent_count: number;
  agents: AgentSkill[];
}

export async function getNamespaceStats(): Promise<NamespaceStatsResponse> {
  return await fetchApi('/api/agents/namespace-stats');
}

export async function getPackAgents(pack_id: string): Promise<PackAgentsResponse> {
  return await fetchApi(`/api/marketplace/packs/${pack_id}/agents`);
}

// 🆕 Universal Agent Importer Functions

export interface ImportJobStatus {
  id: string;
  status: "cloning" | "analyzing" | "parsing" | "packaging" | "complete" | "failed";
  progress: number;
  message: string;
  repo_url: string;
  started_at: string;
  completed_at?: string;
  error?: string;
  packs?: any[];
}

export async function startImportJob(url: string): Promise<{ job_id: string }> {
  return await fetchApi('/api/marketplace/import-repo', {
    method: 'POST',
    body: JSON.stringify({ url })
  });
}

export async function getImportStatus(jobId: string): Promise<ImportJobStatus> {
  return await fetchApi(`/api/marketplace/import-status/${jobId}`);
}

export async function getImportResult(jobId: string): Promise<any> {
  return await fetchApi(`/api/marketplace/import-result/${jobId}`);
}

export async function installImportedPack(packId: string, jobId: string): Promise<any> {
  return await fetchApi(`/api/marketplace/import-install/${packId}?job_id=${jobId}`, {
    method: 'POST'
  });
}

export async function getImportFormats(): Promise<{ formats: any[] }> {
  return await fetchApi('/api/marketplace/import-formats');
}

// ─── Company Endpoints ───

export async function generateCompany(mission: string): Promise<any> {
  return await fetchApi('/api/companies/generate', {
    method: 'POST',
    body: JSON.stringify({ mission }),
  });
}

export async function createIssueAPI(companyId: string, issue: any): Promise<any> {
  return await fetchApi(`/api/companies/${companyId}/issues`, {
    method: 'POST',
    body: JSON.stringify(issue),
  });
}

// --- Notification Endpoints ---

export async function getNotifications(companyId?: string): Promise<any[]> {
  try {
    const query = companyId ? `?company_id=${companyId}` : '';
    return await fetchApi(`/api/notifications${query}`);
  } catch (e) {
    console.warn("Failed to fetch notifications:", e);
    return [];
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  return await fetchApi(`/api/notifications/${id}/read`, { method: 'POST' });
}
