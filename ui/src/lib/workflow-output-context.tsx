/**
 * workflow-output-context.tsx — Shared Workflow Output Store
 * 
 * Stores workflow execution results by ID so the full-width
 * WorkflowOutput page can access them after navigating away
 * from the canvas.
 * 
 * PRODUCTION-READY: Simple key-value store, no mock data.
 * 
 * DO NOT CHANGE:
 * - The WorkflowOutputData interface (WorkflowOutput page depends on it)
 * - The context provider wrapping pattern
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { WorkflowOutput } from "@/components/workflow/OutputViewer";

export interface WorkflowOutputData {
  /** Human-readable workflow name */
  title: string;
  /** The original task/prompt the user entered */
  task: string;
  /** Number of agents that executed */
  agentCount: number;
  /** The output data (markdown, files, previewUrl) */
  output: WorkflowOutput;
  /** Timestamp when execution completed */
  completedAt: Date;
}

interface WorkflowOutputContextType {
  /** Store output by workflow ID */
  setOutput: (id: string, data: WorkflowOutputData) => void;
  /** Retrieve output by workflow ID */
  getOutput: (id: string) => WorkflowOutputData | undefined;
}

const WorkflowOutputContext = createContext<WorkflowOutputContextType | null>(null);

export function useWorkflowOutput() {
  const ctx = useContext(WorkflowOutputContext);
  if (!ctx) throw new Error("useWorkflowOutput must be used within WorkflowOutputProvider");
  return ctx;
}

export function WorkflowOutputProvider({ children }: { children: ReactNode }) {
  const [outputs, setOutputs] = useState<Map<string, WorkflowOutputData>>(new Map());

  const setOutput = useCallback((id: string, data: WorkflowOutputData) => {
    setOutputs((prev) => {
      const next = new Map(prev);
      next.set(id, data);
      return next;
    });
  }, []);

  const getOutput = useCallback((id: string) => {
    return outputs.get(id);
  }, [outputs]);

  return (
    <WorkflowOutputContext.Provider value={{ setOutput, getOutput }}>
      {children}
    </WorkflowOutputContext.Provider>
  );
}
