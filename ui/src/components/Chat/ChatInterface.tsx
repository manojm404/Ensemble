import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  User, Bot, Loader2, Zap, Terminal,
  MessageSquare, Plus, Archive, ChevronRight,
  Paperclip, Hammer, AtSign, Languages, ArrowUp, FileText, Globe, Trash2
} from 'lucide-react';
import { useEvents } from '../../context/EventContext';

interface Topic {
  id: string;
  title: string;
  assistant_id: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string | number;
  role: 'user' | 'bot' | 'tool' | 'thought';
  content: string;
  agent_id?: string;
  timestamp: string;
}

const AGENT_LIBRARY = [
  { id: 'default', name: 'Generalist', role: 'System Assistant', icon: '🤖', color: 'text-blue-400', category: 'System' },
  { id: 'ceo', name: 'Chief Executive', role: 'Business Strategy', icon: '👔', color: 'text-amber-400', category: 'Executive' },
  { id: 'cto', name: 'Chief Technology', role: 'Tech Strategy', icon: '🛡️', color: 'text-purple-400', category: 'Executive' },
  { id: 'pm', name: 'Product Manager', role: 'Requirements & Roadmap', icon: '📋', color: 'text-indigo-400', category: 'Executive' },
  { id: 'architect', name: 'Software Architect', role: 'System Design', icon: '🏗️', color: 'text-sky-400', category: 'Engineering' },
  { id: 'developer', name: 'Full Stack Dev', role: 'Implementation', icon: '💻', color: 'text-emerald-400', category: 'Engineering' },
  { id: 'devops', name: 'DevOps Automator', role: 'Infrastructure', icon: '⚙️', color: 'text-orange-400', category: 'Engineering' },
  { id: 'security', name: 'Security Auditor', role: 'Safety & Compliance', icon: '🔒', color: 'text-red-400', category: 'Engineering' },
  { id: 'qa', name: 'QA Engineer', role: 'Testing & Quality', icon: '🧪', color: 'text-lime-400', category: 'Engineering' },
  { id: 'writer', name: 'Content Writer', role: 'Copy & Content', icon: '✍️', color: 'text-pink-400', category: 'Creative' },
  { id: 'designer', name: 'UI Designer', role: 'Aesthetics & UX', icon: '🎨', color: 'text-fuchsia-400', category: 'Creative' },
  { id: 'marketing', name: 'Marketing Strategist', role: 'Growth', icon: '🚀', color: 'text-rose-400', category: 'Creative' },
  { id: 'analyst', name: 'Data Analyst', role: 'Insights & Math', icon: '📊', color: 'text-yellow-400', category: 'Data' },
  { id: 'research', name: 'Research Scientist', role: 'R&D', icon: '🔬', color: 'text-cyan-400', category: 'Data' },
  { id: 'merchant', name: 'Merchant Ops', role: 'E-commerce', icon: '🛍️', color: 'text-violet-400', category: 'Operations' },
  { id: 'support', name: 'Support Responder', role: 'Helpdesk', icon: '🎧', color: 'text-teal-400', category: 'Operations' },
  { id: 'legal', name: 'Legal Advisor', role: 'Compliance', icon: '⚖️', color: 'text-slate-400', category: 'Operations' },
  { id: 'hr', name: 'HR Specialist', role: 'Recruitment', icon: '🤝', color: 'text-gray-400', category: 'Operations' },
  { id: 'seo', name: 'SEO Expert', role: 'Search Optimization', icon: '🔍', color: 'text-blue-500', category: 'Operations' },
  { id: 'community', name: 'Community Manager', role: 'Engagement', icon: '👥', color: 'text-emerald-500', category: 'Operations' },
];

