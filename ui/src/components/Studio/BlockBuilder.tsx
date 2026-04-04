import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Panel,
  Background,
  Controls,
  Connection,
  addEdge as rfAddEdge,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useYjsSync } from '../../hooks/useYjsSync';
import { PresenceOverlay } from './PresenceOverlay';

import { StateNode } from './nodes/StateNode';
import { ApprovalNode } from './nodes/ApprovalNode';
import { SwitchNode } from './nodes/SwitchNode';
import { PropertyEditor } from './PropertyEditor.tsx';
import { ViewerPane } from './ViewerPane.tsx';
import { AgentLibrary } from './AgentLibrary.tsx';
import { TimeMachineControl } from './TimeMachineControl.tsx';
import { toSopYaml } from '../../utils/toSopYaml';
import { Zap, CheckCircle, Wand2, Loader2, Save, Search, FolderOpen, X, MonitorPlay, History, Brain, RefreshCw, ShoppingCart, Package, ShieldCheck } from 'lucide-react';
import { MacroMarketplace } from './MacroMarketplace';
import { PermissionEditor } from './PermissionEditor';

const nodeTypes = {
  stateNode: StateNode as any,
  approvalNode: ApprovalNode as any,
  switchNode: SwitchNode as any,
  macroNode: StateNode as any, // Visual identical for now, logic differs in engine
};

// Initial nodes and edges are no longer used as state is managed by Yjs

