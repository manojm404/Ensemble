/**
 * org-data.ts — Mock Data for AI Company Management
 * Matches the visual density and schemas requested in the "AI Company" overhaul.
 */

export interface Organization {
  id: string;
  name: string;
  description: string;
  tier: 'Starter' | 'Pro' | 'Enterprise';
  status: 'Active' | 'Setup';
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
  departmentId: string;
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
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  agentId: string;
  agentName: string;
  agentEmoji: string;
  emoji?: string;
  created: string;
}

export interface ActivityEvent {
  id: string;
  orgId: string;
  type: 'agent' | 'task' | 'alert' | 'member';
  action: string;
  time: string;
}

// ─── Mock Organizations ───
export const MOCK_ORGS: Organization[] = [
  {
    id: "ensemble-labs",
    name: "Ensemble Labs",
    description: "Build intelligent agent pipelines to automate software development workflows",
    tier: "Pro",
    status: "Active",
    memberCount: 8,
    agentCount: 12,
    departmentCount: 4
  },
  {
    id: "nexus-ai",
    name: "Nexus AI Corp",
    description: "Accelerate product development with autonomous AI teams",
    tier: "Enterprise",
    status: "Active",
    memberCount: 24,
    agentCount: 38,
    departmentCount: 7
  }
];

// ─── Mock Departments ───
export const MOCK_DEPARTMENTS: Department[] = [
  { id: "dept-eng", orgId: "ensemble-labs", name: "Engineering", description: "Code review, refactoring, testing, and CI/CD automation", emoji: "⚙️", agentCount: 5, completedTaskCount: 142 },
  { id: "dept-content", orgId: "ensemble-labs", name: "Content & Docs", description: "Technical writing, blog posts, and documentation generation", emoji: "📝", agentCount: 3, completedTaskCount: 67 },
  { id: "dept-sec", orgId: "ensemble-labs", name: "Security", description: "Vulnerability scanning, dependency audits, and compliance checks", emoji: "🛡️", agentCount: 2, completedTaskCount: 38 },
  { id: "dept-data", orgId: "ensemble-labs", name: "Data & Analytics", description: "Data pipeline management, reporting, and insights generation", emoji: "📊", agentCount: 2, completedTaskCount: 24 },
];

// ─── Mock Agents ───
export const MOCK_AGENTS: Agent[] = [
  { id: "agent-1", orgId: "ensemble-labs", departmentId: "dept-eng", departmentName: "Engineering", name: "CodeBot", role: "Senior Engineer", model: "GPT-4o", status: "running", emoji: "🤖", skills: ["Code Review", "Refactoring", "TypeScript"], tasksCompleted: 89 },
  { id: "agent-2", orgId: "ensemble-labs", departmentId: "dept-eng", departmentName: "Engineering", name: "TestPilot", role: "QA Lead", model: "GPT-4o", status: "running", emoji: "🧪", skills: ["Unit Testing", "E2E Testing", "Coverage"], tasksCompleted: 45 },
  { id: "agent-3", orgId: "ensemble-labs", departmentId: "dept-content", departmentName: "Content & Docs", name: "DocWriter", role: "Technical Writer", model: "Claude 3.5 Sonnet", status: "running", emoji: "✍️", skills: ["API Docs", "Tutorials", "Changelogs"], tasksCompleted: 38 },
];

// ─── Mock Tasks ───
export const MOCK_TASKS: OrgTask[] = [
  { id: "task-1", orgId: "ensemble-labs", departmentId: "dept-eng", departmentName: "Engineering", title: "Refactor authentication module", status: "in_progress", priority: "high", agentId: "agent-1", agentName: "CodeBot", agentEmoji: "🤖", emoji: "🔐", created: "1h 55m" },
  { id: "task-2", orgId: "ensemble-labs", departmentId: "dept-eng", departmentName: "Engineering", title: "Write E2E tests for checkout flow", status: "in_progress", priority: "high", agentId: "agent-2", agentName: "TestPilot", agentEmoji: "🧪", emoji: "🛒", created: "2h 48m" },
  { id: "task-3", orgId: "ensemble-labs", departmentId: "dept-content", departmentName: "Content & Docs", title: "Update API documentation v3.2", status: "in_progress", priority: "medium", agentId: "agent-3", agentName: "DocWriter", agentEmoji: "✍️", emoji: "📄", created: "3h 30m" },
];

// ─── Mock Activity ───
export const MOCK_ACTIVITY: ActivityEvent[] = [
  { id: "act-1", orgId: "ensemble-labs", type: "task", action: "CodeBot completed task TSK-111: Rate limiting middleware", time: "2m ago" },
  { id: "act-2", orgId: "ensemble-labs", type: "task", action: "SecBot started CVE scan on production dependencies", time: "5m ago" },
  { id: "act-3", orgId: "ensemble-labs", type: "agent", action: "TestPilot generated 24 new test cases for checkout flow", time: "12m ago" },
];

// ─── Data Accessors ───
export const getOrgById = (id: string) => MOCK_ORGS.find(o => o.id === id);
export const getDepartmentsByOrg = (orgId: string) => MOCK_DEPARTMENTS.filter(d => d.orgId === orgId);
export const getAgentsByOrg = (orgId: string) => MOCK_AGENTS.filter(a => a.orgId === orgId);
export const getTasksByOrg = (orgId: string) => MOCK_TASKS.filter(t => t.orgId === orgId);
export const getActivityByOrg = (orgId: string) => MOCK_ACTIVITY.filter(a => a.orgId === orgId);
export const getTasksByDepartment = (deptId: string) => MOCK_TASKS.filter(t => t.departmentId === deptId);
export const getAgentsByDepartment = (deptId: string) => MOCK_AGENTS.filter(a => a.departmentId === deptId);