export function ChatInterface() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [assistantId, setAssistantId] = useState('default');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const isNewTopic = useRef(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { events } = useEvents();
  const processedEventIds = useRef<Set<string>>(new Set());
  const agentMenuRef = useRef<HTMLDivElement>(null);

  // --- API Integrations ---

  const fetchTopics = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8088/api/chat/topics');
      const data = await res.json();
      setTopics(data);
      if (data.length > 0 && !activeTopicId) {
        setActiveTopicId(data[0].id);
        setAssistantId(data[0].assistant_id);
      }
    } catch (e) {
      console.error("Failed to fetch topics:", e);
    }
  };

  const fetchMessages = async (topicId: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:8088/api/chat/messages/${topicId}`);
      const data = await res.json();
      setMessages(data);
    } catch (e) {
      console.error("Failed to fetch messages:", e);
    }
  };

  const createTopic = async () => {
    const newId = `topic_${Math.random().toString(36).substr(2, 9)}`;
    try {
      await fetch('http://127.0.0.1:8088/api/chat/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newId, title: 'New Conversation', assistant_id: assistantId })
      });
      await fetchTopics();
      setActiveTopicId(newId);
      setMessages([]);
    } catch (e) {
      console.error("Failed to create topic:", e);
    }
  };

  const persistMessage = async (msg: Message) => {
    if (!activeTopicId) return;
    try {
      await fetch('http://127.0.0.1:8088/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic_id: activeTopicId,
          role: msg.role,
          content: msg.content,
          agent_id: msg.agent_id
        })
      });
    } catch (e) {
      console.error("Failed to persist message:", e);
    }
  };

  const deleteTopic = async (topicId: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:8088/api/chat/topics/${topicId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        // If the deleted topic is currently active, clear it
        if (activeTopicId === topicId) {
          setActiveTopicId(null);
          setMessages([]);
        }
        // Refresh the topics list
        await fetchTopics();
        setDeleteConfirmId(null);
      }
    } catch (e) {
      console.error("Failed to delete topic:", e);
    }
  };

  // --- Effects ---

  useEffect(() => {
    fetchTopics();
  }, []);

  useEffect(() => {
    if (activeTopicId && !isNewTopic.current) {
      fetchMessages(activeTopicId);
    } else if (isNewTopic.current) {
      isNewTopic.current = false; // Reset flag after skipping fetch
    }
  }, [activeTopicId]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  // Handle live events
  useEffect(() => {
    const newEvents = events.filter(e =>
      !processedEventIds.current.has(e.id) &&
      ['THOUGHT', 'RESULT', 'FAILURE'].includes(e.type)
    );

    if (newEvents.length > 0) {
      console.log(`🤖 [ChatInterface] Processing ${newEvents.length} new events:`, newEvents.map(e => ({id: e.id, type: e.type, data: e.data})));
      
      newEvents.forEach(evt => {
        processedEventIds.current.add(evt.id);

        // Extract content from various event data structures
        const rawContent =
          evt.data.result ||
          evt.data.thought ||
          evt.data.text ||
          (evt.data.details && (evt.data.details.text || evt.data.details.thought || evt.data.details.result)) ||
          evt.data.error || 'Processing...';

        console.log(`📝 [ChatInterface] Event ${evt.id} (${evt.type}) -> content: ${rawContent?.substring(0, 50)}...`);

        const newMsg: Message = {
          id: `evt_${evt.id}`,
          role: evt.type === 'THOUGHT' ? 'thought' : 'bot',
          content: rawContent,
          agent_id: evt.data.agent_id || evt.details?.agent_id,
          timestamp: evt.timestamp || new Date().toISOString()
        };

        setMessages(prev => [...prev, newMsg]);
        persistMessage(newMsg);
        if (evt.type === 'RESULT' || evt.type === 'FAILURE') setIsProcessing(false);
      });
    }
  }, [events]);

  // Click outside listener for agent menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (agentMenuRef.current && !agentMenuRef.current.contains(event.target as Node)) {
        setIsAgentMenuOpen(false);
      }
    };
    if (isAgentMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAgentMenuOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    // Trigger @mention menu
    if (value.endsWith('@')) {
      setIsAgentMenuOpen(true);
      setAgentSearch('');
    }
  };

  const sendMessage = async (text: string, topicId: string) => {
    const userMsg: Message = { id: Date.now(), role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    persistMessage(userMsg);
    setIsProcessing(true);

    try {
      await fetch('http://127.0.0.1:8088/sop/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sop_path: 'directives/chat_proxy.yaml',
          input: text,
          topic_id: topicId,
          assistant_id: assistantId,
          provider: localStorage.getItem('ensemble_provider') || 'gemini',
          model: localStorage.getItem('ensemble_model') || 'gemini-2.5-flash'
        })
      });
    } catch (e) {
      console.error("Execution failed:", e);
      setIsProcessing(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    // 1. Ensure we have a topic
    let topicId = activeTopicId;
    if (!topicId) {
      const newId = `topic_${Math.random().toString(36).substr(2, 9)}`;
      try {
        await fetch('http://127.0.0.1:8088/api/chat/topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: newId, title: 'New Conversation', assistant_id: assistantId })
        });
        await fetchTopics();
        setActiveTopicId(newId);
        isNewTopic.current = true; // Skip fetchMessages for this topic
        setMessages([]);
        topicId = newId;
      } catch (e) {
        console.error("Failed to create topic:", e);
        return;
      }
    }

    // 2. Send the message
    const messageText = input;
    setInput('');
    await sendMessage(messageText, topicId);
  };

  return (
    <div className="flex h-full bg-[#0a0a0a] overflow-hidden font-sans">
      
      {/* --- Sidebar (260px) --- */}
      <div className={`transition-all duration-300 border-r border-white/5 bg-[#0d0d0d] flex flex-col ${isSidebarOpen ? 'w-64' : 'w-0 opacity-0 overflow-hidden'}`}>
        <div className="p-4 border-bottom border-white/5">
          <button 
            onClick={createTopic}
            className="w-full flex items-center gap-2 justify-center py-2 px-4 rounded-lg border border-white/10 hover:bg-white/5 transition-all text-sm font-medium text-gray-300"
          >
            <Plus size={16} />
            New Conversation
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto px-2 space-y-1 py-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold px-3 mb-2">History</div>
          {topics.map(topic => (
            <div
              key={topic.id}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                activeTopicId === topic.id ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <button
                onClick={() => setActiveTopicId(topic.id)}
                className="flex-1 flex items-center gap-3 text-left min-w-0"
              >
                <MessageSquare size={16} className={activeTopicId === topic.id ? 'text-blue-400' : 'text-gray-600'} />
                <span className="flex-1 truncate">{topic.title}</span>
                <ChevronRight size={14} className={`transition-opacity ${activeTopicId === topic.id ? 'text-blue-400' : 'text-gray-700 opacity-0 group-hover:opacity-100'}`} />
              </button>
              
              {/* Delete button - shown on hover */}
              {!deleteConfirmId || deleteConfirmId !== topic.id ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmId(topic.id);
                  }}
                  className="absolute right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="Delete conversation"
                >
                  <Trash2 size={14} />
                </button>
              ) : (
                <div className="absolute right-2 flex items-center gap-1 bg-[#0d0d0d] rounded-lg p-1 border border-white/10 shadow-xl">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTopic(topic.id);
                    }}
                    className="p-1.5 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                    title="Confirm delete"
                  >
                    <Trash2 size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(null);
                    }}
                    className="p-1.5 rounded-md text-gray-400 hover:bg-white/10 transition-all"
                    title="Cancel"
                  >
                    <ChevronRight size={12} className="rotate-90" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 mt-auto border-t border-white/5 bg-black/20">
           <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-xs font-bold ring-2 ring-white/10">UI</div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-gray-200">Platform User</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-tighter">Enterprise Mode</span>
              </div>
           </div>
        </div>
      </div>

      {/* --- Main Chat Area --- */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        
        {/* --- Header --- */}
        <header className="h-16 border-b border-white/5 bg-black/40 backdrop-blur-md flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-500 hover:text-white transition-colors">
               <Archive size={20} />
            </button>
            <div className="h-4 w-[1px] bg-white/10" />
            <div className="flex items-center gap-2 text-sm text-gray-400 font-medium">
               <span>Ensemble</span>
               <ChevronRight size={14} className="text-gray-600" />
               <span className="text-gray-200">Core Network</span>
            </div>
          </div>

          <div className="flex items-center gap-2 relative">
            <div className="text-[10px] uppercase font-black text-gray-500 mr-2 tracking-widest leading-none">Specialist:</div>
            <button 
              onClick={() => setIsAgentMenuOpen(!isAgentMenuOpen)}
              className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/10 hover:bg-white/10 transition-all group"
            >
              <span className="text-lg">{AGENT_LIBRARY.find(a => a.id === assistantId)?.icon}</span>
              <div className="flex flex-col items-start leading-none">
                <span className="text-xs font-bold text-gray-200">{AGENT_LIBRARY.find(a => a.id === assistantId)?.name}</span>
                <span className="text-[9px] text-gray-500 font-medium uppercase tracking-tighter mt-0.5">{AGENT_LIBRARY.find(a => a.id === assistantId)?.role}</span>
              </div>
              <ChevronRight size={14} className={`text-gray-600 transition-transform ${isAgentMenuOpen ? 'rotate-90' : ''}`} />
            </button>

            {/* --- Searchable Agent Dropdown --- */}
            {isAgentMenuOpen && (
              <div ref={agentMenuRef} className="absolute top-full right-0 mt-2 w-80 bg-[#0d0d0d] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-3 border-b border-white/5">
                  <div className="relative">
                    <Terminal size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input 
                      autoFocus
                      placeholder="Search assistants..."
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50 transition-all"
                    />
                  </div>
                </div>
                <div className="max-h-[400px] overflow-y-auto p-2 custom-scrollbar">
                  {['System', 'Executive', 'Engineering', 'Creative', 'Data', 'Operations'].map(category => {
                    const categoryAgents = AGENT_LIBRARY.filter(a => 
                      a.category === category && 
                      (a.name.toLowerCase().includes(agentSearch.toLowerCase()) || a.role.toLowerCase().includes(agentSearch.toLowerCase()))
                    );
                    if (categoryAgents.length === 0) return null;
                    return (
                      <div key={category} className="mb-2">
                        <div className="text-[9px] uppercase tracking-widest text-gray-600 font-bold px-3 py-1">{category}</div>
                        {categoryAgents.map(agent => (
                          <button
                            key={agent.id}
                            onClick={() => {
                              setAssistantId(agent.id);
                              setIsAgentMenuOpen(false);
                              setAgentSearch('');
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
                              assistantId === agent.id ? 'bg-blue-600/10' : 'hover:bg-white/5'
                            }`}
                          >
                            <span className="text-xl group-hover:scale-110 transition-transform">{agent.icon}</span>
                            <div className="flex flex-col items-start flex-1 min-w-0">
                              <span className={`text-xs font-bold truncate ${assistantId === agent.id ? 'text-blue-400' : 'text-gray-200'}`}>
                                {agent.name}
                              </span>
                              <span className="text-[9px] text-gray-500 truncate capitalize">{agent.role}</span>
                            </div>
                            {assistantId === agent.id && (
                              <div className="px-2 py-0.5 bg-blue-500/20 rounded text-[8px] font-black uppercase text-blue-400 tracking-tighter">Active</div>
                            )}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* --- Message View --- */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth">
          <div className="max-w-4xl mx-auto py-10 px-6 space-y-10">
            {messages.length === 0 && !isProcessing && (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 animate-in fade-in zoom-in-95 duration-700">
                <div className="w-16 h-16 rounded-3xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4 shadow-2xl shadow-blue-500/10">
                  <Zap size={32} />
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight">Intelligence Ready.</h2>
                <p className="text-gray-500 max-w-sm text-sm leading-relaxed">
                  The active specialist <span className="text-blue-400">({assistantId})</span> is initialized. 
                  Provide direct instructions via the neural terminal below.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-6">
                  {['Perform audit...', 'Plan project...', 'Refactor logic...', 'Code analysis...'].map(hint => (
                    <button key={hint} onClick={() => setInput(hint)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-gray-400 hover:bg-white/10 transition-colors">
                      {hint}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {messages.map((msg, i) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 duration-500 fill-mode-both`} style={{ animationDelay: `${i * 100}ms` }}>
                <div className={`max-w-[90%] rounded-2xl flex gap-4 ${
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}>
                  <div className={`mt-1 shrink-0 w-8 h-8 rounded-xl flex items-center justify-center shadow-lg ${
                    msg.role === 'user' ? 'bg-blue-600 text-white' : 
                    msg.role === 'thought' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
                    'bg-[#1a1a1a] text-purple-400 border border-white/10'
                  }`}>
                    {msg.role === 'user' ? <User size={16} /> : (msg.role === 'thought' ? <Zap size={14} /> : <Bot size={16} />)}
                  </div>
                  
                  <div className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                      {msg.role === 'user' ? 'Authority' : (msg.role === 'thought' ? 'Neural Link' : `${AGENT_LIBRARY.find(a => a.id === assistantId)?.name || 'Ensemble'} Response`)}
                    </div>
                    <div className={`p-5 rounded-2xl text-sm leading-relaxed border shadow-2xl transition-all ${
                      msg.role === 'user' ? 'bg-blue-600/10 border-blue-600/30 text-blue-50' : 
                      msg.role === 'thought' ? 'bg-[#151515] border-white/5 text-gray-400 italic font-mono text-[13px] border-l-yellow-500/50' : 
                      'bg-[#151515] border-white/5 text-gray-200'
                    }`}>
                      <ReactMarkdown>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {isProcessing && (
              <div className="flex gap-4 animate-pulse">
                <div className="w-8 h-8 rounded-xl bg-purple-600/10 flex items-center justify-center text-purple-400 border border-purple-500/20">
                  <Loader2 size={16} className="animate-spin" />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">Thinking...</div>
                  <div className="h-4 w-12 bg-white/5 rounded-full flex items-center gap-1.5 px-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce duration-700" />
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce duration-700 delay-150" />
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce duration-700 delay-300" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* --- Input Section --- */}
        <div className="p-6 bg-gradient-to-t from-black via-black/90 to-transparent">
          <form onSubmit={handleSend} className="max-w-4xl mx-auto flex flex-col bg-white/5 border border-white/10 rounded-2xl shadow-2xl transition-all focus-within:border-blue-500/40 focus-within:ring-2 focus-within:ring-blue-500/10">
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={handleInputChange}
              disabled={isProcessing}
              placeholder={`Type your message here, press Enter to send...`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e as any);
                }
              }}
              className="w-full bg-transparent border-none px-6 py-4 text-sm text-gray-200 focus:outline-none resize-none placeholder:text-gray-700"
            />
            
            <div className="flex items-center justify-between px-4 pb-3">
              <div className="flex items-center gap-1">
                <button type="button" className="p-2 text-gray-600 hover:text-gray-400 transition-colors" title="Add (Coming soon)">
                  <Plus size={18} />
                </button>
                <button type="button" className="p-2 text-gray-600 hover:text-gray-400 transition-colors" title="Attach Files (Coming soon)">
                  <Paperclip size={18} />
                </button>
                <button type="button" className="p-2 text-gray-600 hover:text-gray-400 transition-colors" title="Web Search (Coming soon)">
                  <Globe size={18} />
                </button>
                <button type="button" className="p-2 text-gray-600 hover:text-gray-400 transition-colors" title="Parse Document (Coming soon)">
                  <FileText size={18} />
                </button>
                <button type="button" className="p-2 text-gray-600 hover:text-gray-400 transition-colors" title="Internal Tools (Coming soon)">
                  <Hammer size={18} />
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsAgentMenuOpen(true)}
                  className="p-2 text-blue-500/60 hover:text-blue-400 transition-colors" 
                  title="Mention Agent (@)"
                >
                  <AtSign size={18} />
                </button>
                <div className="h-4 w-[1px] bg-white/10 mx-1" />
                <button type="button" className="p-2 text-gray-600 hover:text-gray-400 transition-colors" title="More Options (Coming soon)">
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button type="button" className="p-2 text-gray-600 hover:text-gray-400 transition-colors" title="Switch Language (Coming soon)">
                  <Languages size={18} />
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || isProcessing}
                  className="p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-gray-700 text-white rounded-xl transition-all active:scale-95 shadow-xl shadow-blue-900/40"
                  title="Send Instruction"
                >
                  <ArrowUp size={20} />
                </button>
              </div>
            </div>
          </form>
          <div className="text-center mt-3 text-[10px] text-gray-700 font-medium uppercase tracking-widest flex items-center justify-center gap-2">
            <span>Neural Command Interface v1.5 Stable</span>
            <span className="w-1 h-1 rounded-full bg-gray-800" />
            <span className="text-blue-900/40">{AGENT_LIBRARY.find(a => a.id === assistantId)?.name} Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
