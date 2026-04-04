import { Handle, Position } from '@xyflow/react';
import { Shuffle } from 'lucide-react';
import { memo } from 'react';

export const SwitchNode = memo(({ data, selected }: any) => {
  return (
    <div className={`group relative min-w-[220px] bg-[#1a1a1a]/90 backdrop-blur-md border ${selected ? 'border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.3)]' : 'border-gray-800 shadow-xl'} rounded-xl overflow-hidden transition-all duration-300`}>
      {/* Glow Effect */}
      <div className={`absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent pointer-events-none ${selected ? 'opacity-100' : 'opacity-0'} transition-opacity`} />
      
      {/* Header */}
      <div className="bg-[#2d2d2d]/50 p-3 border-b border-gray-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-purple-500/20 rounded-lg">
            <Shuffle className="text-purple-400" size={14} />
          </div>
          <span className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase">Branch Logic</span>
        </div>
        <div className={`w-2 h-2 rounded-full ${data.status === 'completed' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : data.status === 'running' ? 'bg-amber-500 animate-pulse' : 'bg-gray-700'}`} />
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <div>
          <h4 className="text-[11px] font-bold text-gray-200 uppercase mb-1 tracking-wider">{data.label || 'Switch Node'}</h4>
          <p className="text-[10px] text-gray-500 leading-relaxed font-mono">
            {data.condition || 'Route based on predecessor output...'}
          </p>
        </div>
        
        {/* Cases Visualization */}
        <div className="pt-2 space-y-1">
          {data.cases?.map((c: string, i: number) => (
            <div key={i} className="flex items-center justify-between px-2 py-1 bg-black/20 rounded border border-gray-800/30">
              <span className="text-[9px] font-mono text-purple-400 uppercase tracking-tighter">Case {i+1}: {c}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-2 py-1 bg-black/20 rounded border border-gray-800/30">
            <span className="text-[9px] font-mono text-gray-500 uppercase tracking-tighter">Default</span>
          </div>
        </div>
      </div>

      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-purple-500 !border-0" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-purple-500 !border-0" />
      
      {/* Labeled Source Handles (Conceptual for React Flow logic) */}
      <div className="absolute -bottom-1 flex justify-around w-full px-4">
        <Handle type="source" position={Position.Bottom} id="case1" className="!w-1.5 !h-1.5 !bg-purple-500/50 !border-0 ml-[-40%]" />
        <Handle type="source" position={Position.Bottom} id="case2" className="!w-1.5 !h-1.5 !bg-purple-500/50 !border-0 ml-[40%]" />
      </div>
    </div>
  );
});
