/**
 * API Client functions.
 */

export const API_BASE_URL = 'http://127.0.0.1:8088';
export const WS_BASE_URL = 'ws://127.0.0.1:8088';

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('ensemble_auth_token');
  const headers: HeadersInit = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
  if (!response.ok) {
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
        is_native: d.is_native ?? false
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

export async function installPack(pack_id: string, download_url: string, version: string): Promise<any> {
  return await fetchApi('/api/marketplace/install', {
    method: 'POST',
    body: JSON.stringify({ pack_id, download_url, version })
  });
}

export async function uninstallPack(pack_id: string): Promise<any> {
  return await fetchApi('/api/marketplace/uninstall', {
    method: 'POST',
    body: JSON.stringify({ pack_id })
  });
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
