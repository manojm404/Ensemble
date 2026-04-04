import { useState, useEffect } from 'react';
import { Shield, Lock, Unlock, Globe, Terminal, FileText, Save, AlertTriangle, Play, Zap } from 'lucide-react';

interface AgentPermission {
  id: string;
  name: string;
  allow: string[];
  egress: string[];
}

interface PermissionEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PermissionEditor({ isOpen, onClose }: PermissionEditorProps) {
  const [agents, setAgents] = useState<AgentPermission[]>([]);
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        const res = await fetch('http://localhost:8088/api/governance/policy');
        const data = await res.json();
        const agentsList = Object.entries(data.agents || {}).map(([id, rules]: [string, any]) => ({
          id,
          name: id.replace(/_/g, ' ').toUpperCase(),
          allow: rules.allow || [],
          egress: rules.egress || []
        }));
        setAgents(agentsList);
        setDryRun(data.dry_run || false);
      } catch (e) {
        console.error("Failed to fetch security policy:", e);
      } finally {
        setLoading(false);
      }
    };
    if (isOpen) fetchPolicy();
  }, [isOpen]);

  const togglePermission = (id: string, perm: string) => {
    setAgents(prev => prev.map(a => {
      if (a.id !== id) return a;
      const newAllow = a.allow.includes(perm) 
        ? a.allow.filter(p => p !== perm)
        : [...a.allow, perm];
      return { ...a, allow: newAllow };
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const agentsObj = agents.reduce((acc, a) => ({
        ...acc,
        [a.id]: { allow: a.allow, egress: a.egress }
      }), {});
      
      await fetch('http://localhost:8088/api/governance/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: agentsObj, dry_run: dryRun })
      });
      onClose();
    } catch (e) {
      console.error("Save failed:", e);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-5xl h-[80vh] bg-[#0d0d0d] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-blue-900/10 to-transparent">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-2xl border border-blue-500/30">
              <Shield className="text-blue-400" size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-[0.2em]">Sovereign Governance</h2>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Zero-Trust Permission Matrix</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setDryRun(!dryRun)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all border ${dryRun ? 'bg-amber-500/20 border-amber-500/40 text-amber-500' : 'bg-white/5 border-white/10 text-gray-500'}`}
            >
              <Zap size={14} className={dryRun ? 'animate-pulse' : ''} />
              Dry Run Mode: {dryRun ? 'ON' : 'OFF'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-gray-500">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 no-scrollbar">
          {loading ? (
            <div className="h-full flex items-center justify-center gap-3">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Resolving Policy...</span>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_2fr] gap-4 pb-4 border-b border-white/5 text-[10px] font-black text-gray-600 uppercase tracking-widest">
                <div>Agent Identity</div>
                <div className="text-center">Filesystem</div>
                <div className="text-center">Network</div>
                <div className="text-center">Shell</div>
                <div>Egress Whitelist</div>
              </div>

              {agents.map(agent => (
                <div key={agent.id} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_2fr] gap-4 items-center p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all group">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-black text-white tracking-wider">{agent.name}</span>
                    <span className="text-[9px] font-mono text-gray-600">ID: {agent.id}</span>
                  </div>
                  
                  {/* Permissions */}
                  <div className="flex justify-center">
                    <Toggle 
                      active={agent.allow.includes('file_writer')} 
                      icon={<FileText size={14} />} 
                      onClick={() => togglePermission(agent.id, 'file_writer')}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Toggle 
                      active={agent.allow.includes('network')} 
                      icon={<Globe size={14} />} 
                      onClick={() => togglePermission(agent.id, 'network')}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Toggle 
                      active={agent.allow.includes('shell_cmd')} 
                      icon={<Terminal size={14} />} 
                      onClick={() => togglePermission(agent.id, 'shell_cmd')}
                    />
                  </div>

                  {/* Egress Whitelist */}
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="*.openai.com, *.google.com"
                      className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2 text-[10px] font-mono text-blue-400/70 focus:outline-none focus:border-blue-500/40 transition-all"
                      value={agent.egress.join(', ')}
                      onChange={(e) => {
                        const newEgress = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                        setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, egress: newEgress } : a));
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-white/5 bg-black/40 flex items-center justify-between">
          <div className="flex items-center gap-3 text-amber-500/70">
            <AlertTriangle size={16} />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              CAUTION: Deny-by-default logic applies. Unspecified permissions are strictly blocked.
            </span>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-900/20 flex items-center gap-2 transition-all"
          >
            {saving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />}
            Finalize Governance
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ active, icon, onClick }: { active: boolean, icon: React.ReactNode, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`p-2 rounded-xl border transition-all ${active ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-black/40 border-white/5 text-gray-700 hover:border-white/20'}`}
    >
      {active ? <Unlock size={16} /> : <Lock size={16} />}
    </button>
  );
}

const X = ({ size, className }: { size: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);
