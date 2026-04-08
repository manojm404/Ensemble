/**
 * org-data.ts — Dynamic Organization Data Store
 * 
 * Each organization gets its own isolated data universe:
 * departments, agents, tasks, and activity are all keyed by orgId.
 * 
 * New orgs are auto-provisioned with default department + starter agent.
 */

// ─── Types ───
export interface Organization {
  id: string;
  name: string;
  description: string;
  tier: 'Starter' | 'Pro' | 'Enterprise';
  status: 'Active' | 'Setup';
  industry?: string;
  website?: string;
  contactEmail?: string;
  location?: string;
  memberCount: number;
  agentCount: number;
  departmentCount: number;
}

export interface Department {
  id: string;
  orgId: string;
  name: string;
  description: string;
  emoji: string;
  agentCount: number;
  completedTaskCount: number;
}

export interface Agent {
  id: string;
  orgId: string;
  departmentId?: string;  // Optional — defaults to "General"
  departmentName: string;
  name: string;
  role: string;
  model: string;
  status: 'running' | 'idle' | 'paused';
  emoji: string;
  skills: string[];
  tasksCompleted: number;
}

export interface OrgTask {
  id: string;
  orgId: string;
  departmentId: string;
  departmentName: string;
  title: string;
  description?: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  agentId: string;
  agentName: string;
  agentEmoji: string;
  emoji?: string;
  created: string;
  output?: string;  // Agent's execution result
}

export interface ActivityEvent {
  id: string;
  orgId: string;
  type: 'agent' | 'task' | 'alert' | 'deploy' | 'member' | 'system';
  action: string;
  time: string;
}

interface OrgData {
  org: Organization;
  departments: Department[];
  agents: Agent[];
  tasks: OrgTask[];
  activity: ActivityEvent[];
}

// ─── Global Store ───
const orgStore: Map<string, OrgData> = new Map();

// ─── Persistence to localStorage ───
const STORAGE_KEY = "ensemble_orgs";

function saveToStorage() {
  try {
    const data: Record<string, OrgData> = {};
    orgStore.forEach((val, key) => { data[key] = val; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to save orgs to localStorage", e);
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data: Record<string, OrgData> = JSON.parse(raw);
      Object.entries(data).forEach(([key, val]) => {
        // Restore Date objects if needed (not needed for current schema)
        orgStore.set(key, val);
      });
      return true;
    }
  } catch (e) {
    console.warn("Failed to load orgs from localStorage", e);
  }
  return false;
}

// Load from storage on init
loadFromStorage();

// ─── Auto-Provision New Org ───
function provisionNewOrg(org: Organization): OrgData {
  return {
    org,
    departments: [],
    agents: [],
    tasks: [],
    activity: [
      { id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, orgId: org.id, type: "system", action: `Organization "${org.name}" was created`, time: "just now" },
    ]
  };
}

// ─── CRUD Operations ───

export function createOrg(org: Omit<Organization, 'memberCount' | 'agentCount' | 'departmentCount' | 'status'>): Organization {
  const newOrg: Organization = {
    ...org,
    status: "Setup",
    memberCount: 1,
    agentCount: 0,
    departmentCount: 0,
  };
  const data = provisionNewOrg(newOrg);
  orgStore.set(newOrg.id, data);
  saveToStorage();
  return newOrg;
}

export function deleteOrg(orgId: string): boolean {
  const deleted = orgStore.delete(orgId);
  if (deleted) saveToStorage();
  return deleted;
}

export function createDepartment(orgId: string, dept: Omit<Department, 'id' | 'agentCount' | 'completedTaskCount'>): Department {
  const data = orgStore.get(orgId);
  if (!data) throw new Error(`Org ${orgId} not found`);
  
  const newDept: Department = {
    ...dept,
    orgId,
    id: `dept-${Date.now()}`,
    agentCount: 0,
    completedTaskCount: 0,
  };
  data.departments.push(newDept);
  data.org.departmentCount = data.departments.length;
  saveToStorage();
  
  data.activity.unshift({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    orgId,
    type: "system",
    action: `Department "${newDept.name}" was created`,
    time: "just now"
  });
  
  return newDept;
}

export function hireAgent(orgId: string, agent: Omit<Agent, 'id' | 'tasksCompleted' | 'status'>): Agent {
  const data = orgStore.get(orgId);
  if (!data) throw new Error(`Org ${orgId} not found`);
  
  const dept = agent.departmentId ? data.departments.find(d => d.id === agent.departmentId) : null;
  
  const newAgent: Agent = {
    ...agent,
    id: `agent-${Date.now()}`,
    orgId,
    status: "idle",
    tasksCompleted: 0,
    departmentName: dept?.name || "General",
  };
  data.agents.push(newAgent);
  data.org.agentCount = data.agents.length;
  
  // Update department agent count if assigned
  if (dept) {
    dept.agentCount = data.agents.filter(a => a.departmentId === dept.id).length;
  }
  
  saveToStorage();
  
  data.activity.unshift({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    orgId,
    type: "agent",
    action: `${newAgent.emoji} ${newAgent.name} was hired as ${newAgent.role}${dept ? ` in ${dept.name}` : ''}`,
    time: "just now"
  });
  
  return newAgent;
}

export function createTask(orgId: string, task: Omit<OrgTask, 'id' | 'created' | 'status'>): OrgTask {
  const data = orgStore.get(orgId);
  if (!data) throw new Error(`Org ${orgId} not found`);

  const agent = data.agents.find(a => a.id === task.agentId);
  // Inherit agent's department or use "General"
  const dept = data.departments.find(d => d.id === (task.departmentId || agent?.departmentId));

  const newTask: OrgTask = {
    ...task,
    id: `task-${Date.now()}`,
    orgId,
    status: "queued",
    created: "just now",
    departmentName: dept?.name || "General",
    agentName: agent?.name || "Unassigned",
    agentEmoji: agent?.emoji || "🤖",
  };
  data.tasks.unshift(newTask);
  saveToStorage();

  data.activity.unshift({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    orgId,
    type: "task",
    action: `New task created: "${newTask.title}" → ${newTask.agentName}`,
    time: "just now"
  });

  return newTask;
}

export function setTaskOutput(orgId: string, taskId: string, output: string): void {
  const data = orgStore.get(orgId);
  if (!data) return;
  const task = data.tasks.find(t => t.id === taskId);
  if (task) {
    task.output = output;
    saveToStorage();
  }
}

export function getTaskById(orgId: string, taskId: string): OrgTask | undefined {
  const data = orgStore.get(orgId);
  return data?.tasks.find(t => t.id === taskId);
}

export function updateTaskStatus(orgId: string, taskId: string, status: OrgTask['status']): void {
  const data = orgStore.get(orgId);
  if (!data) return;
  
  const task = data.tasks.find(t => t.id === taskId);
  if (task) {
    task.status = status;
    
    if (status === "completed") {
      const agent = data.agents.find(a => a.id === task.agentId);
      if (agent) agent.tasksCompleted++;
      const dept = data.departments.find(d => d.id === task.departmentId);
      if (dept) dept.completedTaskCount++;
      
      data.activity.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        orgId,
        type: "task",
        action: `✅ ${task.agentEmoji} ${task.agentName} completed: "${task.title}"`,
        time: "just now"
      });
    } else if (status === "failed") {
      data.activity.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        orgId,
        type: "alert",
        action: `❌ Task failed: "${task.title}"`,
        time: "just now"
      });
    } else if (status === "in_progress") {
      data.activity.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        orgId,
        type: "task",
        action: `🔄 ${task.agentEmoji} ${task.agentName} started: "${task.title}"`,
        time: "just now"
      });
    }
    saveToStorage();
  }
}

