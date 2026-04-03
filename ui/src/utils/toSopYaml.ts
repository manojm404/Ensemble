import yaml from 'js-yaml';

export function toSopYaml(nodes: any[], edges: any[]): string {
  const sop: any = {
    name: "Visual SOP Export",
    description: "Generated from Ensemble Studio Canvas",
    states: {}
  };

  // Build states
  nodes.forEach(node => {
    const stateName = node.data.label.toLowerCase().replace(/ /g, '_');
    
    // Find transitions for this node
    const outgoingEdges = edges.filter(e => e.source === node.id);
    const transitions = outgoingEdges.map(edge => {
      const targetNode = nodes.find(n => n.id === edge.target);
      return {
        to: targetNode?.data.label.toLowerCase().replace(/ /g, '_') || 'end',
        condition: "task_complete" // Default for V1 flat flows
      };
    });

    sop.states[stateName] = {
      role: node.data.role,
      instruction: node.data.instruction,
      tools: node.data.tools || [],
      transitions: transitions.length > 0 ? transitions : [{ to: "end", condition: "task_complete" }]
    };
  });

  // Add end state if not present but referred
  if (!sop.states['end']) {
    sop.states['end'] = {
      role: "System",
      instruction: "Process complete.",
      transitions: []
    };
  }

  return yaml.dump(sop, { indent: 2, lineWidth: -1 });
}
