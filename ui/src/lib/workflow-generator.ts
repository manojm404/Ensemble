import { type AgentSkill } from "@/lib/api";
import { getAgentMetadata } from "@/lib/agent-metadata";
import { generateWorkflowAPI } from "@/lib/api";
import type { Node, Edge } from "reactflow";

export interface GeneratedWorkflow {
  name: string;
  nodes: Node[];
  edges: Edge[];
  metadata?: Record<string, any>;
}

/**
 * Generates a workflow by calling the backend Architect AI.
 * This is the primary and only method for AI-driven workflow generation.
 * The backend is responsible for all intelligent planning and agent selection.
 *
 * @param prompt The user's high-level goal or mission.
 * @returns A promise that resolves to the generated workflow structure.
 */
export async function generateWorkflowFromPrompt(
  prompt: string,
  allAgents: AgentSkill[], // Kept for potential future use, but logic is backend-driven
  options?: { agentCount?: number; mode?: string; outputType?: string; maxCycles?: number; seed?: string; manualControl?: boolean }
): Promise<GeneratedWorkflow> {
  console.log("🪄 [Workflow Generator] Calling Master Architect AI on backend...");

  try {
    // The backend Architect AI is now the single source of truth for generation.
    const apiResult = await generateWorkflowAPI(prompt, 90000, options);

    if (!apiResult || !Array.isArray(apiResult.nodes) || apiResult.nodes.length === 0) {
      console.error("Master Architect AI returned an invalid or empty workflow.", apiResult);
      throw new Error("The AI Architect failed to generate a valid workflow. Please try a more specific prompt.");
    }

    console.log("✅ [Workflow Generator] Received workflow from Master Architect AI.");

    // The backend now provides a complete workflow structure.
    return {
      name: apiResult.name || prompt.split(/\s+/).slice(0, 4).join(" "),
      nodes: apiResult.nodes,
      edges: apiResult.edges || [],
      metadata: apiResult.metadata || {},
    };
  } catch (e: any) {
    console.error("Failed to generate workflow via Master Architect AI:", e);
    // Provide a user-friendly error message.
    throw new Error(e.message || "An unexpected error occurred while generating the workflow.");
  }
}
