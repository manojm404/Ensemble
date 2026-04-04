import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, History, X } from 'lucide-react';

interface Snapshot {
  id: number;
  node_id: string;
  status: string;
  artifact_hash: string;
  graph_state?: any;
  created_at: string;
}

interface TimeMachineControlProps {
  runId: string;
  onSnapshotChange?: (snapshot: Snapshot | null) => void;
  onClose: () => void;
}

export function TimeMachineControl({ runId, onSnapshotChange, onClose }: TimeMachineControlProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSnapshots = async () => {
      try {
        const res = await fetch(`http://localhost:8088/api/runs/${runId}/timeline`);
        const data = await res.json();
        setSnapshots(data);
        if (data.length > 0) {
          setCurrentIndex(data.length - 1);
          onSnapshotChange?.(data[data.length - 1]);
        }
      } catch (e) {
        console.error("Failed to fetch snapshots:", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSnapshots();
  }, [runId]);

  useEffect(() => {
    let interval: any;
    if (isPlaying && currentIndex < snapshots.length - 1) {
      interval = setInterval(() => {
        setCurrentIndex(prev => {
          const next = prev + 1;
          onSnapshotChange?.(snapshots[next]);
          if (next === snapshots.length - 1) setIsPlaying(false);
          return next;
        });
      }, 1000);
    } else {
      setIsPlaying(false);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentIndex, snapshots]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value);
    setCurrentIndex(idx);
    onSnapshotChange?.(snapshots[idx]);
  };

  if (isLoading) return null;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[600px] bg-[#1a1a1a]/95 backdrop-blur-2xl border border-blue-500/30 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 z-[1000] animate-in slide-in-from-bottom-8 duration-500">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-blue-400">
          <History size={16} className="animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest">Temporal Scrub Active</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-gray-500 font-mono italic">{snapshots[currentIndex]?.created_at}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-all">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-black/20 p-2 rounded-xl">
        <button 
          onClick={() => { setCurrentIndex(0); onSnapshotChange?.(snapshots[0]); }}
          className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-all"
        >
          <SkipBack size={18} />
        </button>
        
        <button 
          onClick={() => setIsPlaying(!isPlaying)}
          className="p-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white shadow-xl shadow-blue-900/20 transition-all active:scale-95"
        >
          {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
        </button>

        <button 
           onClick={() => { setCurrentIndex(snapshots.length - 1); onSnapshotChange?.(snapshots[snapshots.length - 1]); }}
          className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-all"
        >
          <SkipForward size={18} />
        </button>

        <div className="flex-1 flex flex-col gap-1 pr-2">
          <input 
            type="range" 
            min="0" 
            max={snapshots.length - 1} 
            value={currentIndex} 
            onChange={handleSliderChange}
            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-[8px] font-bold text-gray-500 uppercase tracking-widest mt-1">
            <span>INDEX: 0</span>
            <span>Step {currentIndex + 1} / {snapshots.length}</span>
            <button 
              onClick={async () => {
                const res = await fetch(`http://localhost:8088/api/runs/${runId}/fork?snapshot_id=${snapshots[currentIndex].id}`, { method: 'POST' });
                const data = await res.json();
                alert(`Forked! New Run ID: ${data.new_run_id}`);
              }}
              className="text-blue-500 hover:text-blue-400 transition-all font-black"
            >
              [ FORK FROM HERE ]
            </button>
            <span>END: {snapshots.length - 1}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
