import { Handle, Position, NodeProps, useReactFlow } from '@xyflow/react';
import { Layers, X } from 'lucide-react';

interface StateNodeData {
  label: string;
  role?: string;
  instruction?: string;
  tools?: string[];
}

export function StateNode({ id, data }: NodeProps<any>) {
  const nodeData = data as StateNodeData;
  const { setNodes } = useReactFlow();

  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((nds) => nds.filter((node) => node.id !== id));
  };

  return (
    <div className={`min-w-[220px] px-4 py-3 rounded-xl border-2 shadow-2xl bg-[#1a1a1a]/95 backdrop-blur-xl transition-all relative group ${data.selected ? 'border-blue-500' : 'border-gray-800'}`}>
      
      {/* Delete Button - X mark */}
      <button 
        onClick={onDelete}
        className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all z-50 border-2 border-[#121212]"
      >
        <X size={12} />
      </button>

      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-blue-600" />
      
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-900/40 rounded-lg text-blue-400 border border-blue-500/20">
          <Layers size={18} />
        </div>
        <div className="flex flex-col">
          <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest leading-none mb-1">State Config</div>
          <div className="text-sm font-bold text-gray-200">{nodeData.label || 'New State'}</div>
          <div className="text-[10px] text-blue-400 font-mono italic mt-1 uppercase tracking-tighter">@{nodeData.role || 'Unassigned'}</div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-blue-600" />
    </div>
  );
}
