import { type AgentSkill } from "@/lib/api";
import { getAgentMetadata } from "@/lib/agent-metadata";
import { generateWorkflowAPI } from "@/lib/api";
import type { Node, Edge } from "reactflow";

// Keyword-to-agent mapping for smart matching
const agentKeywords: Record<string, string[]> = {
  "engineering-engineering-code-reviewer": ["code", "review", "refactor", "lint", "clean", "optimize", "programming", "develop", "build", "software"],
  "testing-testing-test-results-analyzer": ["test", "testing", "qa", "quality", "unit test", "integration", "coverage", "verify"],
  "engineering-engineering-security-engineer": ["debug", "bug", "error", "fix", "issue", "crash", "troubleshoot", "diagnose", "security"],
  "engineering-engineering-technical-writer": ["document", "docs", "readme", "api doc", "documentation", "write doc", "technical writing"],
  "engineering-engineering-software-architect": ["architect", "design", "system", "scale", "infrastructure", "microservice", "database", "schema"],
  "support-support-analytics-reporter": ["data", "analytics", "analysis", "insight", "dashboard", "metrics", "report", "statistics", "csv", "sql"],
  "design-design-ui-designer": ["ui", "ux", "design", "interface", "layout", "frontend", "component", "figma", "mockup", "wireframe"],
  "marketing-marketing-content-creator": ["copy", "marketing", "content", "blog", "email", "seo", "social media", "ad", "campaign", "landing page"],
  "engineering-engineering-devops-automator": ["deploy", "ci/cd", "pipeline", "devops", "docker", "kubernetes", "cloud", "aws", "server", "hosting"],
  "product-product-manager": ["strategy", "business", "plan", "roadmap", "market", "competitor", "growth", "product", "pricing"],
  "design-design-visual-storyteller": ["illustration", "icon", "visual", "asset", "graphic", "image", "banner", "logo", "brand"],
  "game-development-narrative-designer": ["story", "narrative", "creative", "writing", "fiction", "script", "scenario", "persona"],
};

// Common workflow templates for well-known patterns
const workflowTemplates: Record<string, { agents: string[]; name: string }> = {
  "code review": { agents: ["codebot", "testpilot", "debugger", "docwriter"], name: "Code Review Pipeline" },
  "launch product": { agents: ["strategist", "copysmith", "pixelpro", "infrabot"], name: "Product Launch" },
  "content pipeline": { agents: ["strategist", "copysmith", "illustrator", "datasage"], name: "Content Pipeline" },
  "full stack app": { agents: ["architect", "codebot", "testpilot", "infrabot", "docwriter"], name: "Full Stack Development" },
  "marketing campaign": { agents: ["strategist", "copysmith", "illustrator", "datasage"], name: "Marketing Campaign" },
  "data pipeline": { agents: ["datasage", "codebot", "testpilot", "docwriter"], name: "Data Pipeline" },
};

function scoreAgent(agentId: string, promptLower: string): number {
  const keywords = agentKeywords[agentId] || [];
  let score = 0;
  for (const kw of keywords) {
    if (promptLower.includes(kw)) {
      score += kw.length; // longer keyword matches = higher relevance
    }
  }
  return score;
}

function layoutNodes(count: number): { x: number; y: number }[] {
  // Create a left-to-right flow layout with some vertical spread
  const positions: { x: number; y: number }[] = [];
  const xStep = 250;
  const yCenter = 200;

  if (count <= 3) {
    // Linear layout
    for (let i = 0; i < count; i++) {
      positions.push({ x: 100 + i * xStep, y: yCenter });
    }
  } else {
    // Diamond/fan layout for more agents
    const cols = Math.ceil(count / 2);
    for (let i = 0; i < count; i++) {
      const col = Math.floor(i * cols / count);
      const row = i % 2;
      positions.push({
        x: 100 + col * xStep,
        y: yCenter + (row === 0 ? -80 : 80) + (col === 0 || col === cols - 1 ? 80 : 0),
      });
    }
    // First and last nodes centered
    if (positions.length > 0) positions[0].y = yCenter;
    if (positions.length > 1) positions[positions.length - 1].y = yCenter;
  }

  return positions;
}

function generateEdges(agentIds: string[], nodeIds: string[]): Edge[] {
  const edges: Edge[] = [];
  const count = nodeIds.length;

  if (count <= 1) return edges;

  if (count === 2) {
    edges.push({
      id: `e-${nodeIds[0]}-${nodeIds[1]}`,
      source: nodeIds[0],
      target: nodeIds[1],
      animated: true,
      style: { stroke: "hsl(195, 90%, 50%)" },
    });
  } else if (count === 3) {
    // Linear chain
    for (let i = 0; i < count - 1; i++) {
      edges.push({
        id: `e-${nodeIds[i]}-${nodeIds[i + 1]}`,
        source: nodeIds[i],
        target: nodeIds[i + 1],
        animated: i === 0,
        style: { stroke: i === 0 ? "hsl(195, 90%, 50%)" : "hsl(215, 15%, 55%)" },
      });
    }
  } else {
    // Fan-out from first node to middle nodes, then converge to last
    const first = nodeIds[0];
    const last = nodeIds[count - 1];
    const middle = nodeIds.slice(1, count - 1);

    for (const mid of middle) {
      edges.push({
        id: `e-${first}-${mid}`,
        source: first,
        target: mid,
        animated: true,
        style: { stroke: "hsl(195, 90%, 50%)" },
      });
      edges.push({
        id: `e-${mid}-${last}`,
        source: mid,
        target: last,
        style: { stroke: "hsl(215, 15%, 55%)" },
      });
    }
  }

  return edges;
}