export function addActivityEvent(orgId: string, type: ActivityEvent['type'], action: string): void {
  const data = orgStore.get(orgId);
  if (!data) return;
  
  data.activity.unshift({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    orgId,
    type,
    action,
    time: "just now"
  });
  saveToStorage();
}

// ─── Data Accessors ───

export function getAllOrgs(): Organization[] {
  return Array.from(orgStore.values()).map(d => d.org);
}

export function getOrgById(id: string): Organization | undefined {
  return orgStore.get(id)?.org;
}

export function getDepartmentsByOrg(orgId: string): Department[] {
  return orgStore.get(orgId)?.departments || [];
}

export function getAgentsByOrg(orgId: string): Agent[] {
  return orgStore.get(orgId)?.agents || [];
}

export function getTasksByOrg(orgId: string): OrgTask[] {
  return orgStore.get(orgId)?.tasks || [];
}

export function getActivityByOrg(orgId: string): ActivityEvent[] {
  return orgStore.get(orgId)?.activity || [];
}

export function getTasksByDepartment(deptId: string): OrgTask[] {
  // Search across all orgs
  for (const data of orgStore.values()) {
    const tasks = data.tasks.filter(t => t.departmentId === deptId);
    if (tasks.length > 0) return tasks;
  }
  return [];
}

export function getAgentsByDepartment(deptId: string): Agent[] {
  // Search across all orgs
  for (const data of orgStore.values()) {
    const agents = data.agents.filter(a => a.departmentId === deptId);
    if (agents.length > 0) return agents;
  }
  return [];
}

export function getDepartmentById(deptId: string): Department | undefined {
  for (const data of orgStore.values()) {
    const dept = data.departments.find(d => d.id === deptId);
    if (dept) return dept;
  }
  return undefined;
}

export function getAgentById(agentId: string): Agent | undefined {
  for (const data of orgStore.values()) {
    const agent = data.agents.find(a => a.id === agentId);
    if (agent) return agent;
  }
  return undefined;
}

// ─── Default Agent Options for Hiring Dialog ───
export const AGENT_ROLES = [
  "General Assistant",
  "Senior Engineer",
  "QA Lead",
  "Technical Writer",
  "Data Analyst",
  "Security Auditor",
  "DevOps Engineer",
  "Product Manager",
  "UX Researcher",
  "Content Creator",
];

export const AGENT_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "gemini" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "gemini" },
  { id: "qwen2.5:1.5b", name: "Qwen 2.5 (Local)", provider: "ollama" },
  { id: "llama3.2", name: "Llama 3.2 (Local)", provider: "ollama" },
];

export const AGENT_SKILLS = [
  "Code Review", "Refactoring", "TypeScript", "Python", "React",
  "Unit Testing", "E2E Testing", "API Docs", "Tutorials",
  "Data Analysis", "Research", "Writing", "Security auditing",
  "DevOps", "CI/CD", "Database Design", "UI/UX Design",
];
