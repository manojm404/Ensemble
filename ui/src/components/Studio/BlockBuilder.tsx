import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Panel,
  Background,
  Controls,
  Connection,
  Edge,
  useNodesState,
  useEdgesState,
  addEdge as rfAddEdge,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { StateNode } from './nodes/StateNode';
import { PropertyEditor } from './PropertyEditor.tsx';
import { toSopYaml } from '../../utils/toSopYaml';
import { Plus, Zap, CheckCircle, Wand2, Loader2, Save, Search, FolderOpen, X } from 'lucide-react';

const nodeTypes = {
  stateNode: StateNode as any,
};

const initialNodes = [
  {
    id: '1',
    type: 'stateNode',
    data: { label: 'Discovery', role: 'CEO', instruction: 'Analyze requirements', tools: [] },
    position: { x: 250, y: 5 },
  },
];

const initialEdges: Edge[] = [];

export function BlockBuilder() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [magicPrompt, setMagicPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('New Workflow');
  const [showBrowser, setShowBrowser] = useState(false);
  const [savedWorkflows, setSavedWorkflows] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const { fitView } = useReactFlow();

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => rfAddEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    setSelectedNodeId(node.id);
  }, []);

  const addNode = () => {
    const id = `${nodes.length + 1}`;
    const newNode = {
      id,
      type: 'stateNode',
      data: { label: `State ${id}`, role: 'Unassigned', instruction: '', tools: [] },
      position: { x: Math.random() * 400, y: Math.random() * 400 },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const updateNodeData = (nodeId: string, newData: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, ...newData } };
        }
        return node;
      })
    );
  };

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId]
  );

  const handleSave = async () => {
    const name = prompt("Enter workflow name:", workflowId ? workflowName : "My Workflow");
    if (!name) return;

    try {
      const res = await fetch('http://localhost:8088/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: workflowId,
          name: name,
          graph_json: JSON.stringify({ nodes, edges })
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setWorkflowId(data.id);
        setWorkflowName(name);
        alert("Workflow saved successfully! 💾");
      }
    } catch (e) {
      alert(`Save failed: ${e}`);
    }
  };

  const fetchWorkflows = async () => {
    try {
      const res = await fetch(`http://localhost:8088/api/workflows${searchQuery ? `?search=${searchQuery}` : ''}`);
      const data = await res.json();
      setSavedWorkflows(data);
    } catch (e) {
      console.error("Fetch workflows failed:", e);
    }
  };

  useEffect(() => {
    if (showBrowser) fetchWorkflows();
  }, [showBrowser, searchQuery]);

  const loadWorkflow = (wf: any) => {
    try {
      const graph = JSON.parse(wf.graph_json);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setWorkflowId(wf.id);
      setWorkflowName(wf.name);
      setShowBrowser(false);
      setTimeout(() => fitView({ duration: 800 }), 100);
    } catch (e) {
      alert(`Load failed: ${e}`);
    }
  };

  const handleValidate = async () => {
    const yamlStr = toSopYaml(nodes, edges);
    try {
      const res = await fetch('http://localhost:8088/sop/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: yamlStr })
      });
      const result = await res.json();
      if (result.valid) {
        alert("SOP is valid! ✅");
      } else {
        alert(`SOP Invalid ❌: \n${result.errors.join('\n')}`);
      }
    } catch (e) {
      alert(`Validation error: ${e}`);
    }
  };

  const handleMagicGenerate = async () => {
    if (!magicPrompt.trim()) {
      alert("Please enter a description for the magic generation.");
      return;
    }
    
    setIsGenerating(true);
    try {
      const res = await fetch('http://127.0.0.1:8088/sop/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: magicPrompt })
      });
      
      if (!res.ok) throw new Error("Generation failed");
      
      const data = await res.json();
      
      // Transform backend nodes to React Flow format
      const newNodes = data.nodes.map((n: any) => ({
        id: n.id,
        type: 'stateNode',
        position: { x: n.x || 100, y: n.y || 100 },
        data: {
          label: n.label,
          role: n.role,
          instruction: n.instruction,
          tools: []
        }
      }));
      
      const newEdges = data.edges.map((e: any) => ({
        id: e.id || `e${e.source}-${e.target}`,
        source: e.source,
        target: e.target
      }));
      
      setNodes(newNodes);
      setEdges(newEdges);
      setMagicPrompt('');
      
      // Allow time for DOM to update before fitting view
      setTimeout(() => fitView({ duration: 800 }), 100);
      
    } catch (e) {
      alert(`Magic Generation failed 🪄: ${e}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRun = async () => {
    const yamlStr = toSopYaml(nodes, edges);
    try {
      // 1. Validate first
      const valRes = await fetch('http://127.0.0.1:8088/sop/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: yamlStr })
      });
      const valResult = await valRes.json();
      if (!valResult.valid) {
        alert(`Cannot run invalid SOP ❌: \n${valResult.errors.join('\n')}`);
        return;
      }

      // 2. Save to a temporary directive file (for now) or just run directly
      const runRes = await fetch('http://127.0.0.1:8088/sop/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sop_path: 'directives/visual_run_temp.yaml', yaml: yamlStr })
      });
      const runResult = await runRes.json();
      alert(`SOP Execution Started 🚀 (Run ID: ${runResult.run_id})\n\nSwitch to the CHAT tab to see the agent network's neural process in real-time.`);
    } catch (e) {
      alert(`Execution error: ${e}`);
    }
  };

  return (
    <div className="flex flex-1 h-full w-full relative bg-[#1a1a1a]">
      <div className="flex-1 h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
        >
          <Background color="#333" />
          <Controls />
          <Panel position="top-left" className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button 
                onClick={addNode}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center gap-2 shadow-lg font-bold text-xs"
              >
                <Plus size={16} /> ADD STATE
              </button>
              <button 
                onClick={() => setShowBrowser(true)}
                className="px-4 py-2 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-gray-200 border border-gray-700 rounded-md flex items-center gap-2 shadow-lg font-bold text-xs"
                title="Open Workflow"
              >
                <FolderOpen size={16} /> OPEN
              </button>
              <button 
                onClick={handleSave}
                className="px-4 py-2 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-gray-200 border border-gray-700 rounded-md flex items-center gap-2 shadow-lg font-bold text-xs"
                title="Save Workflow"
              >
                <Save size={16} /> SAVE
              </button>
              <button 
                onClick={handleValidate}
                className="px-4 py-2 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-gray-200 border border-gray-700 rounded-md flex items-center gap-2 shadow-lg font-bold text-xs"
              >
                <CheckCircle size={16} /> VALIDATE
              </button>
              <button 
                onClick={handleRun}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md flex items-center gap-2 shadow-lg font-bold text-xs"
              >
                <Zap size={16} /> BUILD & RUN
              </button>
            </div>
            
            <div className="flex gap-1 mt-2 bg-[#2d2d2d] p-1 rounded-lg border border-gray-700 shadow-xl w-[400px]">
              <input 
                type="text"
                placeholder="Describe your workflow..."
                value={magicPrompt}
                onChange={(e) => setMagicPrompt(e.target.value)}
                className="flex-1 bg-transparent border-none text-white text-xs px-3 focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleMagicGenerate()}
              />
              <button 
                onClick={handleMagicGenerate}
                disabled={isGenerating}
                className={`px-3 py-2 ${isGenerating ? 'bg-gray-600' : 'bg-purple-600 hover:bg-purple-700'} text-white rounded-md flex items-center gap-2 font-bold text-[10px] uppercase transition-colors`}
              >
                <Wand2 size={14} /> {isGenerating ? 'GEN...' : 'Magic Generate'}
              </button>
            </div>
          </Panel>

          {showBrowser && (
            <div className="absolute top-0 right-0 w-80 h-full bg-[#1a1a1a] border-l border-gray-800 z-[100] flex flex-col shadow-2xl transition-all animate-in slide-in-from-right duration-300">
               <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                  <h3 className="text-sm font-black text-gray-200 uppercase tracking-widest">Workflow Browser</h3>
                  <button onClick={() => setShowBrowser(false)} className="text-gray-500 hover:text-white">
                    <X size={20} />
                  </button>
               </div>
               <div className="p-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                    <input 
                      type="text"
                      placeholder="Search workflows..."
                      className="w-full bg-[#0f0f0f] border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
               </div>
               <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {savedWorkflows.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-xs italic">No workflows found.</div>
                  ) : (
                    savedWorkflows.map(wf => (
                      <button 
                        key={wf.id}
                        onClick={() => loadWorkflow(wf)}
                        className="w-full text-left p-3 rounded-lg hover:bg-[#2d2d2d] border border-transparent hover:border-gray-700 transition-all group"
                      >
                        <div className="text-xs font-bold text-gray-300 group-hover:text-blue-400">{wf.name}</div>
                        <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-tighter">Updated: {new Date(wf.updated_at).toLocaleDateString()}</div>
                      </button>
                    ))
                  )}
               </div>
            </div>
          )}

          {isGenerating && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-all animate-in fade-in duration-300">
              <div className="bg-[#2d2d2d] border border-purple-500/50 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
                <Loader2 size={48} className="text-purple-500 animate-spin" />
                <div className="flex flex-col items-center">
                  <span className="text-white font-black tracking-widest uppercase text-sm">Ensemble Architect</span>
                  <span className="text-gray-400 text-xs mt-1 italic">Synthesizing workflow from neural prompt...</span>
                </div>
              </div>
            </div>
          )}
        </ReactFlow>
      </div>

      {selectedNode && (
        <PropertyEditor 
          node={selectedNode} 
          onUpdate={(data: any) => updateNodeData(selectedNode.id, data)}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}
