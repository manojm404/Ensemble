import { useState } from 'react';
import { Save, Cpu, Globe, Server, Check } from 'lucide-react';

export function Settings() {
  const [provider, setProvider] = useState<string>(localStorage.getItem('ensemble_provider') || 'gemini');
  const [model, setModel] = useState<string>(localStorage.getItem('ensemble_model') || 'gemini-2.5-flash');
  const [baseUrl, setBaseUrl] = useState<string>(localStorage.getItem('ensemble_base_url') || 'http://localhost:11434/v1');
  const [status, setStatus] = useState<string>('');

  const saveSettings = async () => {
    setStatus('Syncing with Backend... 🔄');
    try {
      // 1. Local Persistence (for UI state)
      localStorage.setItem('ensemble_provider', provider);
      localStorage.setItem('ensemble_model', model);
      localStorage.setItem('ensemble_base_url', baseUrl);

      // 2. Backend Persistence (for Intelligence Layer)
      const resp = await fetch('http://localhost:8088/governance/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model,
          base_url: baseUrl
        })
      });

      if (!resp.ok) throw new Error('Backend sync failed');
      
      setStatus('Intelligence Swapped! 🧠 ✅');
    } catch (err) {
      console.error(err);
      setStatus('Sync Error: Check Console ❌');
    }
    setTimeout(() => setStatus(''), 3000);
  };

  return (
    <div className="flex-1 p-8 bg-[#1a1a1a] overflow-y-auto">
      <div className="max-w-2xl mx-auto space-y-8">
        <header>
          <h1 className="text-2xl font-black text-gray-100 uppercase tracking-tighter">System Settings</h1>
          <p className="text-gray-500 text-sm">Configure your Intelligence Layer and Local Inference</p>
        </header>

        <section className="bg-[#2a2a2a] p-6 rounded-xl border border-gray-800 space-y-6">
          <div className="flex items-center gap-3 border-b border-gray-800 pb-4">
            <Cpu className="text-blue-500" size={20} />
            <h2 className="text-sm font-bold text-gray-200">LLM Provider</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => { setProvider('gemini'); setModel('gemini-2.5-flash'); }}
              className={`p-4 rounded-lg border-2 transition-all flex flex-col gap-2 ${provider === 'gemini' ? 'border-blue-500 bg-blue-900/10' : 'border-gray-800 hover:border-gray-700'}`}
            >
              <Globe size={24} className={provider === 'gemini' ? 'text-blue-400' : 'text-gray-500'} />
              <div className="text-left">
                <div className="text-xs font-bold text-gray-200 uppercase">Cloud (Gemini)</div>
                <div className="text-[10px] text-gray-500">Fast, capable, requires API Key</div>
              </div>
            </button>

            <button 
              onClick={() => { setProvider('ollama'); setModel('llama3.2'); }}
              className={`p-4 rounded-lg border-2 transition-all flex flex-col gap-2 ${provider === 'ollama' ? 'border-blue-500 bg-blue-900/10' : 'border-gray-800 hover:border-gray-700'}`}
            >
              <Server size={24} className={provider === 'ollama' ? 'text-blue-400' : 'text-gray-500'} />
              <div className="text-left">
                <div className="text-xs font-bold text-gray-200 uppercase">Local (Ollama)</div>
                <div className="text-[10px] text-gray-500">Private, offline, free</div>
              </div>
            </button>
          </div>

          <div className="space-y-4 pt-4">
             <div>
               <label className="text-[10px] font-black text-gray-500 uppercase block mb-1">Model Name</label>
               <input 
                 value={model}
                 onChange={(e) => setModel(e.target.value)}
                 className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
               />
             </div>
             
             {provider === 'ollama' && (
               <div>
                 <label className="text-[10px] font-black text-gray-500 uppercase block mb-1">Base URL</label>
                 <input 
                   value={baseUrl}
                   onChange={(e) => setBaseUrl(e.target.value)}
                   className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
                 />
               </div>
             )}
          </div>
        </section>

        <section className="bg-[#2a2a2a] p-6 rounded-xl border border-gray-800 space-y-4">
          <div className="flex items-center gap-3 border-b border-gray-800 pb-4">
            <Check className="text-green-500" size={20} />
            <h2 className="text-sm font-bold text-gray-200">Memory Engine</h2>
          </div>
          <p className="text-xs text-gray-500">
            Vector search is currently set to **Local SQLite (NumPy)**. 
            All artifacts are being indexed at <code className="bg-[#1a1a1a] px-1 rounded">data/ensemble_space/</code>.
          </p>
        </section>

        <div className="flex items-center justify-between pt-4">
          <span className="text-green-400 text-xs font-bold">{status}</span>
          <button 
            onClick={saveSettings}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-xs flex items-center gap-2 shadow-lg"
          >
            <Save size={16} /> SAVE SETTINGS
          </button>
        </div>
      </div>
    </div>
  );
}
