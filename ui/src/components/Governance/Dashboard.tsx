import { useState, useEffect } from 'react';
import { useEvents } from '../../context/EventContext';
import { CreditCard, Users, Binary, ShieldCheck, ShieldAlert, Clock, Check, X as CloseIcon, Settings, Brain, Info } from 'lucide-react';

interface PendingApproval {
  approval_id: string;
  agent_id: string;
  action: string;
  reason: string;
  details: any;
  timestamp: number;
}

export function Dashboard() {
  const { events } = useEvents();
  const [budget, setBudget] = useState({ spent: 0.12, limit: 5.0, escrowed: 0.05 });
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [govConfig, setGovConfig] = useState<{ memory_turns: number; cost_threshold: number }>({ memory_turns: 20, cost_threshold: 0.01 });

  // Fetch initial data
  useEffect(() => {
    // 1. Pending Approvals
    fetch('http://localhost:8088/governance/pending')
      .then(res => res.json())
      .then(data => setPendingApprovals(data))
      .catch(err => console.error("Failed to fetch pending approvals:", err));

    // 2. Gov Config
    fetch('http://localhost:8088/governance/config')
      .then(res => res.json())
      .then(data => setGovConfig(data))
      .catch(err => console.error("Failed to fetch gov config:", err));
  }, []);

  useEffect(() => {
    // 1. Handle Audit Events
    const liveEvents = events.filter(e => e.type === 'audit_event').map(e => e.data);
    if (liveEvents.length > 0) {
      setAuditLog(prev => [...liveEvents.reverse(), ...prev].slice(0, 50));
      const lastEvent = liveEvents[0];
      if (lastEvent.cost_usd) {
        setBudget(prev => ({ ...prev, spent: prev.spent + lastEvent.cost_usd }));
      }
    }

    // 2. Handle Approval Events
    const approvalEvents = events.filter(e => e.type === 'PENDING_APPROVAL').map(e => e.data);
    if (approvalEvents.length > 0) {
      setPendingApprovals(prev => [...approvalEvents, ...prev]);
    }
  }, [events]);

  const handleDecision = async (approvalId: string, approved: boolean) => {
    try {
      const res = await fetch(`http://localhost:8088/governance/decision/${approvalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved })
      });
      if (res.ok) {
        setPendingApprovals(prev => prev.filter(a => a.approval_id !== approvalId));
      }
    } catch (err) {
      console.error("Failed to submit decision:", err);
    }
  };

  const updateMemoryTurns = async (val: number) => {
    setGovConfig(prev => ({ ...prev, memory_turns: val }));
    try {
      await fetch('http://localhost:8088/governance/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memory_turns: val })
      });
    } catch (err) {
      console.error("Failed to update memory turns:", err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#121212] text-gray-300 p-6 space-y-6 overflow-hidden">
      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
        <div className="bg-[#1e1e1e] p-4 rounded-xl border border-gray-800 flex items-center gap-4">
          <div className="p-3 bg-blue-900/30 rounded-lg text-blue-400">
            <CreditCard size={24} />
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Company Budget</div>
            <div className="text-2xl font-semibold">${budget.spent.toFixed(4)} / ${budget.limit.toFixed(2)}</div>
            <div className="w-full bg-gray-800 h-1.5 mt-2 rounded-full overflow-hidden">
               <div 
                 className="bg-blue-500 h-full transition-all duration-500" 
                 style={{ width: `${(budget.spent / budget.limit) * 100}%` }}
               ></div>
            </div>
          </div>
        </div>

        <div className="bg-[#1e1e1e] p-4 rounded-xl border border-gray-800 flex items-center gap-4">
          <div className="p-3 bg-green-900/30 rounded-lg text-green-400">
            <Users size={24} />
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Active Agents</div>
            <div className="text-2xl font-semibold">3 Active</div>
            <div className="text-xs text-green-500 mt-1 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Performance stable
            </div>
          </div>
        </div>

        <div className="bg-[#1e1e1e] p-4 rounded-xl border border-gray-800 flex items-center gap-4">
          <div className="p-3 bg-yellow-900/30 rounded-lg text-yellow-400">
            <ShieldAlert size={24} />
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Pending Approvals</div>
            <div className="text-2xl font-semibold">{pendingApprovals.length} Waiting</div>
            <div className="text-xs text-yellow-500 mt-1">Human intervention required</div>
          </div>
        </div>
      </div>

      {/* System Settings Slider */}
      <div className="bg-[#1e1e1e] p-5 rounded-xl border border-gray-800 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-400">
            <Settings size={14} /> System Configuration
          </div>
          <div className="text-[10px] text-gray-500 font-mono italic">Changes apply to next agent run</div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3">
             <div className="flex justify-between items-end">
               <div>
                 <div className="text-sm font-bold text-gray-200 flex items-center gap-2">
                   <Brain size={16} className="text-purple-500" /> Intelligence Memory Window
                 </div>
                 <div className="text-[10px] text-gray-500 mt-0.5">Historical messages recalled for context</div>
               </div>
               <div className="text-xl font-black text-blue-500">
                 {govConfig.memory_turns === 500 ? 'MAX (500)' : govConfig.memory_turns}
               </div>
             </div>
             
             <div className="relative pt-1">
               <input 
                 type="range" 
                 min="20" 
                 max="500" 
                 step="10" 
                 value={govConfig.memory_turns}
                 onChange={(e) => updateMemoryTurns(parseInt(e.target.value))}
                 className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
               />
               <div className="flex justify-between text-[10px] text-gray-600 mt-2 font-mono font-bold">
                 <span>20 EVENTS</span>
                 <span>100</span>
                 <span>250</span>
                 <span>500 (SAFE CAP)</span>
               </div>
             </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-[#252525] rounded-lg border border-gray-800 border-l-4 border-l-blue-500">
             <Info size={20} className="text-blue-400 shrink-0" />
             <div className="text-xs text-gray-400 leading-relaxed italic">
               <strong>Optimizer:</strong> A safe cap of 500 prevents context window overflow while ensuring deep session awareness. 
               For legacy context beyond 500 messages, Ensemble triggers RAG-based vector retrieval.
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        {/* Live Audit Feed */}
        <div className="bg-[#1e1e1e] rounded-xl border border-gray-800 flex flex-col min-h-0">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2 font-black text-xs uppercase tracking-widest text-gray-400">
               <Binary size={14} />
               Live Audit Feed
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-[10px]">
            {auditLog.map((log, i) => (
              <div key={i} className="flex gap-4 p-2 rounded hover:bg-[#252525] transition-colors border-l-2 border-blue-500/30 bg-[#1a1a1a]">
                <span className="text-gray-600 shrink-0">{log.timestamp?.split('T')[1]?.split('Z')[0] || 'LIVE'}</span>
                <span className="text-blue-400 font-bold shrink-0">{log.action_type}</span>
                <span className="text-gray-400 truncate max-w-[200px]">{JSON.stringify(log.details)}</span>
                <span className="ml-auto text-green-600">${log.cost_usd.toFixed(5)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Approvals Queue */}
        <div className="bg-[#1e1e1e] rounded-xl border border-gray-800 flex flex-col min-h-0">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2 font-black text-xs uppercase tracking-widest text-yellow-500">
              <ShieldCheck size={14} />
              Approvals Queue
            </div>
            <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-500 rounded text-[10px] font-bold">
              {pendingApprovals.length} PENDING
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
             {pendingApprovals.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-2">
                 <ShieldCheck size={48} className="opacity-10" />
                 <p className="text-sm font-medium">No actions pending approval</p>
                 <p className="text-xs opacity-50 italic text-center">Agents are operating within autonomous bounds</p>
               </div>
             ) : (
               pendingApprovals.map((appr) => (
                 <div key={appr.approval_id} className="bg-[#252525] border border-yellow-500/30 rounded-lg overflow-hidden animate-in fade-in zoom-in duration-300">
                   <div className="p-4 space-y-3">
                     <div className="flex justify-between items-start">
                       <div>
                         <div className="text-xs font-black text-yellow-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                           <Clock size={12} /> Pending Decision
                         </div>
                         <h3 className="text-sm font-bold text-gray-100 italic">Agent: {appr.agent_id}</h3>
                       </div>
                       <div className="text-right">
                         <div className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">Budget Impact</div>
                         <div className="text-xs font-mono font-bold text-green-500 leading-none">
                           $0.02*
                         </div>
                       </div>
                     </div>
                     
                     <div className="p-3 bg-[#1a1a1a] rounded border border-gray-800 space-y-2">
                        <div className="text-[10px] font-black text-gray-500 uppercase">Action Reason</div>
                        <p className="text-xs text-gray-300 leading-relaxed font-mono">
                           {appr.reason}
                        </p>
                        <div className="pt-2 border-t border-gray-800">
                           <div className="text-[10px] font-black text-gray-400 uppercase mb-1">Payload Preview</div>
                           <pre className="text-[10px] font-mono text-blue-400 truncate">
                              {JSON.stringify(appr.details)}
                           </pre>
                        </div>
                     </div>

                     <div className="flex gap-2 pt-1 font-black">
                       <button 
                         onClick={() => handleDecision(appr.approval_id, true)}
                         className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95"
                       >
                         <Check size={14} /> Approve Action
                       </button>
                       <button 
                         onClick={() => handleDecision(appr.approval_id, false)}
                         className="flex-1 py-2 bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/30 rounded text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95"
                       >
                         <CloseIcon size={14} /> Deny Access
                       </button>
                     </div>
                   </div>
                 </div>
               ))
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
