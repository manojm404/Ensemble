import { useState, useEffect } from 'react';
import { Search, ChevronRight, Package, Cpu, Globe, Share2, Star, Plus } from 'lucide-react';

interface Macro {
  id: string;
  name: string;
  author: string;
  created_at: string;
  description?: string;
  category?: string;
}

interface MacroMarketplaceProps {
  onInstallMacro: (macro: Macro) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function MacroMarketplace({ onInstallMacro, isOpen, onToggle }: MacroMarketplaceProps) {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMacros = async () => {
      try {
        const res = await fetch('http://localhost:8088/api/macros');
        const data = await res.json();
        setMacros(data);
      } catch (e) {
        console.error("Failed to fetch macros:", e);
      } finally {
        setLoading(false);
      }
    };
    if (isOpen) fetchMacros();
  }, [isOpen]);

  const filteredMacros = macros.filter(m => 
    m.name.toLowerCase().includes(search.toLowerCase()) || 
    m.author.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={`absolute top-0 right-0 h-full bg-[#111] border-l border-white/5 z-[101] flex flex-col shadow-[-20px_0_40px_rgba(0,0,0,0.5)] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isOpen ? 'w-[360px]' : 'w-0 overflow-hidden opacity-0'}`}>
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-purple-900/20 to-transparent">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg border border-purple-500/30">
            <Package className="text-purple-400" size={18} />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Marketplace</h3>
            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Shared Patterns</span>
          </div>
        </div>
        <button onClick={onToggle} className="p-2 hover:bg-white/5 rounded-full text-gray-500 transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Search & Filter */}
      <div className="p-6">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-purple-400 transition-colors" size={14} />
          <input 
            type="text"
            placeholder="Search macros..."
            className="w-full bg-black/40 border border-white/5 rounded-xl pl-10 pr-4 py-3 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500/40 transition-all placeholder:text-gray-700"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 mt-4 overflow-x-auto no-scrollbar py-1">
          {['Logic', 'Research', 'DevOps', 'Social'].map(cat => (
            <button key={cat} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[9px] font-black uppercase text-gray-400 rounded-lg border border-white/5 transition-all whitespace-nowrap">
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Macro List */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 no-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-60 gap-4">
            <Cpu className="animate-spin text-purple-500/30" size={32} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Initializing Mesh...</span>
          </div>
        ) : filteredMacros.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 border border-dashed border-white/5 rounded-2xl opacity-50">
            <Globe size={24} className="text-gray-700 mb-2" />
            <span className="text-[10px] uppercase font-bold tracking-widest text-gray-600">No signals found</span>
          </div>
        ) : (
          filteredMacros.map((macro, i) => (
            <div 
              key={macro.id}
              className="group relative p-5 bg-[#181818] border border-white/5 rounded-2xl hover:border-purple-500/40 transition-all hover:bg-[#1c1c1c] overflow-hidden"
            >
              {/* Vibe Background Gradient */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/5 blur-[40px] -mr-16 -mt-16 group-hover:bg-purple-600/10 transition-all"></div>
              
              <div className="flex items-start justify-between relative z-10">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white uppercase tracking-wider">{macro.name}</span>
                    <div className="px-1.5 py-0.5 bg-purple-500/10 text-[8px] font-bold text-purple-400 uppercase rounded border border-purple-500/20">V1.0</div>
                  </div>
                  <span className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter">by @{macro.author}</span>
                </div>
                <button 
                  onClick={() => onInstallMacro(macro)}
                  className="p-2 bg-purple-500/10 hover:bg-purple-500 text-purple-400 hover:text-white rounded-lg border border-purple-500/20 transition-all shadow-lg"
                >
                  <Plus size={16} />
                </button>
              </div>

              <p className="text-[10px] text-gray-400 leading-relaxed mt-3 mb-4 line-clamp-2">
                {macro.description || "Synthesize multi-agent logic into a singular, high-performance execution node."}
              </p>

              <div className="flex items-center gap-3 relative z-10">
                <div className="flex items-center gap-1 text-[9px] font-bold text-gray-500 uppercase">
                  <Share2 size={10} /> 12 Instances
                </div>
                <div className="flex items-center gap-1 text-[9px] font-bold text-amber-500/70 uppercase">
                  <Star size={10} fill="currentColor" className="opacity-50" /> 4.9
                </div>
              </div>

              {/* Install Preview Overlay (Hover) */}
              <div className="absolute inset-0 bg-purple-600/10 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border-2 border-purple-500/20 rounded-2xl"></div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-white/5 bg-black/40">
        <div className="p-4 bg-gradient-to-br from-[#1a1a1a] to-[#222] border border-white/5 rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-purple-400" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Macro Sharing</span>
          </div>
          <p className="text-[9px] text-gray-500 leading-relaxed">
            Instantly deploy complex logic clusters. Macros are version-pinned for collaborative stability.
          </p>
        </div>
      </div>
    </div>
  );
}

const Sparkles = ({ size, className }: { size: number, className: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
  </svg>
);
