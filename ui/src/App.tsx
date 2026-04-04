import { useState, useEffect } from 'react';
import { MessageSquare, Settings as SettingsIcon, Activity, Cpu, LogOut, User, Shield, ShoppingCart, Globe } from 'lucide-react';
import { ChatInterface } from './components/Chat/ChatInterface';
import { Dashboard } from './components/Governance/Dashboard';
import { BlockBuilder } from './components/Studio/BlockBuilder';
import { ReactFlowProvider } from '@xyflow/react';
import { Settings } from './components/Settings/Settings';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'chat' | 'governance' | 'marketplace' | 'settings'>('studio');
  const [user, setUser] = useState<any>(null);
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('ensemble_token');
    if (token) {
      // In a real app we'd verify the token. For V1 we just trust it.
      setUser({ id: 'user_dev_123', email: 'dev@ensemble.ai' });
    }
    setIsInitialized(true);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('ensemble_token');
    setUser(null);
    setAuthView('login');
  };

  if (!isInitialized) return null;

  if (!user) {
    return authView === 'login' ? (
      <Login onLogin={setUser} onNavigateToSignup={() => setAuthView('signup')} />
    ) : (
      <Signup onNavigateToLogin={() => setAuthView('login')} />
    );
  }

  return (
    <div className="flex h-screen w-screen bg-[#121212] overflow-hidden font-sans text-gray-200">
      {/* Sidebar */}
      <div className="w-16 flex flex-col items-center py-6 border-r border-gray-800 bg-[#1a1a1a] gap-8">
        <div className="p-2 bg-blue-600 rounded-lg text-white">
          <Activity size={24} />
        </div>
        
        <button 
          onClick={() => setActiveTab('studio')}
          className={`p-3 rounded-xl transition-all ${activeTab === 'studio' ? 'bg-[#2d2d2d] text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
          title="Tactical Studio"
        >
          <Cpu size={24} />
        </button>

        <button 
          onClick={() => setActiveTab('chat')}
          className={`p-3 rounded-xl transition-all ${activeTab === 'chat' ? 'bg-[#2d2d2d] text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}
          title="Collaborative Chat"
        >
          <MessageSquare size={24} />
        </button>

        <button 
          onClick={() => setActiveTab('governance')}
          className={`p-3 rounded-xl transition-all ${activeTab === 'governance' ? 'bg-[#2d2d2d] text-amber-500' : 'text-gray-500 hover:text-gray-300'}`}
          title="Governance Dashboard"
        >
          <Shield size={24} />
        </button>

        <button 
          onClick={() => setActiveTab('marketplace')}
          className={`p-3 rounded-xl transition-all ${activeTab === 'marketplace' ? 'bg-[#2d2d2d] text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}
          title="Skill Marketplace"
        >
          <ShoppingCart size={24} />
        </button>

        <button 
          onClick={() => setActiveTab('settings')}
          className={`p-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-[#2d2d2d] text-gray-300' : 'text-gray-500 hover:text-gray-300'}`}
          title="System Settings"
        >
          <SettingsIcon size={24} />
        </button>

        <div className="mt-auto flex flex-col gap-4 pb-4">
          <button 
            onClick={handleLogout}
            className="p-3 text-gray-500 hover:text-red-400 transition-all"
            title="Logout"
          >
            <LogOut size={24} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#121212]">
        <header className="h-14 border-b border-gray-800 flex items-center justify-between px-6 bg-[#1a1a1a]/50 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-blue-500 uppercase tracking-widest leading-none">Ensemble</span>
            <div className="h-4 w-[1px] bg-gray-800 mx-1" />
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">v3.0 Sovereign Orchestration</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <Globe size={12} className="text-blue-400" />
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Protocol: Active</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#2d2d2d] rounded-lg border border-gray-700">
              <User size={14} className="text-gray-400" />
              <span className="text-[10px] font-bold text-gray-300">{user.email}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0" style={{ display: activeTab === 'studio' ? 'block' : 'none' }}>
            <ReactFlowProvider>
              <BlockBuilder />
            </ReactFlowProvider>
          </div>
          <div className="absolute inset-0" style={{ display: activeTab === 'chat' ? 'block' : 'none' }}>
            <ChatInterface />
          </div>
          <div className="absolute inset-0" style={{ display: activeTab === 'governance' ? 'block' : 'none' }}>
            <Dashboard />
          </div>
          <div className="absolute inset-0" style={{ display: activeTab === 'marketplace' ? 'block' : 'none' }}>
            <div className="flex items-center justify-center h-full text-gray-500 uppercase tracking-[0.3em] font-black italic">
              Marketplace Initialization...
            </div>
          </div>
          <div className="absolute inset-0" style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
            <Settings />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