// Generates task-specific prompts for each agent based on the user's requirement
function generateTaskPrompt(agentId: string, userPrompt: string): string {
  const taskMap: Record<string, string> = {
    "engineering-engineering-code-reviewer": `Review and implement code based on: "${userPrompt}". Follow best practices, ensure clean architecture.`,
    "testing-testing-test-results-analyzer": `Generate comprehensive tests for: "${userPrompt}". Cover edge cases, integration points, and error scenarios.`,
    "engineering-engineering-security-engineer": `Analyze potential issues and bugs in: "${userPrompt}". Provide fixes and preventive measures.`,
    "engineering-engineering-technical-writer": `Write clear documentation for: "${userPrompt}". Include API references, usage examples, and architecture notes.`,
    "engineering-engineering-software-architect": `Design the system architecture for: "${userPrompt}". Consider scalability, security, and maintainability.`,
    "support-support-analytics-reporter": `Analyze data requirements for: "${userPrompt}". Define metrics, queries, and visualization needs.`,
    "design-design-ui-designer": `Design the UI/UX for: "${userPrompt}". Create intuitive layouts with accessibility in mind.`,
    "marketing-marketing-content-creator": `Create compelling copy for: "${userPrompt}". Optimize for engagement and conversion.`,
    "engineering-engineering-devops-automator": `Set up deployment pipeline for: "${userPrompt}". Configure CI/CD, monitoring, and scaling.`,
    "product-product-manager": `Develop strategy for: "${userPrompt}". Analyze market, competition, and growth opportunities.`,
    "design-design-visual-storyteller": `Create visual assets for: "${userPrompt}". Design icons, illustrations, and brand elements.`,
    "game-development-narrative-designer": `Craft narrative content for: "${userPrompt}". Build engaging stories and user personas.`,
  };
  return taskMap[agentId] || `Handle your part of: "${userPrompt}"`;
}

export interface GeneratedWorkflow {
  name: string;
  nodes: Node[];
  edges: Edge[];
}

export async function generateWorkflowFromPrompt(
  prompt: string,
  allAgents: AgentSkill[]
): Promise<GeneratedWorkflow> {
  const promptLower = prompt.toLowerCase().trim();
  
  try {
    const apiResult = await generateWorkflowAPI(prompt);
    if (apiResult && apiResult.nodes && apiResult.edges) {
       return {
         name: apiResult.name || prompt.split(/\s+/).slice(0, 4).join(" "),
         nodes: apiResult.nodes,
         edges: apiResult.edges
       };
    }
  } catch (e) {
    console.warn("Failed to generate workflow via API, falling back to local generation", e);
  }

  // 1. Check for template matches first
  for (const [pattern, template] of Object.entries(workflowTemplates)) {
    if (promptLower.includes(pattern)) {
      const matchedAgents = template.agents
        .map((id) => allAgents.find((a) => a.id === id))
        .filter(Boolean) as AgentSkill[];

      if (matchedAgents.length >= 2) {
        return buildWorkflow(template.name, matchedAgents, prompt);
      }
    }
  }

  // 2. Score all agents and pick the top relevant ones
  const scored = allAgents
    .map((agent) => ({ agent, score: scoreAgent(agent.id, promptLower) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const selectedAgents = scored.slice(0, Math.min(scored.length, 5)).map((s) => s.agent);

  // 3. If fewer than 2 agents matched, pick sensible defaults
  if (selectedAgents.length < 2) {
    const defaults = ["engineering-engineering-code-reviewer", "testing-testing-test-results-analyzer", "engineering-engineering-technical-writer"];
    for (const id of defaults) {
      if (!selectedAgents.find((a) => a.id === id)) {
        const agent = allAgents.find((a) => a.id === id);
        if (agent) selectedAgents.push(agent);
        if (selectedAgents.length >= 3) break;
      }
    }
  }

  // Generate a name from the prompt
  const words = prompt.split(/\s+/).slice(0, 4).join(" ");
  const name = words.length > 30 ? words.slice(0, 30) + "…" : words;

  return buildWorkflow(name, selectedAgents, prompt);
}

function buildWorkflow(
  name: string,
  agents: AgentSkill[],
  userPrompt: string
): GeneratedWorkflow {
  const positions = layoutNodes(agents.length);
  const nodes: Node[] = agents.map((agent, i) => {
    const meta = getAgentMetadata(agent.id);
    const nodeId = `${agent.id}-${Date.now()}-${i}`;
    const taskPrompt = generateTaskPrompt(agent.id, userPrompt);
    return {
      id: nodeId,
      type: "agentNode",
      position: positions[i],
      data: {
        label: `${meta.emoji} ${agent.name}`,
        subtitle: agent.description,
        model: "gpt-4o",
        temperature: 0.5,
        prompt: taskPrompt,
        // Critical: These fields are read by the DAG engine to execute agents
        role: agent.id,
        instruction: taskPrompt,
      },
    };
  });

  const nodeIds = nodes.map((n) => n.id);
  const agentIds = agents.map((a) => a.id);
  const edges = generateEdges(agentIds, nodeIds);

  return { name, nodes, edges };
}
