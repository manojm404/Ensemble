import type { Edge, Node } from "reactflow";

export interface WorkflowValidationIssue {
  severity: "error" | "warning";
  code: string;
  title: string;
  description: string;
  nodeIds?: string[];
}

export interface WorkflowValidationResult {
  isValid: boolean;
  errors: WorkflowValidationIssue[];
  warnings: WorkflowValidationIssue[];
  nodeCount: number;
  edgeCount: number;
  hasEvaluationStep: boolean;
  hasApprovalStep: boolean;
}

const getNodeLabel = (node: Node) => String(node?.data?.label || node?.data?.role || node?.id || "Agent");

const hasAnyTerm = (text: string, terms: string[]) => {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
};

const hasVerification = (node: Node) =>
  Array.isArray(node?.data?.verification_commands) && node.data.verification_commands.length > 0;

const hasApprovalMetadata = (node: Node) =>
  Boolean(node?.data?.approval_required || node?.data?.approvalReason || node?.data?.approval_policy);

export function validateWorkflowGraph(nodes: Node[], edges: Edge[]): WorkflowValidationResult {
  const errors: WorkflowValidationIssue[] = [];
  const warnings: WorkflowValidationIssue[] = [];
  const nodeCount = Array.isArray(nodes) ? nodes.length : 0;
  const edgeCount = Array.isArray(edges) ? edges.length : 0;
  const nodeIds = new Set((nodes || []).map((node) => node.id));

  if (nodeCount === 0) {
    errors.push({
      severity: "error",
      code: "empty_canvas",
      title: "Canvas is empty",
      description: "Add at least one agent node before running a workflow.",
    });
  }

  const duplicateIds = new Set<string>();
  nodes.forEach((node) => {
    const label = getNodeLabel(node);
    if (!node.data?.role || !String(node.data.role).trim()) {
      errors.push({
        severity: "error",
        code: "missing_role",
        title: `Missing role on ${label}`,
        description: "Each workflow step needs a role so the backend can load the correct skill.",
        nodeIds: [node.id],
      });
    }

    const instruction = String(node.data?.instruction || "").trim();
    if (!instruction) {
      errors.push({
        severity: "error",
        code: "missing_instruction",
        title: `Missing instruction on ${label}`,
        description: "Each step needs a system prompt or instruction before it can run.",
        nodeIds: [node.id],
      });
    }

    if (duplicateIds.has(node.id)) {
      errors.push({
        severity: "error",
        code: "duplicate_node",
        title: `Duplicate node id ${node.id}`,
        description: "Workflow node IDs must be unique.",
        nodeIds: [node.id],
      });
    }
    duplicateIds.add(node.id);
  });

  const invalidEdges = edges.filter((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target));
  invalidEdges.forEach((edge) => {
    errors.push({
      severity: "error",
      code: "invalid_edge",
      title: "Invalid connection",
      description: `Edge ${edge.id || `${edge.source}→${edge.target}`} points to a missing node.`,
      nodeIds: [edge.source, edge.target].filter(Boolean) as string[],
    });
  });

  if (nodeCount > 0) {
    const adjacency = new Map<string, string[]>();
    const indegree = new Map<string, number>();
    nodes.forEach((node) => {
      adjacency.set(node.id, []);
      indegree.set(node.id, 0);
    });
    edges.forEach((edge) => {
      if (adjacency.has(edge.source)) adjacency.get(edge.source)!.push(edge.target);
      indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
    });

    const queue = nodes.filter((node) => (indegree.get(node.id) || 0) === 0).map((node) => node.id);
    const visited: string[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      visited.push(current);
      for (const next of adjacency.get(current) || []) {
        const nextDegree = (indegree.get(next) || 0) - 1;
        indegree.set(next, nextDegree);
        if (nextDegree === 0) queue.push(next);
      }
    }

    if (visited.length !== nodeCount) {
      errors.push({
        severity: "error",
        code: "cycle_detected",
        title: "Workflow contains a cycle",
        description: "Remove the loop before running. The executor only accepts DAGs.",
      });
    }
  }

  const disconnectedNodes = nodes.filter((node) =>
    !edges.some((edge) => edge.source === node.id || edge.target === node.id)
  );
  if (disconnectedNodes.length > 0 && nodeCount > 1) {
    warnings.push({
      severity: "warning",
      code: "disconnected_nodes",
      title: "Some nodes are not connected",
      description: `${disconnectedNodes.length} node(s) do not have incoming or outgoing edges.`,
      nodeIds: disconnectedNodes.map((node) => node.id),
    });
  }

  const hasEvaluationStep = nodes.some((node) => {
    const text = `${getNodeLabel(node)} ${String(node.data?.subtitle || "")} ${String(node.data?.role || "")}`;
    return hasVerification(node) || hasAnyTerm(text, ["evaluation", "review", "qa", "test", "audit", "verify", "validate"]);
  });

  const hasApprovalStep = nodes.some((node) => {
    const text = `${getNodeLabel(node)} ${String(node.data?.subtitle || "")} ${String(node.data?.role || "")}`;
    return hasApprovalMetadata(node) || hasAnyTerm(text, ["approval", "gate", "review", "signoff", "sign-off"]);
  });

  if (!hasEvaluationStep && nodeCount > 0) {
    warnings.push({
      severity: "warning",
      code: "missing_evaluation",
      title: "No evaluation or verification step detected",
      description: "Release workflows should include a quality gate or verification step before completion.",
    });
  }

  if (!hasApprovalStep && nodeCount > 0) {
    warnings.push({
      severity: "warning",
      code: "missing_approval",
      title: "No approval gate detected",
      description: "If this workflow can trigger risky actions, consider adding an approval checkpoint.",
    });
  }

  if (nodeCount === 1) {
    warnings.push({
      severity: "warning",
      code: "single_node",
      title: "Single-step workflow",
      description: "Single-node workflows are allowed, but the product bible prefers explicit handoff stages for important work.",
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    nodeCount,
    edgeCount,
    hasEvaluationStep,
    hasApprovalStep,
  };
}
