export interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: string;
}

export const defaultAgent: AgentInfo = {
  id: "ensemble",
  name: "Ensemble AI Assistant",
  emoji: "🤖",
  description: "Your default AI assistant for any task",
  category: "General",
};

export const availableAgents: AgentInfo[] = [
  defaultAgent
];
