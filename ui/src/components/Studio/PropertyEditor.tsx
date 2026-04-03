import { X, Save, Terminal, Info, Loader2 } from 'lucide-react';
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

export function PropertyEditor({ node, onUpdate, onClose }: PropertyEditorProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8088/skills')
      .then(res => res.json())
      .then(data => {
        setSkills(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch skills:', err);
        setIsLoading(false);
      });
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
