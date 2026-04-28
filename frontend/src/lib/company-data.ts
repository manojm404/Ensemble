/**
 * company-data.ts — Company Data Store
 *
 * Each company gets its own isolated universe: teams, agents, issues, activity.
 * Companies are auto-provisioned with a CEO based on the user's mission.
 * User is registered as "Board Member" of the company.
 */

// ─── Types ───

export interface Company {
  id: string;
  name: string;
  mission: string;          // Natural-language company goal/mission
  emoji: string;
  status: "Active" | "Setup";
  industry?: string;
  memberCount: number;
  agentCount: number;
  teamCount: number;
}

export interface Team {
  id: string;
  companyId: string;
  name: string;
  description: string;
  emoji: string;
  agentCount: number;
  completedIssueCount: number;
}

export interface CompanyAgent {
  id: string;
  companyId: string;
  teamId?: string;
  teamName: string;
  name: string;
  role: string;
  model: string;
  status: "running" | "idle" | "paused";
  emoji: string;
  skills: string[];
  issuesCompleted: number;
  isCEO: boolean;           // CEO is the root of the hierarchy
}

export interface CompanyIssue {
  id: string;
  companyId: string;
  teamId: string;
  teamName: string;
  title: string;
  description?: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "blocked";
  priority: "low" | "medium" | "high" | "critical";
  agentId: string;
  agentName: string;
  agentEmoji: string;
  emoji?: string;
  created: string;
  output?: string;
}

export interface ActivityEvent {
  id: string;
  companyId: string;
  type: "agent" | "issue" | "alert" | "deploy" | "member" | "system";
  action: string;
  time: string;
}

interface CompanyData {
  company: Company;
  teams: Team[];
  agents: CompanyAgent[];
  issues: CompanyIssue[];
  activity: ActivityEvent[];
}

// ─── Global Store ───
const companyStore: Map<string, CompanyData> = new Map();

const STORAGE_KEY = "ensemble_companies";

