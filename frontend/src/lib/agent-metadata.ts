// Client-side defaults for agent emojis and categories

interface AgentMeta {
  emoji: string;
  category: string;
}

const metadataMap: Record<string, AgentMeta> = {
  codebot: { emoji: "🤖", category: "Programming" },
  testpilot: { emoji: "🧪", category: "Programming" },
  debugger: { emoji: "🐛", category: "Programming" },
  docwriter: { emoji: "📝", category: "Writing" },
  architect: { emoji: "🏗️", category: "Programming" },
  datasage: { emoji: "📊", category: "Analysis" },
  pixelpro: { emoji: "🎨", category: "Design" },
  copysmith: { emoji: "✍️", category: "Writing" },
  infrabot: { emoji: "⚙️", category: "DevOps" },
  strategist: { emoji: "🧠", category: "Analysis" },
  illustrator: { emoji: "🖌️", category: "Design" },
  storyteller: { emoji: "📖", category: "Writing" },
};

const defaultMeta: AgentMeta = { emoji: "🔧", category: "General" };

export function getAgentMetadata(agentId: string): AgentMeta {
  return metadataMap[agentId] || defaultMeta;
}

export const categoryColors: Record<string, string> = {
  Programming: "bg-badge-blue/20 text-badge-blue",
  Writing: "bg-badge-green/20 text-badge-green",
  Analysis: "bg-badge-purple/20 text-badge-purple",
  Design: "bg-badge-orange/20 text-badge-orange",
  DevOps: "bg-badge-red/20 text-badge-red",
  General: "bg-muted text-muted-foreground",
};
