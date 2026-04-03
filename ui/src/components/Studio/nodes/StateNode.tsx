import { Handle, Position, NodeProps } from '@xyflow/react';
import { Layers } from 'lucide-react';

interface StateNodeData {
  label: string;
  role?: string;
  instruction?: string;
  tools?: string[];
}

export function StateNode({ data }: NodeProps<any>) {
  const nodeData = data as StateNodeData;
  return (
    <div className={`px-4 py-3 rounded-lg border-2 shadow-xl bg-[#2d2d2d] transition-all ${data.selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-700'}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-blue-500" />
      
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-900/30 rounded text-blue-400">
          <Layers size={16} />
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest leading-none mb-1">State Config</div>
          <div className="text-sm font-bold text-gray-200">{nodeData.label || 'New State'}</div>
          <div className="text-[10px] text-blue-400 font-mono italic">{nodeData.role || 'Unassigned'}</div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-blue-500" />
    </div>
  );
}
