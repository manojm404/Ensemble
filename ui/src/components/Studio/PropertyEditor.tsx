import { X, Save, Terminal, Info, Loader2, Cpu, Shuffle } from 'lucide-react';
import { useState, useEffect } from 'react';

interface PropertyEditorProps {
  node: any;
  onUpdate: (data: any) => void;
  onClose: () => void;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
}

interface Model {
  id: string;
  name: string;
  provider: string;
}

export function PropertyEditor({ node, onUpdate, onClose }: PropertyEditorProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [skillsRes, modelsRes] = await Promise.all([
          fetch('http://localhost:8088/api/skills'),
          fetch('http://localhost:8088/api/models')
        ]);
        const [skillsData, modelsData] = await Promise.all([
          skillsRes.json(),
          modelsRes.json()
        ]);
        setSkills(Object.values(skillsData));
        setModels(modelsData);
      } catch (err) {
        console.error('Failed to fetch registry data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleChange = (field: string, value: any) => {
    onUpdate({ [field]: value });
  };

  return (
    <div className="w-96 h-full bg-[#1e1e1e] border-l border-gray-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2 font-black text-gray-200 uppercase tracking-tighter">
          <Info size={18} className="text-blue-500" />
          Node Properties
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <section>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">State Identity</label>
          <div className="space-y-4">
            <div>
              <div className="text-[11px] text-gray-400 mb-1">State Name</div>
              <input 
                value={node.data.label}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full bg-[#2a2a2a] border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Agent Role</div>
              {isLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                  <Loader2 size={14} className="animate-spin" /> Loading skills...
                </div>
              ) : (
                <select 
                  value={node.data.role}
                  onChange={(e) => handleChange('role', e.target.value)}
                  className="w-full bg-[#2a2a2a] border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  {skills.map(skill => (
                    <option key={skill.id} value={skill.name}>
                      {skill.emoji} {skill.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </section>

        <section>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2 flex items-center gap-2">
            <Cpu size={14} className="text-purple-400" /> Intelligence Model
          </label>
          <div>
            <div className="text-[11px] text-gray-400 mb-1">Architecture Override</div>
            <select 
              value={node.data.model || 'default'}
              onChange={(e) => handleChange('model', e.target.value)}
              className="w-full bg-[#2a2a2a] border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="default">Default Layer Model</option>
              {models.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider.toUpperCase()})
                </option>
              ))}
            </select>
            <p className="text-[9px] text-gray-500 mt-1 italic">
              V3 Model-Agnosticism enabled. This node will ignore the global default and use the selected architecture.
            </p>
          </div>
        </section>

        {node.type === 'switchNode' && (
          <section className="p-4 bg-purple-500/5 border border-purple-500/10 rounded-lg">
            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest block mb-2 flex items-center gap-2">
              <Shuffle size={14} /> Branching Logic
            </label>
            <div className="space-y-3">
              <div>
                <div className="text-[11px] text-purple-300/70 mb-1 font-bold">Routing Condition</div>
                <textarea 
                  value={node.data.condition}
                  onChange={(e) => handleChange('condition', e.target.value)}
                  placeholder="Example: If output contains 'ERROR' -> case1"
                  className="w-full h-24 bg-black/40 border border-purple-500/20 rounded p-2 text-[11px] text-gray-100 focus:border-purple-500 focus:outline-none font-mono"
                />
              </div>
              <p className="text-[9px] text-purple-400/50 leading-tight">
                V3 Regex Engine: Match predecessor output and route to specific source handles (labels).
              </p>
            </div>
          </section>
        )}

        <section>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2 flex items-center gap-2">
            <Terminal size={14} /> Execution Instructions
          </label>
          <textarea 
            value={node.data.instruction}
            onChange={(e) => handleChange('instruction', e.target.value)}
            placeholder="What should the agent do in this state? (Markdown supported)"
            className="w-full h-48 bg-[#2a2a2a] border border-gray-700 rounded p-3 text-sm text-gray-100 focus:border-blue-500 focus:outline-none font-mono"
          />
        </section>

        <section>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Capabilities</label>
          <div className="space-y-2">
             {['web_search', 'python_interpreter', 'file_writer', 'shell_cmd'].map(tool => (
               <label key={tool} className="flex items-center gap-3 p-2 rounded hover:bg-[#2a2a2a] cursor-pointer">
                 <input 
                   type="checkbox" 
                   checked={node.data.tools?.includes(tool)}
                   onChange={(e) => {
                     const tools = node.data.tools || [];
                     const updated = e.target.checked ? [...tools, tool] : tools.filter((t: string) => t !== tool);
                     handleChange('tools', updated);
                   }}
                   className="w-4 h-4 accent-blue-500"
                 />
                 <span className="text-xs text-gray-300 font-mono">{tool}</span>
               </label>
             ))}
          </div>
        </section>
      </div>

      <div className="p-4 border-t border-gray-800 bg-[#151515]">
        <button 
          onClick={onClose}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-xs flex items-center justify-center gap-2"
        >
          <Save size={16} /> COMMIT CHANGES
        </button>
      </div>
    </div>
  );
}