function saveToStorage() {
  try {
    const data: Record<string, CompanyData> = {};
    companyStore.forEach((val, key) => { data[key] = val; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to save companies to localStorage", e);
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data: Record<string, CompanyData> = JSON.parse(raw);
      Object.entries(data).forEach(([key, val]) => {
        companyStore.set(key, val);
      });
      return true;
    }
  } catch (e) {
    console.warn("Failed to load companies from localStorage", e);
  }
  return false;
}

loadFromStorage();

// ─── Auto-Provision New Company with CEO ───
function provisionNewCompany(company: Company): CompanyData {
  return {
    company,
    teams: [],
    agents: [],
    issues: [],
    activity: [
      { id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, companyId: company.id, type: "system", action: `Company "${company.name}" was founded`, time: "just now" },
    ]
  };
}

// ─── CRUD Operations ───

export function createCompany(company: Omit<Company, "memberCount" | "agentCount" | "teamCount" | "status">): Company {
  const newCompany: Company = {
    ...company,
    status: "Setup",
    memberCount: 1,
    agentCount: 0,
    teamCount: 0,
  };
  const data = provisionNewCompany(newCompany);
  companyStore.set(newCompany.id, data);
  saveToStorage();
  return newCompany;
}

/**
 * Create a company with a full structure from a mission statement.
 * This is called by the MagicCompanyDialog after the backend decodes the mission.
 */
export function createCompanyFromMission(
  mission: string,
  structure: {
    name: string;
    emoji: string;
    teams: { name: string; emoji: string; description: string; agents: { name: string; role: string; emoji: string; model: string; skills: string[] }[] }[];
  }
): Company {
  const company: Company = {
    id: `comp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: structure.name,
    mission,
    emoji: structure.emoji,
    status: "Active",
    memberCount: 1,
    agentCount: 0,
    teamCount: structure.teams.length,
  };

  const data = provisionNewCompany(company);

  // Auto-hire CEO first
  const ceoAgent: CompanyAgent = {
    id: `agent-ceo-${Date.now()}`,
    companyId: company.id,
    teamName: "Executive",
    name: "CEO",
    role: "Chief Executive Officer",
    model: "gemini-2.5-flash",
    status: "idle",
    emoji: "👔",
    skills: ["Strategy", "Leadership", "Decision Making"],
    issuesCompleted: 0,
    isCEO: true,
  };
  data.agents.push(ceoAgent);

  // Create teams and add agents
  for (const t of structure.teams) {
    const team: Team = {
      id: `team-${Date.now()}-${t.name.toLowerCase().replace(/\s+/g, "-")}`,
      companyId: company.id,
      name: t.name,
      description: t.description,
      emoji: t.emoji,
      agentCount: t.agents.length,
      completedIssueCount: 0,
    };
    data.teams.push(team);

    for (const a of t.agents) {
      const agent: CompanyAgent = {
        id: `agent-${Date.now()}-${a.name.toLowerCase().replace(/\s+/g, "-")}`,
        companyId: company.id,
        teamId: team.id,
        teamName: team.name,
        name: a.name,
        role: a.role,
        model: a.model,
        status: "idle",
        emoji: a.emoji,
        skills: a.skills,
        issuesCompleted: 0,
        isCEO: false,
      };
      data.agents.push(agent);
    }
  }

  company.agentCount = data.agents.length;

  data.activity.unshift({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    companyId: company.id,
    type: "system",
    action: `🎉 ${company.emoji} ${company.name} was auto-built from mission. CEO hired, ${data.teams.length} teams provisioned.`,
    time: "just now",
  });

  companyStore.set(company.id, data);
  saveToStorage();
  return company;
}

export function deleteCompany(companyId: string): boolean {
  const deleted = companyStore.delete(companyId);
  if (deleted) saveToStorage();
  return deleted;
}

export function updateCompany(companyId: string, updates: { name?: string; mission?: string }): boolean {
  const data = companyStore.get(companyId);
  if (!data) return false;
  if (updates.name !== undefined) data.company.name = updates.name;
  if (updates.mission !== undefined) data.company.mission = updates.mission;
  saveToStorage();
  return true;
}

export function createTeam(companyId: string, team: Omit<Team, "id" | "companyId" | "agentCount" | "completedIssueCount">): Team {
  const data = companyStore.get(companyId);
  if (!data) throw new Error(`Company ${companyId} not found`);

  const newTeam: Team = {
    ...team,
    companyId,
    id: `team-${Date.now()}`,
    agentCount: 0,
    completedIssueCount: 0,
  };
  data.teams.push(newTeam);
  data.company.teamCount = data.teams.length;
  saveToStorage();

  data.activity.unshift({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    companyId,
    type: "system",
    action: `Team "${newTeam.emoji} ${newTeam.name}" was created`,
    time: "just now",
  });

  return newTeam;
}

export function hireAgent(companyId: string, agent: Omit<CompanyAgent, "id" | "companyId" | "issuesCompleted" | "status" | "teamName" | "isCEO">): CompanyAgent {
  const data = companyStore.get(companyId);
  if (!data) throw new Error(`Company ${companyId} not found`);

  const team = agent.teamId ? data.teams.find(d => d.id === agent.teamId) : null;

  const newAgent: CompanyAgent = {
    ...agent,
    id: `agent-${Date.now()}`,
    companyId,
    status: "idle",
    issuesCompleted: 0,
    teamName: team?.name || "General",
    isCEO: false,
  };
  data.agents.push(newAgent);
  data.company.agentCount = data.agents.length;

  if (team) {
    team.agentCount = data.agents.filter(a => a.teamId === team.id).length;
  }

  saveToStorage();

  data.activity.unshift({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    companyId,
    type: "agent",
    action: `${newAgent.emoji} ${newAgent.name} was hired as ${newAgent.role}${team ? ` in ${team.name}` : ""}`,
    time: "just now",
  });

  return newAgent;
}

export function fireAgent(companyId: string, agentId: string): boolean {
  const data = companyStore.get(companyId);
  if (!data) return false;

  const agentIndex = data.agents.findIndex(a => a.id === agentId);
  if (agentIndex === -1) return false;

  const agent = data.agents[agentIndex];
  if (agent.isCEO) return false; // Can't fire the CEO

  data.agents.splice(agentIndex, 1);
  data.company.agentCount = data.agents.length;

  // Update team agent count
  if (agent.teamId) {
    const team = data.teams.find(t => t.id === agent.teamId);
    if (team) {
      team.agentCount = data.agents.filter(a => a.teamId === team.id).length;
    }
  }

  saveToStorage();

  data.activity.unshift({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    companyId,
    type: "agent",
    action: `${agent.emoji} ${agent.name} was removed from the company`,
    time: "just now",
  });

  return true;
}

export function createIssue(companyId: string, issue: Omit<CompanyIssue, "id" | "companyId" | "created" | "status" | "teamName" | "agentName" | "agentEmoji">): CompanyIssue {
  const data = companyStore.get(companyId);
  if (!data) throw new Error(`Company ${companyId} not found`);

  const agent = data.agents.find(a => a.id === issue.agentId);
  const team = data.teams.find(d => d.id === (issue.teamId || agent?.teamId));

  const newIssue: CompanyIssue = {
    ...issue,
    id: `issue-${Date.now()}`,
    companyId,
    status: "queued",
    created: "just now",
    teamName: team?.name || "General",
    agentName: agent?.name || "Unassigned",
    agentEmoji: agent?.emoji || "🤖",
  };
  data.issues.unshift(newIssue);
  saveToStorage();

  data.activity.unshift({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    companyId,
    type: "issue",
    action: `New issue: "${newIssue.title}" → ${newIssue.agentName}`,
    time: "just now",
  });

  return newIssue;
}

export function setIssueOutput(companyId: string, issueId: string, output: string): void {
  const data = companyStore.get(companyId);
  if (!data) return;
  const issue = data.issues.find(t => t.id === issueId);
  if (issue) {
    issue.output = output;
    saveToStorage();
  }
}

export function getIssueById(companyId: string, issueId: string): CompanyIssue | undefined {
  const data = companyStore.get(companyId);
  return data?.issues.find(t => t.id === issueId);
}

export function updateIssueStatus(companyId: string, issueId: string, status: CompanyIssue["status"]): void {
  const data = companyStore.get(companyId);
  if (!data) return;

  const issue = data.issues.find(t => t.id === issueId);
  if (issue) {
    issue.status = status;

    if (status === "completed") {
      const agent = data.agents.find(a => a.id === issue.agentId);
      if (agent) agent.issuesCompleted++;
      const team = data.teams.find(d => d.id === issue.teamId);
      if (team) team.completedIssueCount++;

      data.activity.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        companyId,
        type: "issue",
        action: `✅ ${issue.agentEmoji} ${issue.agentName} resolved: "${issue.title}"`,
        time: "just now",
      });
    } else if (status === "failed") {
      data.activity.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        companyId,
        type: "alert",
        action: `❌ Issue failed: "${issue.title}"`,
        time: "just now",
      });
    } else if (status === "in_progress") {
      data.activity.unshift({
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        companyId,
        type: "issue",
        action: `🔄 ${issue.agentEmoji} ${issue.agentName} started: "${issue.title}"`,
        time: "just now",
      });
    }
    saveToStorage();
  }
}

export function addActivityEvent(companyId: string, type: ActivityEvent["type"], action: string): void {
  const data = companyStore.get(companyId);
  if (!data) return;

  data.activity.unshift({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    companyId,
    type,
    action,
    time: "just now",
  });
  saveToStorage();
}

// ─── Data Accessors ───

export function getAllCompanies(): Company[] {
  return Array.from(companyStore.values()).map(d => d.company);
}

export function getCompanyById(id: string): Company | undefined {
  return companyStore.get(id)?.company;
}

export function getTeamsByCompany(companyId: string): Team[] {
  return companyStore.get(companyId)?.teams || [];
}

export function getAgentsByCompany(companyId: string): CompanyAgent[] {
  return companyStore.get(companyId)?.agents || [];
}

export function getIssuesByCompany(companyId: string): CompanyIssue[] {
  return companyStore.get(companyId)?.issues || [];
}

export function getActivityByCompany(companyId: string): ActivityEvent[] {
  return companyStore.get(companyId)?.activity || [];
}

export function getIssuesByTeam(teamId: string): CompanyIssue[] {
  for (const data of companyStore.values()) {
    const issues = data.issues.filter(t => t.teamId === teamId);
    if (issues.length > 0) return issues;
  }
  return [];
}

export function getAgentsByTeam(teamId: string): CompanyAgent[] {
  for (const data of companyStore.values()) {
    const agents = data.agents.filter(a => a.teamId === teamId);
    if (agents.length > 0) return agents;
  }
  return [];
}

export function getTeamById(teamId: string): Team | undefined {
  for (const data of companyStore.values()) {
    const team = data.teams.find(d => d.id === teamId);
    if (team) return team;
  }
  return undefined;
}

export function getCompanyAgentById(agentId: string): CompanyAgent | undefined {
  for (const data of companyStore.values()) {
    const agent = data.agents.find(a => a.id === agentId);
    if (agent) return agent;
  }
  return undefined;
}

export function getCEO(companyId: string): CompanyAgent | undefined {
  return companyStore.get(companyId)?.agents.find(a => a.isCEO);
}

// ─── Mission-to-Company Builder (Client-Side Fallback) ───

/**
 * Maps mission keywords to company structure.
 * This is a local fallback; the backend LLM endpoint is the primary path.
 */
const MISSION_PATTERNS: { keywords: string[]; company: { name: string; emoji: string; teams: { name: string; emoji: string; description: string; agents: { name: string; role: string; emoji: string; model: string; skills: string[] }[] }[] } }[] = [
  {
    keywords: ["saas", "platform", "web app", "analytics", "dashboard"],
    company: {
      name: "SaaS Platform",
      emoji: "☁️",
      teams: [
        {
          name: "Engineering",
          emoji: "⚙️",
          description: "Build and maintain the platform",
          agents: [
            { name: "Backend Architect", role: "Backend Systems Architect", emoji: "🏗️", model: "gemini-2.5-flash", skills: ["API Design", "System Architecture", "Database Design"] },
            { name: "Frontend Developer", role: "Frontend Experience Developer", emoji: "🖥️", model: "gemini-2.5-flash", skills: ["React", "TypeScript", "UI Development"] },
          ],
        },
        {
          name: "Design",
          emoji: "🎨",
          description: "UI/UX and brand identity",
          agents: [
            { name: "UI Designer", role: "UI Systems Designer", emoji: "🎨", model: "gemini-2.5-flash", skills: ["Design Systems", "Visual Design", "Accessibility"] },
          ],
        },
        {
          name: "Marketing",
          emoji: "📣",
          description: "Growth and content",
          agents: [
            { name: "Content Strategist", role: "Multi-Platform Content Strategist", emoji: "✍️", model: "gemini-2.5-flash", skills: ["Content Strategy", "Copywriting", "SEO"] },
          ],
        },
      ],
    },
  },
  {
    keywords: ["ecommerce", "e-commerce", "shop", "store", "retail"],
    company: {
      name: "E-Commerce Company",
      emoji: "🛒",
      teams: [
        {
          name: "Engineering",
          emoji: "⚙️",
          description: "Platform and integrations",
          agents: [
            { name: "Full-Stack Developer", role: "Senior Full-Stack Developer", emoji: "💎", model: "gemini-2.5-flash", skills: ["E-Commerce", "Payment Integration", "API Design"] },
          ],
        },
        {
          name: "Marketing",
          emoji: "📣",
          description: "Customer acquisition",
          agents: [
            { name: "SEO Lead", role: "Technical SEO Lead", emoji: "🔍", model: "gemini-2.5-flash", skills: ["SEO", "Analytics", "Content Strategy"] },
          ],
        },
      ],
    },
  },
  {
    keywords: ["game", "gaming", "unity", "unreal", "gamedev"],
    company: {
      name: "Game Studio",
      emoji: "🎮",
      teams: [
        {
          name: "Engineering",
          emoji: "⚙️",
          description: "Game engine and systems",
          agents: [
            { name: "Gameplay Programmer", role: "Godot Gameplay Programmer", emoji: "🎯", model: "gemini-2.5-flash", skills: ["GDScript", "Game Architecture", "Systems Design"] },
          ],
        },
        {
          name: "Game Design",
          emoji: "🎮",
          description: "Mechanics and narrative",
          agents: [
            { name: "Game Designer", role: "Game Systems Designer", emoji: "🎮", model: "gemini-2.5-flash", skills: ["Mechanics Design", "Level Design", "Player Psychology"] },
            { name: "Narrative Architect", role: "Game Narrative Architect", emoji: "📖", model: "gemini-2.5-flash", skills: ["Story Design", "Dialogue", "World Building"] },
          ],
        },
      ],
    },
  },
  {
    keywords: ["mobile", "ios", "android", "app"],
    company: {
      name: "Mobile App Studio",
      emoji: "📱",
      teams: [
        {
          name: "Engineering",
          emoji: "⚙️",
          description: "Mobile development",
          agents: [
            { name: "Mobile Developer", role: "Cross-Platform Mobile Developer", emoji: "📲", model: "gemini-2.5-flash", skills: ["React Native", "Flutter", "Mobile UI"] },
          ],
        },
      ],
    },
  },
  {
    keywords: ["ai", "machine learning", "ml", "data science", "nlp", "computer vision", "deep learning"],
    company: {
      name: "AI Research Lab",
      emoji: "🧠",
      teams: [
        {
          name: "Research",
          emoji: "🔬",
          description: "AI model research and experimentation",
          agents: [
            { name: "ML Research Lead", role: "ML Research Scientist", emoji: "🧪", model: "gemini-2.5-flash", skills: ["Model Architecture", "Research", "Paper Analysis"] },
            { name: "Data Scientist", role: "Senior Data Scientist", emoji: "📊", model: "gemini-2.5-flash", skills: ["Statistics", "Feature Engineering", "Model Evaluation"] },
          ],
        },
        {
          name: "Engineering",
          emoji: "⚙️",
          description: "ML infrastructure and deployment",
          agents: [
            { name: "ML Engineer", role: "ML Platform Engineer", emoji: "🤖", model: "gemini-2.5-flash", skills: ["MLOps", "Model Deployment", "Pipeline Engineering"] },
          ],
        },
      ],
    },
  },
  {
    keywords: ["fintech", "finance", "banking", "payment", "trading", "crypto", "blockchain"],
    company: {
      name: "FinTech Startup",
      emoji: "💰",
      teams: [
        {
          name: "Engineering",
          emoji: "⚙️",
          description: "Financial platform development",
          agents: [
            { name: "Backend Engineer", role: "Financial Systems Engineer", emoji: "🏦", model: "gemini-2.5-flash", skills: ["Payment Processing", "Security", "Compliance"] },
            { name: "Security Engineer", role: "Security & Compliance Lead", emoji: "🔒", model: "gemini-2.5-flash", skills: ["Encryption", "Audit", "Regulatory Compliance"] },
          ],
        },
        {
          name: "Product",
          emoji: "📋",
          description: "Product strategy and user experience",
          agents: [
            { name: "Product Manager", role: "FinTech Product Manager", emoji: "📈", model: "gemini-2.5-flash", skills: ["Product Strategy", "User Research", "Market Analysis"] },
          ],
        },
      ],
    },
  },
  {
    keywords: ["health", "healthcare", "medical", "hospital", "patient", "diagnosis", "telemedicine"],
    company: {
      name: "HealthTech Company",
      emoji: "🏥",
      teams: [
        {
          name: "Engineering",
          emoji: "⚙️",
          description: "Healthcare platform development",
          agents: [
            { name: "Healthcare Developer", role: "Healthcare Systems Engineer", emoji: "💊", model: "gemini-2.5-flash", skills: ["HIPAA Compliance", "EHR Integration", "Security"] },
          ],
        },
        {
          name: "Clinical",
          emoji: "🩺",
          description: "Clinical expertise and compliance",
          agents: [
            { name: "Clinical Advisor", role: "Clinical Informatics Specialist", emoji: "👨‍⚕️", model: "gemini-2.5-flash", skills: ["Clinical Workflows", "Medical Terminology", "Regulatory"] },
          ],
        },
      ],
    },
  },
  {
    keywords: ["education", "learning", "e-learning", "course", "teaching", "school", "university"],
    company: {
      name: "EdTech Platform",
      emoji: "📚",
      teams: [
        {
          name: "Engineering",
          emoji: "⚙️",
          description: "Learning platform development",
          agents: [
            { name: "Full-Stack Developer", role: "EdTech Platform Developer", emoji: "💻", model: "gemini-2.5-flash", skills: ["LMS Integration", "Video Streaming", "Interactive Content"] },
          ],
        },
        {
          name: "Content",
          emoji: "📝",
          description: "Curriculum and content creation",
          agents: [
            { name: "Instructional Designer", role: "Senior Instructional Designer", emoji: "📖", model: "gemini-2.5-flash", skills: ["Curriculum Design", "Learning Theory", "Assessment"] },
          ],
        },
      ],
    },
  },
  {
    keywords: ["marketing", "advertising", "seo", "content", "social media", "brand"],
    company: {
      name: "Digital Marketing Agency",
      emoji: "📣",
      teams: [
        {
          name: "Content",
          emoji: "✍️",
          description: "Content creation and strategy",
          agents: [
            { name: "Content Strategist", role: "Senior Content Strategist", emoji: "📝", model: "gemini-2.5-flash", skills: ["Content Strategy", "Copywriting", "SEO"] },
            { name: "Social Media Manager", role: "Social Media Specialist", emoji: "📱", model: "gemini-2.5-flash", skills: ["Social Media", "Community Management", "Analytics"] },
          ],
        },
        {
          name: "Analytics",
          emoji: "📊",
          description: "Campaign analytics and optimization",
          agents: [
            { name: "Marketing Analyst", role: "Marketing Data Analyst", emoji: "📈", model: "gemini-2.5-flash", skills: ["Campaign Analytics", "A/B Testing", "ROI Analysis"] },
          ],
        },
      ],
    },
  },
  {
    keywords: ["devops", "infrastructure", "cloud", "kubernetes", "docker", "ci/cd", "deployment"],
    company: {
      name: "DevOps Consultancy",
      emoji: "☁️",
      teams: [
        {
          name: "Infrastructure",
          emoji: "🏗️",
          description: "Cloud infrastructure and automation",
          agents: [
            { name: "DevOps Engineer", role: "Senior DevOps Engineer", emoji: "🔧", model: "gemini-2.5-flash", skills: ["Terraform", "Kubernetes", "CI/CD"] },
            { name: "SRE Lead", role: "Site Reliability Engineer", emoji: "📊", model: "gemini-2.5-flash", skills: ["Monitoring", "Incident Response", "Performance"] },
          ],
        },
        {
          name: "Security",
          emoji: "🔒",
          description: "Security and compliance",
          agents: [
            { name: "Security Engineer", role: "Cloud Security Engineer", emoji: "🛡️", model: "gemini-2.5-flash", skills: ["Cloud Security", "Compliance", "Penetration Testing"] },
          ],
        },
      ],
    },
  },
];

/**
 * Match a mission statement to a company structure using keyword scoring.
 * Returns a default structure if no pattern matches.
 */
export function buildCompanyFromMission(mission: string): { name: string; emoji: string; teams: { name: string; emoji: string; description: string; agents: { name: string; role: string; emoji: string; model: string; skills: string[] }[] }[] } {
  const lower = mission.toLowerCase();
  let bestMatch = MISSION_PATTERNS[0].company;
  let bestScore = 0;

  for (const pattern of MISSION_PATTERNS) {
    const score = pattern.keywords.filter(k => lower.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = pattern.company;
    }
  }

  // Derive a company name from the mission if no strong match
  if (bestScore === 0) {
    const words = mission.split(" ").slice(0, 4).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    bestMatch = {
      name: `${words} Co.`,
      emoji: "🏢",
      teams: [
        {
          name: "Engineering",
          emoji: "⚙️",
          description: "Build and ship the product",
          agents: [
            { name: "Senior Developer", role: "Senior Full-Stack Developer", emoji: "💎", model: "gemini-2.5-flash", skills: ["Full-Stack Development", "Architecture", "Code Quality"] },
            { name: "Frontend Developer", role: "Frontend Developer", emoji: "🖥️", model: "gemini-2.5-flash", skills: ["React", "TypeScript", "UI/UX"] },
          ],
        },
        {
          name: "Product",
          emoji: "📋",
          description: "Product strategy and design",
          agents: [
            { name: "Product Manager", role: "Product Manager", emoji: "📈", model: "gemini-2.5-flash", skills: ["Product Strategy", "User Research", "Roadmapping"] },
          ],
        },
      ],
    };
  }

  return bestMatch;
}

// ─── Default Options for Hiring Dialog ───
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
