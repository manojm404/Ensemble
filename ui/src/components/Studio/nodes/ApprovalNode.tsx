import React from 'react';
import { Handle, Position, NodeProps, useReactFlow } from '@xyflow/react';
import { Gavel, CheckCircle2, XCircle, Clock, X } from 'lucide-react';

interface ApprovalNodeData {
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'TIMEOUT';
  action: string;
  agentId: string;
}

export function ApprovalNode({ id, data }: NodeProps<any>) {
  const { setNodes } = useReactFlow();
  const nodeData = data as ApprovalNodeData;
  const isPending = nodeData.status === 'PENDING';
  const isApproved = nodeData.status === 'APPROVED';
  const isDenied = nodeData.status === 'DENIED';

  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((nds) => nds.filter((node) => node.id !== id));
  };

  return (
    <div className={`min-w-[200px] bg-[#1a1a1a]/95 backdrop-blur-xl border ${
      isPending ? 'border-amber-500 animate-pulse' : 
      isApproved ? 'border-emerald-500' : 
      'border-red-500'
    } rounded-2xl p-4 shadow-2xl relative overflow-hidden group`}>
      
      {/* Delete Button */}
      <button 
        onClick={onDelete}
        className="absolute -top-1 -right-1 w-6 h-6 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all z-50 border-2 border-[#121212]"
      >
        <X size={12} />
      </button>

      {/* Background Glow */}
      <div className={`absolute -inset-1 opacity-20 blur-xl transition-all ${
        isPending ? 'bg-amber-500' : isApproved ? 'bg-emerald-500' : 'bg-red-500'
      }`} />

      <Handle type="target" position={Position.Top} className="!bg-gray-600 !w-3 !h-3" />
      
      <div className="flex items-center gap-3 relative z-10">
        <div className={`p-2 rounded-xl ${
          isPending ? 'bg-amber-500/20 text-amber-500' : 
          isApproved ? 'bg-emerald-500/20 text-emerald-500' : 
          'bg-red-500/20 text-red-500'
        }`}>
          {isPending ? <Gavel size={20} /> : 
           isApproved ? <CheckCircle2 size={20} /> : 
           isDenied ? <XCircle size={20} /> : <Clock size={20} />}
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Governance Interrupt</span>
          <span className="text-sm font-bold text-gray-200">{nodeData.action.toUpperCase()}</span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 flex flex-col gap-2 relative z-10">
        <div className="flex justify-between items-center text-[9px] uppercase font-bold text-gray-500">
          <span>Requested By</span>
          <span className="text-blue-400">@{nodeData.agentId}</span>
        </div>
        <div className={`text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded w-fit ${
          isPending ? 'bg-amber-500/10 text-amber-500' : 
          isApproved ? 'bg-emerald-500/10 text-emerald-500' : 
          'bg-red-500/10 text-red-500'
        }`}>
          {nodeData.status}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-600 !w-3 !h-3" />
    </div>
  );
}
