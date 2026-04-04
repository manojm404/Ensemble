import { useState, useEffect, useRef } from 'react';
import { Cpu, Zap, Activity, BrainCircuit } from 'lucide-react';
import { useEvents } from '../../context/EventContext';

interface NeuralMirrorProps {
  runId: string | null;
}

export function NeuralMirror({ runId }: NeuralMirrorProps) {
  const { events } = useEvents();
  const [streams, setStreams] = useState<Record<string, { text: string, role: string, lastUpdate: number }>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Buffer chunks into local streams
  useEffect(() => {
    const latestChunks = events.filter(e => e.type === 'THOUGHT_CHUNK');
    
    setStreams(prev => {
      const next = { ...prev };
      latestChunks.forEach(chunk => {
        const nodeId = chunk.data.node_id;
        if (!next[nodeId]) {
          next[nodeId] = { text: '', role: 'Agent', lastUpdate: Date.now() };
        }
        // Only append if it's "new" (simple dedupe for safety)
        next[nodeId] = {
          ...next[nodeId],
          text: next[nodeId].text + (chunk.data.chunk || ''),
          lastUpdate: Date.now()
        };
      });
      return next;
    });
  }, [events]);

  // Auto-scroll on new activity
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streams]);

  if (!runId) {
    return (
      <div className="h-full flex flex-col items-center justify-center opacity-20 p-12 text-center">
        <BrainCircuit size={48} className="mb-4 text-blue-500" />
        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Neural Mirror Idle</h3>
        <p className="text-[9px] text-gray-600 mt-2 max-w-[200px]">Launch a run to observe real-time agent synapses firing across the DAG.</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto p-6 space-y-6 custom-scrollbar bg-black/40">
      <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-4">
        <Activity size={14} className="text-blue-400 animate-pulse" />
        <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 font-mono">Live Synapse Flux</span>
      </div>

      {Object.entries(streams).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 opacity-30">
          <Zap size={24} className="text-amber-500 animate-bounce" />
          <span className="mt-4 text-[9px] font-black uppercase tracking-widest">Awaiting first token...</span>
        </div>
      ) : (
        Object.entries(streams).map(([nodeId, data]) => (
          <div key={nodeId} className="flex flex-col gap-2 border-l-2 border-blue-500/30 pl-4 py-2 bg-blue-500/[0.02] rounded-r-xl transition-all duration-500">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-blue-500/20 text-blue-400">
                  <Cpu size={10} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-blue-500/80">
                  Node: {nodeId}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                <span className="text-[8px] font-mono text-gray-600 uppercase">Streaming...</span>
              </div>
            </div>
            
            <div className="text-[11px] leading-relaxed font-mono text-gray-300 whitespace-pre-wrap break-words pr-2">
              {data.text}
              <span className="w-1.5 h-3.5 bg-blue-500 inline-block ml-0.5 animate-pulse align-middle" />
            </div>
            
            <div className="mt-2 flex items-center justify-end">
              <span className="text-[7px] font-mono text-gray-700">
                L-UPDATE: {new Date(data.lastUpdate).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
