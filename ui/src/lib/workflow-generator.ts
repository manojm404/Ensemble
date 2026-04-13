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
  "marketing-marketing-content-creator": ["copy", "marketing", "content", "blog", "email", "seo", "social media", "ad", "campaign", "landing page", "article", "write", "post", "publish", "copywriting", "editorial"],
  "engineering-engineering-devops-automator": ["deploy", "ci/cd", "pipeline", "devops", "docker", "kubernetes", "cloud", "aws", "server", "hosting"],
  "product-product-manager": ["strategy", "business", "plan", "roadmap", "market", "competitor", "growth", "product", "pricing"],
  "design-design-visual-storyteller": ["illustration", "icon", "visual", "asset", "graphic", "image", "banner", "logo", "brand"],
  "game-development-narrative-designer": ["story", "narrative", "creative", "writing", "fiction", "script", "scenario", "persona"],
};

// Keyword mapping for blog/content creation roles
const roleKeywords: Record<string, string[]> = {
  "research_agent": ["research", "web research", "search", "gather", "statistics", "data collection", "source", "cite", "find"],
  "outline_agent": ["outline", "structure", "organize", "content strategist", "planning", "h1", "h2", "h3", "heading", "section"],
  "writing_agent": ["write", "draft", "compose", "author", "copy", "content", "blog post", "article", "prose", "narrative"],
  "editor_agent": ["edit", "review", "polish", "proofread", "grammar", "readability", "quality", "fact-check", "seo meta"],
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
  // Also check role keywords for custom agent roles
  const roleKw = roleKeywords[agentId] || [];
  for (const kw of roleKw) {
    if (promptLower.includes(kw)) {
      score += kw.length * 2; // Higher weight for role-specific matches
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

// ─── Task-intent → agent inference ───────────────────────────────────────
// Maps task keywords to sensible default agent teams
const intentAgents: Record<string, { name: string; instruction: string; emoji: string }[]> = {
  poem: [
    { name: "Poet", instruction: "Write creative, evocative poetry with vivid imagery, rhythm, and emotion. Avoid clichés.", emoji: "🪶" },
    { name: "Poetry Editor", instruction: "Review and polish the poem for meter, rhyme, imagery, word choice, and emotional impact.", emoji: "✏️" },
    { name: "Subject Researcher", instruction: "Research the poem's subject for authentic details, facts, and references.", emoji: "📚" },
  ],
  blog: [
    { name: "Research Agent", instruction: "Conduct thorough web research on the assigned topic. Gather facts, statistics, quotes, and sources.", emoji: "🔍" },
    { name: "Content Strategist", instruction: "Create a detailed, SEO-friendly blog outline with logical section flow and content mapping.", emoji: "📋" },
    { name: "Blog Writer", instruction: "Write a complete, engaging blog post following the outline. Use a natural, conversational tone.", emoji: "✍️" },
    { name: "Editor", instruction: "Review and polish the blog post for clarity, grammar, SEO, readability, and fact accuracy.", emoji: "📝" },
  ],
  code: [
    { name: "Developer", instruction: "Write clean, well-structured, production-quality code following best practices.", emoji: "💻" },
    { name: "Code Reviewer", instruction: "Review the code for bugs, security issues, performance, and code quality. Suggest improvements.", emoji: "🔬" },
    { name: "Tester", instruction: "Write comprehensive test cases covering normal flow, edge cases, and error handling.", emoji: "🧪" },
  ],
  research: [
    { name: "Researcher", instruction: "Conduct thorough research on the topic. Gather facts, data, expert opinions, and current trends.", emoji: "🔍" },
    { name: "Analyst", instruction: "Analyze the research findings. Identify patterns, insights, contradictions, and implications.", emoji: "📊" },
    { name: "Report Writer", instruction: "Write a polished research report with executive summary, findings, analysis, and recommendations.", emoji: "📝" },
  ],
  design: [
    { name: "UI Designer", instruction: "Design a beautiful, intuitive user interface with attention to layout, typography, and color.", emoji: "🎨" },
    { name: "UX Researcher", instruction: "Research user needs, pain points, and behaviors. Provide UX recommendations.", emoji: "🧠" },
    { name: "Frontend Developer", instruction: "Implement the UI design as clean, responsive HTML/CSS/JS code.", emoji: "💻" },
  ],
  marketing: [
    { name: "Strategist", instruction: "Develop a comprehensive marketing strategy including target audience, channels, and messaging.", emoji: "🧠" },
    { name: "Copywriter", instruction: "Write compelling marketing copy for campaigns, ads, or landing pages.", emoji: "✍️" },
    { name: "Analyst", instruction: "Analyze campaign performance metrics and provide data-driven optimization recommendations.", emoji: "📊" },
  ],
  video: [
    { name: "Script Writer", instruction: "Write an engaging video script with hook, body, and call-to-action.", emoji: "📝" },
    { name: "Video Editor", instruction: "Plan video editing including transitions, effects, pacing, music, and visual enhancements.", emoji: "🎬" },
  ],
  default: [
    { name: "Planner", instruction: "Break down the task into clear, actionable steps. Create a structured plan.", emoji: "📋" },
    { name: "Executor", instruction: "Execute the plan thoroughly and produce high-quality deliverables.", emoji: "⚡" },
    { name: "Reviewer", instruction: "Review the output for quality, accuracy, completeness, and suggest improvements.", emoji: "🔍" },
  ],
};

// ─── Agent count parser ──────────────────────────────────────────────────
function parseAgentCount(prompt: string): number | null {
  const m = prompt.match(/(?:use|exactly|with|create|make|need|want)\s+(?:exactly\s+)?(\d+)\s+agent/i);
  return m ? parseInt(m[1], 10) : null;
}

// ─── Intent detection ────────────────────────────────────────────────────
function detectIntent(promptLower: string): string {
  const intentMap: Record<string, string[]> = {
    poem: ["poem", "poetry", "verse", "sonnet", "haiku", "rhyme", "write a poem"],
    blog: ["blog", "article", "post", "write a blog", "blog post", "content creation"],
    code: ["code", "develop", "software", "app", "program", "function", "api", "website", "html", "css", "javascript", "python"],
    research: ["research", "analyze", "report", "study", "investigate", "survey"],
    design: ["design", "ui", "ux", "interface", "frontend", "layout", "mockup", "wireframe"],
    marketing: ["marketing", "campaign", "ad", "seo", "social media", "email marketing", "growth"],
    video: ["video", "script", "youtube", "reel", "shorts"],
  };
  for (const [intent, keywords] of Object.entries(intentMap)) {
    if (keywords.some(kw => promptLower.includes(kw))) return intent;
  }
  return "default";
}

// Extracts custom agent roles from user prompt by detecting patterns like "Agent X: description" or inferring from task intent
function extractCustomAgentsFromPrompt(prompt: string, maxCount?: number): AgentSkill[] {
  const agents: AgentSkill[] = [];
  const emojis = ['🔍', '📝', '✍️', '📋', '🎯', '🔬', '📊', '💡', '🛠️', '⚙️', '🪶', '✏️', '📚', '💻', '🎨', '🧠', '🎬'];
  let emojiIndex = 0;

  // ── Phase 1: Explicit agent definitions ────────────────────────────────
  // Pattern: "**Agent 1: Research Agent (Web Researcher)**"
  const agentPattern = /\*\*Agent\s+\d+:\s*([^(*]+?)(?:\s*\([^)]*\))?\*\*/g;
  const simplePattern = /Agent\s+\d+:\s*([^\n-]+)/g;
  const foundAgents = new Set<string>();
  let match;

  while ((match = agentPattern.exec(prompt)) !== null) {
    const name = match[1].trim();
    if (name && !foundAgents.has(name)) {
      foundAgents.add(name);
      agents.push({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, ''),
        name,
        description: `Custom agent for ${name.toLowerCase()}`,
        emoji: emojis[emojiIndex % emojis.length],
        category: "Custom",
        enabled: true,
        is_custom: true,
      });
      emojiIndex++;
    }
  }

  if (agents.length === 0) {
    while ((match = simplePattern.exec(prompt)) !== null) {
      const name = match[1].trim().split('\n')[0];
      if (name && !foundAgents.has(name)) {
        foundAgents.add(name);
        agents.push({
          id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, ''),
          name,
          description: `Custom agent for ${name.toLowerCase()}`,
          emoji: emojis[emojiIndex % emojis.length],
          category: "Custom",
          enabled: true,
          is_custom: true,
        });
        emojiIndex++;
      }
    }
  }

  // ── Phase 2: Keyword-based role inference ──────────────────────────────
  if (agents.length === 0) {
    const promptLower = prompt.toLowerCase();
    const intent = detectIntent(promptLower);
    const team = intentAgents[intent] || intentAgents.default;

    // Apply maxCount limit if specified
    const count = maxCount ? Math.min(maxCount, team.length) : team.length;
    for (let i = 0; i < count; i++) {
      const a = team[i];
      agents.push({
        id: a.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        name: a.name,
        instruction: a.instruction,
        description: `Specialized ${a.name.toLowerCase()} for this task`,
        emoji: a.emoji,
        category: "Custom",
        enabled: true,
        is_custom: true,
      });
    }
  }

  // ── Phase 3: Fallback to roleKeywords mapping ──────────────────────────
  if (agents.length === 0) {
    const promptLower = prompt.toLowerCase();
    for (const [roleId, keywords] of Object.entries(roleKeywords)) {
      if (keywords.some(kw => promptLower.includes(kw))) {
        const roleName = roleId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        agents.push({
          id: roleId,
          name: roleName,
          description: `Custom agent for ${roleName.toLowerCase()}`,
          emoji: emojis[emojiIndex % emojis.length],
          category: "Custom",
          enabled: true,
          is_custom: true,
        });
        emojiIndex++;
      }
    }
  }

  return agents;
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
  const requestedCount = parseAgentCount(prompt);

  // 1. PRIORITY: Extract or infer custom agents from the user's prompt
  const customAgents = extractCustomAgentsFromPrompt(prompt, requestedCount || undefined);
  if (customAgents.length >= 2) {
    console.log(`✅ [Workflow Generator] Using ${customAgents.length} custom agents from prompt:`, customAgents.map(a => a.name).join(", "));
    return buildWorkflow(
      prompt.split(/\s+/).slice(0, 4).join(" "),
      customAgents,
      prompt
    );
  }

  // 2. If registry is empty, skip unreliable API — use synthetic agents
  if (allAgents.length === 0) {
    const count = requestedCount || 2;
    const synthetic: AgentSkill[] = [
      { id: "synth-planner", name: "Task Planner", description: "Plans and organizes the workflow", emoji: "📋", category: "General", enabled: true, is_native: true },
      { id: "synth-executor", name: "Task Executor", description: "Executes the planned tasks", emoji: "⚡", category: "General", enabled: true, is_native: true },
    ];
    console.log(`⚠️ [Workflow Generator] Registry empty, using ${Math.min(count, synthetic.length)} synthetic agents`);
    return buildWorkflow(
      prompt.split(/\s+/).slice(0, 4).join(" "),
      synthetic.slice(0, count),
      prompt
    );
  }

  // 3. Try backend API (only when registry has agents)
  try {
    const apiResult = await generateWorkflowAPI(prompt);
    if (apiResult && Array.isArray(apiResult.nodes) && apiResult.nodes.length > 0 && Array.isArray(apiResult.edges) && apiResult.edges.length > 0) {
       return {
         name: apiResult.name || prompt.split(/\s+/).slice(0, 4).join(" "),
         nodes: apiResult.nodes,
         edges: apiResult.edges
       };
    }
  } catch (e) {
    console.warn("Failed to generate workflow via API, falling back to local generation", e);
  }

  // 4. Check for template matches
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

  // 3. Score all agents and pick the top relevant ones
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

  // 4. If still fewer than 2, pick from categories matching prompt keywords
  if (selectedAgents.length < 2 && allAgents.length > 0) {
    const categoryKeywords: Record<string, string[]> = {
      content: ["content", "blog", "article", "write", "post", "publish", "copy"],
      research: ["research", "search", "analyze", "data", "report", "study"],
      engineering: ["code", "develop", "build", "software", "app", "engineer", "program"],
      testing: ["test", "qa", "quality", "verify", "bug", "debug"],
      design: ["design", "ui", "ux", "interface", "visual", "frontend"],
      marketing: ["marketing", "seo", "campaign", "social", "email", "growth"],
      strategy: ["strategy", "plan", "manage", "coordinate", "orchestrate"],
      data: ["data", "analytics", "ml", "machine learning", "prediction"],
      devops: ["deploy", "infrastructure", "ci/cd", "pipeline", "cloud", "server"],
      security: ["security", "vulnerability", "audit", "compliance", "threat"],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (selectedAgents.length >= 3) break;
      if (keywords.some(kw => promptLower.includes(kw))) {
        const categoryAgents = allAgents.filter(a =>
          a.category?.toLowerCase().includes(category) &&
          !selectedAgents.find(s => s.id === a.id)
        );
        for (const agent of categoryAgents.slice(0, 3 - selectedAgents.length)) {
          selectedAgents.push(agent);
        }
      }
    }
  }

  // 5. If STILL no agents, pick first available from registry
  if (selectedAgents.length < 2 && allAgents.length > 0) {
    for (const agent of allAgents) {
      if (!selectedAgents.find(s => s.id === agent.id)) {
        selectedAgents.push(agent);
        if (selectedAgents.length >= 3) break;
      }
    }
  }

  // 6. Last resort: create synthetic generic agents
  if (selectedAgents.length < 2) {
    const synthetic: AgentSkill[] = [
      { id: "synth-planner", name: "Task Planner", description: "Plans and organizes the workflow", emoji: "📋", category: "General", enabled: true, is_native: true },
      { id: "synth-executor", name: "Task Executor", description: "Executes the planned tasks", emoji: "⚡", category: "General", enabled: true, is_native: true },
    ];
    for (const s of synthetic) {
      if (selectedAgents.length < 2 && !selectedAgents.find((a) => a.id === s.id)) {
        selectedAgents.push(s);
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

    const isCustom = (agent as any).is_custom || agent.id.startsWith('synth-') || !agent.id.includes('-');
    const customInstruction = (agent as any).instruction;

    // Custom agents use their pre-defined instruction + full prompt context
    // Registered agents use the task-specific prompt map
    const taskPrompt = isCustom
      ? customInstruction
        ? `${customInstruction}\n\nYour specific task: ${userPrompt}`
        : `You are the ${agent.name}. Process this task: ${userPrompt}`
      : generateTaskPrompt(agent.id, userPrompt);

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
        is_custom: isCustom,
      },
    };
  });

  const nodeIds = nodes.map((n) => n.id);
  const agentIds = agents.map((a) => a.id);
  const edges = generateEdges(agentIds, nodeIds);

  return { name, nodes, edges };
}
