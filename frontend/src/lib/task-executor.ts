/**
 * task-executor.ts — Executes company issues via the backend LLM
 * 
 * When an issue is triggered (manual or scheduled):
 * 1. Gets the assigned agent's role/model
 * 2. Calls the backend LLM with the agent's role as system context
 * 3. Saves the output to the issue
 * 4. Updates activity feed
 */

import { updateIssueStatus, addActivityEvent, getCompanyAgentById, setIssueOutput } from "./company-data";
import { fetchApi } from "./api";

export interface TaskExecutionResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Execute a single issue/task via the backend LLM.
 * The agent's role is used as the system prompt context.
 */
export async function runTask(
  companyId: string,
  issueId: string,
  agentId: string,
  taskTitle: string,
  taskDescription?: string
): Promise<TaskExecutionResult> {
  try {
    // Update issue status to running
    updateIssueStatus(companyId, issueId, "in_progress");

    // Get agent details to pass role context to backend
    const agent = getCompanyAgentById(agentId);
    const agentRole = agent?.role || "General Assistant";
    const agentModel = agent?.model || "gemini-2.5-flash";

    // Call the backend LLM with the task and agent role context
    const response = await fetchApi('/api/chat/generate', {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `You are ${agent?.name || 'an agent'} acting as a ${agentRole}. Complete the following task thoroughly and professionally. Provide your answer directly without using any external tools or search functions.`
          },
          {
            role: "user",
            content: `${taskTitle}${taskDescription ? `\n\nDetails: ${taskDescription}` : ''}\n\nPlease complete this task thoroughly and provide the output as a direct text response.`
          }
        ],
        model: agentModel,
        provider: agentModel.includes("ollama") || agentModel.includes("llama") ? "ollama" : "gemini",
        use_skills: false
      })
    });

    const output = response.text || "Task completed with no output.";

    // Save output and update status
    setIssueOutput(companyId, issueId, output);
    updateIssueStatus(companyId, issueId, "completed");

    return {
      success: true,
      output
    };
  } catch (error: any) {
    console.error(`❌ Task execution failed: ${error.message}`);

    updateIssueStatus(companyId, issueId, "failed");

    return {
      success: false,
      output: "",
      error: error.message
    };
  }
}