export function BlockBuilder() {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  
  const { 
    nodes, 
    edges, 
    onNodesChange, 
    onEdgesChange, 
    users, 
    updateCursor,
    setNodes,
    setEdges,
    resyncFromSource
  } = useYjsSync(workflowId);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [magicPrompt, setMagicPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [workflowName, setWorkflowName] = useState('New Workflow');
  const [showBrowser, setShowBrowser] = useState(false);
  const [savedWorkflows, setSavedWorkflows] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Tactical Viewer State
  const [runId, setRunId] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [showTimeMachine, setShowTimeMachine] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(true);
  const [isMarketplaceOpen, setIsMarketplaceOpen] = useState(false);
  const [isGovernanceOpen, setIsGovernanceOpen] = useState(false);

  const { fitView } = useReactFlow();

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => rfAddEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    setSelectedNodeId(node.id);
  }, []);

  const addNode = (type: 'stateNode' | 'approvalNode' | 'switchNode' = 'stateNode', skill?: any) => {
    const id = `${nodes.length + 1}`;
    const newNode = {
      id,
      type,
      data: { 
        label: skill ? skill.name : `${type === 'stateNode' ? 'State' : type === 'approvalNode' ? 'Gate' : 'Branch'} ${id}`, 
        role: skill ? skill.name : (type === 'stateNode' ? 'Unassigned' : 'System'), 
        instruction: skill ? skill.prompt_text : '', 
        tools: skill ? skill.tools : [],
        condition: type === 'switchNode' ? 'If output contains "ERROR" -> case1' : '',
        emoji: skill ? skill.emoji : undefined,
        color: skill ? skill.color : undefined
      },
      position: { x: 400, y: 100 },
    };
    setNodes((nds) => nds.concat(newNode));
    setTimeout(() => fitView({ duration: 800 }), 100);
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

  const handleCollapseToMacro = async () => {
    const selectedNodes = nodes.filter(n => n.selected);
    if (selectedNodes.length === 0) {
      alert("Please select the nodes you want to collapse into a macro.");
      return;
    }

    const macroName = prompt("Enter Macro Name:", "New Macro");
    if (!macroName) return;

    // 1. Extract sub-graph (nodes + connecting edges)
    const nodeIds = new Set(selectedNodes.map(n => n.id));
    const selectedEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

    // 2. Normalize coordinates (Set top-left node as 0,0)
    const minX = Math.min(...selectedNodes.map(n => n.position.x));
    const minY = Math.min(...selectedNodes.map(n => n.position.y));

    const normalizedNodes = selectedNodes.map(n => ({
      ...n,
      position: { x: n.position.x - minX, y: n.position.y - minY }
    }));

    // 3. Register Macro in Backend
    try {
      const res = await fetch('http://localhost:8088/api/macros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: macroName,
          graph_json: { nodes: normalizedNodes, edges: selectedEdges },
          author: 'developer'
        })
      });
      const data = await res.json();
      
      if (data.status === 'registered') {
        const macroId = data.macro_id;
        
        // 4. Replace selected nodes with a single Macro Node
        const newNode = {
          id: `macro_${Math.random().toString(36).substr(2, 6)}`,
          type: 'macroNode',
          position: { x: minX, y: minY },
          data: { 
            label: macroName.toUpperCase(), 
            macro_id: macroId,
            version: 'latest'
          }
        };

        setNodes(nds => nds.filter(n => !n.selected).concat(newNode));
        setEdges(eds => eds.filter(e => !nodeIds.has(e.source) || !nodeIds.has(e.target)));
        
        alert(`Macro '${macroName}' created and integrated! 📦`);
      }
    } catch (e) {
      alert(`Macro creation failed: ${e}`);
    }
  };

  const handleResync = async () => {
    if (!workflowId) return;
    try {
      const res = await fetch(`http://localhost:8088/workflows/${workflowId}`);
      const wf = await res.json();
      const graph = JSON.parse(wf.graph_json);
      resyncFromSource(graph.nodes, graph.edges);
      alert("Canvas re-synced from source of truth! 🔄");
    } catch (e) {
      alert(`Resync failed: ${e}`);
    }
  };

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

  const handleInstallMacro = (macro: any) => {
    const newNode = {
      id: `macro_${Math.random().toString(36).substr(2, 6)}`,
      type: 'macroNode',
      position: { x: 400, y: 100 },
      data: { 
        label: macro.name.toUpperCase(), 
        macro_id: macro.id,
        version: 'latest'
      }
    };
    setNodes(nds => nds.concat(newNode));
    setIsMarketplaceOpen(false);
    setTimeout(() => fitView({ duration: 800 }), 100);
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
      setRunId(runResult.run_id);
      setIsViewerOpen(true);
      // alert(`SOP Execution Started 🚀 (Run ID: ${runResult.run_id})\n\nSwitch to the CHAT tab to see the agent network's neural process in real-time.`);
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
          onMouseMove={(e) => updateCursor(e.clientX, e.clientY)}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
        >
          <PresenceOverlay users={users} />
          <MacroMarketplace 
            isOpen={isMarketplaceOpen} 
            onToggle={() => setIsMarketplaceOpen(false)}
            onInstallMacro={handleInstallMacro}
          />
          <PermissionEditor 
            isOpen={isGovernanceOpen}
            onClose={() => setIsGovernanceOpen(false)}
          />
          <Background color="#333" />
          <Controls />
          <Panel position="top-left" className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button 
                onClick={() => setIsLibraryOpen(!isLibraryOpen)}
                className={`px-4 py-2 ${isLibraryOpen ? 'bg-blue-600 text-white' : 'bg-[#2d2d2d] text-gray-200 border border-gray-700'} rounded-md flex items-center gap-2 shadow-lg font-bold text-xs transition-all`}
              >
                <Brain size={16} /> AGENTS
              </button>
              <button 
                onClick={handleCollapseToMacro}
                className="px-4 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white border border-purple-900 rounded-md flex items-center gap-2 shadow-lg font-bold text-xs"
                title="Collapse Selection to Macro"
              >
                <MonitorPlay size={16} /> COLLAPSE
              </button>
              <button 
                onClick={() => setIsMarketplaceOpen(!isMarketplaceOpen)}
                className={`px-4 py-2 ${isMarketplaceOpen ? 'bg-purple-600 text-white' : 'bg-[#2d2d2d] text-gray-200 border border-gray-700'} rounded-md flex items-center gap-2 shadow-lg font-bold text-xs transition-all`}
                title="Macro Marketplace"
              >
                <ShoppingCart size={16} /> MARKETPLACE
              </button>
              <button 
                onClick={() => setIsGovernanceOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center gap-2 shadow-lg font-bold text-xs"
              >
                <ShieldCheck size={16} /> GOVERNANCE
              </button>
              <button 
                onClick={() => addNode('switchNode')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md flex items-center gap-2 shadow-lg font-bold text-xs"
              >
                <Zap size={16} /> ADD SWITCH
              </button>
              <button 
                onClick={() => addNode('approvalNode')}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-md flex items-center gap-2 shadow-lg font-bold text-xs"
              >
                <CheckCircle size={16} /> ADD GATE
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
                onClick={handleResync}
                className="px-4 py-2 bg-[#dc2626] hover:bg-red-700 text-white border border-red-900 rounded-md flex items-center gap-2 shadow-lg font-bold text-xs"
                title="Force Re-sync (Emergency)"
              >
                <RefreshCw size={16} /> RESYNC
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
              <button 
                onClick={() => setIsViewerOpen(!isViewerOpen)}
                className={`px-4 py-2 ${isViewerOpen ? 'bg-blue-600 text-white' : 'bg-[#2d2d2d] text-gray-200 border border-gray-700'} rounded-md flex items-center gap-2 shadow-lg font-bold text-xs transition-all`}
                title="Tactical Workspace Viewer"
              >
                <MonitorPlay size={16} /> VIEW
              </button>

              {runId && (
                <button 
                  onClick={() => setShowTimeMachine(!showTimeMachine)}
                  className={`px-4 py-2 ${showTimeMachine ? 'bg-blue-600 text-white' : 'bg-[#2d2d2d] text-gray-200 border border-gray-700'} rounded-md flex items-center gap-2 shadow-lg font-bold text-xs transition-all`}
                  title="Temporal Observation"
                >
                  <History size={16} /> TIME MACHINE
                </button>
              )}
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

      <AgentLibrary 
        isOpen={isLibraryOpen} 
        onToggle={() => setIsLibraryOpen(false)} 
        onAddAgent={(skill) => addNode('stateNode', skill)} 
      />

      {selectedNode && (
        <PropertyEditor 
          node={selectedNode} 
          onUpdate={(data: any) => updateNodeData(selectedNode.id, data)}
          onClose={() => setSelectedNodeId(null)}
        />
      )}

      <ViewerPane 
        runId={runId || ""} 
        isOpen={isViewerOpen} 
        onClose={() => setIsViewerOpen(false)} 
      />

      {runId && showTimeMachine && (
        <TimeMachineControl 
          runId={runId}
          onClose={() => setShowTimeMachine(false)}
        />
      )}
    </div>
  );
}
