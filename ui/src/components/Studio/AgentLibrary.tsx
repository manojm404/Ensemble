import { useState, useEffect } from 'react';
import { Search, Brain, Zap, Sparkles, ChevronRight, Activity } from 'lucide-react';

interface Skill {
  name: string;
  description: string;
  emoji: string;
  color: string;
  vibe: string;
  category?: string;
}

interface AgentLibraryProps {
  onAddAgent: (skill: Skill) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function AgentLibrary({ onAddAgent, isOpen, onToggle }: AgentLibraryProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const res = await fetch('http://localhost:8088/api/skills');
        const data = await res.json();
        // Sort and group by category
        const skillsArray = Array.isArray(data) ? data : Object.values(data);
        setSkills(skillsArray);
      } catch (e) {
        console.error("Failed to fetch skills:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchSkills();
  }, []);

  const categories = Array.from(new Set(skills.map(s => s.category || 'General'))).sort();
  const [activeCategory, setActiveCategory] = useState('All');

  const filteredSkills = skills.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === 'All' || (s.category || 'General') === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div
      className={`absolute top-0 left-0 h-full bg-zinc-950/95 backdrop-blur-xl border-r border-white/10 z-[100] flex flex-col shadow-2xl transition-all duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] ${isOpen ? 'w-[320px] opacity-100' : 'w-0 opacity-0 pointer-events-none'
        }`}
    >
      <div className="w-[320px] h-full flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-gradient-to-b from-white/[0.02] to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <Brain className="text-blue-400" size={16} />
            </div>
            <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-widest">Agent Library</h3>
          </div>
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-zinc-100 transition-colors"
            aria-label="Toggle Library"
          >
            <ChevronRight size={16} className="rotate-180" />
          </button>
        </div>

        {/* Search & Filters */}
        <div className="p-5 border-b border-white/5 space-y-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-blue-400 transition-colors" size={14} />
            <input
              type="text"
              placeholder="Search capabilities..."
              className="w-full bg-zinc-900/50 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar mask-linear-fade">
            <button
              onClick={() => setActiveCategory('All')}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-full transition-all whitespace-nowrap ${activeCategory === 'All'
                ? 'bg-zinc-100 text-zinc-900 shadow-sm'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                }`}
            >
              All Agents
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat as string)}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-full transition-all whitespace-nowrap ${activeCategory === cat
                  ? 'bg-zinc-100 text-zinc-900 shadow-sm'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                  }`}
              >
                {cat as string}
              </button>
            ))}
          </div>
        </div>

        {/* Skills List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 no-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-4 opacity-70">
              <div className="p-3 bg-blue-500/10 rounded-full">
                <Activity className="animate-pulse text-blue-400" size={24} />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Syncing Skills...</span>
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center gap-2">
              <span className="text-2xl opacity-50">🔍</span>
              <span className="text-zinc-500 text-sm font-medium">No agents found</span>
              <span className="text-zinc-600 text-xs">Try adjusting your search</span>
            </div>
          ) : (
            filteredSkills.map((skill, i) => (
              <div
                key={i}
                draggable
                onDragEnd={() => onAddAgent(skill)}
                className="group p-4 bg-zinc-900/40 border border-white/5 rounded-2xl hover:border-blue-500/30 hover:bg-zinc-800/40 transition-all duration-300 cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(59,130,246,0.2)]"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-xl text-xl border border-white/5 group-hover:scale-110 transition-transform duration-300">
                      {skill.emoji}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-zinc-100 tracking-wide">{skill.name}</span>
                      <span className="text-[10px] font-medium text-blue-400/80 uppercase tracking-wider">{skill.vibe}</span>
                    </div>
                  </div>
                  <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                    <Sparkles size={12} className="text-blue-400" />
                  </div>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2 mb-4 font-medium">
                  {skill.description}
                </p>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-white/5 rounded-md text-[9px] text-zinc-400 font-medium uppercase tracking-wider border border-white/5">
                    Reliable
                  </span>
                  <span className="px-2 py-1 bg-white/5 rounded-md text-[9px] text-zinc-400 font-medium uppercase tracking-wider border border-white/5">
                    Agentic
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/5 bg-zinc-950/50 backdrop-blur-md">
          <div className="p-3.5 bg-gradient-to-r from-blue-500/10 to-transparent border border-blue-500/10 rounded-xl">
            <div className="flex items-center gap-2 mb-1.5">
              <Zap size={12} className="text-blue-400 fill-blue-400/20" />
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">V3 Real Agent Tech</span>
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed font-medium">
              Drag any agent to the canvas. Real skills are synced from your backend SkillRegistry.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}