/**
 * ChatView.tsx — Chat Workspace Orchestrator
 * 
 * The main chat page component. Manages:
 * - Conversation list (left sidebar)
 * - Message display area (center)
 * - Input bar (bottom)
 * - Agent name bar (top center)
 * - Assistant settings dialog
 * 
 * MOCKED:
 * - Conversations stored in local useState (no persistence)
 * - Bot responses are template strings after 800ms delay
 * - Mock conversation history (3 pre-seeded items)
 * 
 * TO INTEGRATE:
 * - Store conversations in database (Supabase)
 * - Stream real LLM responses via Edge Functions
 * - Persist assistant config per user
 * 
 * DO NOT CHANGE:
 * - The flex layout structure (sidebar | main | dialogs)
 * - Agent name bar positioning (centered with absolute-right controls)
 * - AnimatePresence mode="wait" on message area (prevents flash)
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { ConversationList } from "./ConversationList";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { TopicSearchDialog } from "./TopicSearchDialog";
import { AssistantSettingsDialog, defaultConfig, type AssistantConfig } from "./AssistantSettingsDialog";
import { defaultAgent, availableAgents as initialAgents, type AgentInfo } from "@/lib/agents";
import { fetchApi, WS_BASE_URL, deleteTopic, generateChatResponse, getModels, getAgents, type ModelInfo } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Settings2, ChevronDown, FolderTree } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useInspector } from "@/components/layout/InspectorPanel";
import { WorkspaceFileTree } from "@/components/workspace/WorkspaceFileTree";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  attachments?: any[];
}

export interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  agentName: string;
  agentEmoji: string;
}

/**
 * Fetch topics and messages using real API endpoints
 */

export function ChatView() {
  const { open: openInspector } = useInspector();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [assistantConfig, setAssistantConfig] = useState<AssistantConfig>(defaultConfig);
  const [currentAgent, setCurrentAgent] = useState<AgentInfo>(defaultAgent);
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>(initialAgents);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("gemini-2.5-flash");
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeProvider, setActiveProvider] = useState<{ provider: string; model: string } | null>(null);
  const [userHasMessaged, setUserHasMessaged] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch Topics
    fetchApi('/api/chat/topics')
      .then(data => {
        if (data && Array.isArray(data)) {
          const loadedConvs = data.map((t: any) => ({
            id: t.id,
            title: t.title || 'New Topic',
            lastMessage: '...',
            timestamp: new Date(t.updated_at),
            agentName: t.assistant_id || 'Ensemble',
            agentEmoji: '🤖'
          }));
          setConversations(loadedConvs);
        }
      })
      .catch(console.error);

    /** Fetch Available Models and active provider */
    getModels().then(setAvailableModels).catch((err) => console.warn("Failed to fetch models:", err));

    // Load active provider from backend
    fetchApi('/api/settings/provider')
      .then(config => {
        if (config && config.provider && config.model) {
          setSelectedModelId(config.model);
          setActiveProvider({ provider: config.provider, model: config.model });
        }
      })
      .catch((err) => console.warn("Failed to fetch provider:", err));

    /** Fetch Real Agents */
    getAgents().then(data => {
      if (data && data.length > 0) {
        setAvailableAgents([defaultAgent, ...data]);
        toast.info(`Synced ${data.length} specialists from registry`);
      }
    }).catch(err => {
      console.error("Agent sync failed:", err);
      toast.error("Failed to sync agents from backend");
    });

    // WebSocket connection — non-critical, silently skip if unavailable
    // Only attempt if user is authenticated (has a token)
    const hasToken = localStorage.getItem('ensemble_auth_token');
    if (hasToken) {
      try {
        const wsUrl = `${WS_BASE_URL.replace('http', 'ws')}/ws/default`;
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => {};
        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            // Handle WebSocket message
          } catch (e) {}
        };
        ws.onerror = () => {};
        ws.onclose = () => {};
        return () => {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        };
      } catch (err) {
        // WebSocket not supported or connection failed — continue without it
      }
    }
  }, []);

  useEffect(() => {
    if (activeConversation) {
      fetchApi(`/api/chat/messages/${activeConversation}`)
        .then(data => {
          if (data && Array.isArray(data) && data.length > 0) {
            const loadedMsgs = data.map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: new Date(m.timestamp)
            }));
            setMessages(loadedMsgs);
            // Mark that user has already messaged in this conversation (if it has history)
            setUserHasMessaged(prev => new Set(prev).add(activeConversation));
          }
        })
        .catch(console.error);
    } else {
      setMessages([]);
    }
  }, [activeConversation]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** Creates a new conversation with the specified (or current) agent */
  const handleNewChat = useCallback((agent?: AgentInfo) => {
    const a = agent || currentAgent;
    setCurrentAgent(a);
    const newConv: Conversation = {
      id: Date.now().toString(),
      title: "New conversation",
      lastMessage: "",
      timestamp: new Date(),
      agentName: a.name,
      agentEmoji: a.emoji,
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversation(newConv.id);
    setMessages([]);
    setUserHasMessaged(prev => new Set(prev).add(newConv.id));
  }, [currentAgent]);

  /** Switches active agent — shows toast confirmation */
  const handleAgentSwitch = useCallback((agent: AgentInfo) => {
    setCurrentAgent(agent);
    toast.success(`Switched to ${agent.emoji} ${agent.name}`);
  }, []);

  /** Deletes a conversation from the sidebar */
  const handleDeleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversation === id) {
      setActiveConversation(null);
      setMessages([]);
    }
    // Persist deletion
    deleteTopic(id).catch(err => {
      console.error("Failed to delete topic:", err);
      toast.error("Failed to delete chat remotely");
    });
  }, [activeConversation]);

  /**
   * Send message handler.
   */
  const handleSend = async (content: string, attachments?: any[]) => {
    let topicId = activeConversation;
    const isNew = !topicId;

    // Mark that user has messaged in this conversation
    const convId = topicId || Date.now().toString();
    setUserHasMessaged(prev => new Set(prev).add(convId));

    if (isNew) {
      topicId = convId;
      const creativeTitle = `${currentAgent.emoji} ${currentAgent.name} Session`;
      const newConv: Conversation = {
        id: topicId,
        title: creativeTitle,
        lastMessage: content.slice(0, 50),
        timestamp: new Date(),
        agentName: currentAgent.name,
        agentEmoji: currentAgent.emoji,
      };
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversation(topicId);

      // Create topic remotely
      try {
        await fetchApi('/api/chat/topics', {
          method: 'POST',
          body: JSON.stringify({
            id: topicId,
            title: creativeTitle,
            assistant_id: currentAgent.id
          })
        });
      } catch (err) {
        console.warn("Failed to create topic remotely:", err);
      }
    }

    const msgId = Date.now().toString();
    const userMsg: Message = {
      id: msgId,
      role: "user",
      content,
      timestamp: new Date(),
      attachments: attachments
    };
    setMessages((prev) => [...prev, userMsg]);

    // Save user message remotely
    try {
      await fetchApi('/api/chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          id: msgId,
          topic_id: topicId,
          role: "user",
          content,
          agent_id: currentAgent.id
        })
      });
    } catch (err) {
      console.warn("Failed to save user message:", err);
    }

    if (!isNew && messages.length <= 1) {
      setConversations((prev) =>
        prev.map((c) => c.id === topicId ? { ...c, title: content.slice(0, 40), lastMessage: content.slice(0, 50) } : c)
      );
    }

    /* REAL LLM CALL — Calling backend chat generation */
    setIsGenerating(true);
    try {
      const selectedModel = availableModels.find(m => m.id === selectedModelId) || { id: selectedModelId, provider: 'gemini' };
      const chatContext = messages.map(m => ({
        role: m.role,
        content: m.content + (m.attachments?.map(a => `\n[Attached File: ${a.name} at ${a.url}]`).join('') || '')
      }));
      chatContext.push({
        role: "user",
        content: content + (attachments?.map(a => `\n[Attached File: ${a.name} at ${a.url}]`).join('') || '')
      });

      const response = await generateChatResponse({
        messages: chatContext,
        model: selectedModel.id,
        provider: (selectedModel as any).provider,
        api_key: assistantConfig.prompt, // Use this as additional context if provided
        assistant_id: currentAgent.id // Pass the selected agent/skill ID to the backend
      });

      const botMsgId = Date.now().toString();
      const botMsg: Message = {
        id: botMsgId,
        role: "assistant",
        content: response.text || "I apologize, but I couldn't generate a response.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMsg]);

      // Persist bot message
      await fetchApi('/api/chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          id: botMsgId,
          topic_id: topicId,
          role: "assistant",
          content: botMsg.content,
          agent_id: currentAgent.id
        })
      });

    } catch (err) {
      console.error("Chat Generation Failed:", err);
      toast.error("Failed to generate AI response.");
    } finally {
      setIsGenerating(false);
    }
  };

  /* Use customized name/emoji for Ensemble, raw agent data for specialized agents */
  const displayName = currentAgent.id === "ensemble" ? assistantConfig.name : currentAgent.name;
  const displayEmoji = currentAgent.id === "ensemble" ? assistantConfig.emoji : currentAgent.emoji;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar — conversation list with agent picker */}
      <ConversationList
        conversations={conversations}
        activeId={activeConversation}
        availableAgents={availableAgents}
        onSelect={(id) => {
          setActiveConversation(id);
        }}
        onSearchOpen={() => setSearchOpen(true)}
        onNewChat={handleNewChat}
        onDelete={handleDeleteConversation}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/*
          Agent name bar — centered.
          - Click opens settings (for Ensemble) or does nothing (for specialized agents)
          - Right side: "Back to Ensemble" button + model badge + settings gear
          DO NOT CHANGE: The relative/absolute positioning pattern here
        */}
        <div className="flex items-center justify-center px-4 py-3 border-b border-border/30 bg-card/20 backdrop-blur-sm relative">
          <button
            onClick={() => currentAgent.id === "ensemble" ? setSettingsOpen(true) : null}
            className="flex items-center gap-2.5 px-4 py-1.5 rounded-lg hover:bg-muted/30 transition-colors group"
          >
            <span className="text-lg">{displayEmoji}</span>
            <h2 className="text-sm font-semibold transition-all group-hover:text-primary">
              {displayName}
            </h2>
            {currentAgent.id === "ensemble" && (
              <ChevronDown className="h-3 w-3 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
            )}
          </button>

          <div className="absolute right-3 flex items-center gap-2">
            {/* Active provider badge */}
            {activeProvider && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/5 border border-primary/10">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-medium text-muted-foreground">
                  {activeProvider.provider === "gemini" ? "Gemini" : activeProvider.provider === "ollama" ? "Ollama" : activeProvider.provider === "openai" ? "OpenAI" : activeProvider.provider === "anthropic" ? "Anthropic" : activeProvider.provider}
                </span>
              </div>
            )}

            {/* "Back to Ensemble" — only shown when using a specialized agent */}
            {currentAgent.id !== "ensemble" && (
              <button
                onClick={() => { setCurrentAgent(defaultAgent); toast.success("Switched back to Ensemble AI Assistant"); }}
                className="text-[10px] text-muted-foreground bg-muted/20 px-2.5 py-1 rounded-full hover:bg-muted/40 transition-colors font-medium"
              >
                ← Ensemble
              </button>
            )}
            {/* Settings gear — only for default Ensemble agent */}
            {currentAgent.id === "ensemble" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground/60 hover:text-foreground"
                  onClick={() => openInspector("Workspace", <WorkspaceFileTree />)}
                >
                  <FolderTree className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground/60 hover:text-foreground"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Message area — shows welcome state or conversation messages */}
        <AnimatePresence mode="wait">
          {messages.length === 0 && !activeConversation ? (
            /* Welcome state — shown when no conversation is selected */
            <motion.div
              key="welcome"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex-1 flex items-center justify-center"
            >
              <div className="text-center space-y-4">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 glow-primary"
                >
                  <Sparkles className="h-8 w-8 text-primary" />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                    {displayName}
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground max-w-md">
                    Start a conversation, or type <kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground text-xs font-mono">/</kbd> in the input to switch agents.
                  </p>
                </motion.div>
                {/* Quick-start suggestion buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="flex flex-wrap justify-center gap-2 mt-6"
                >
                  {["Review my code", "Design an API", "Debug this error", "Write tests"].map((s, i) => (
                    <motion.button
                      key={s}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4 + i * 0.08 }}
                      whileHover={{ scale: 1.05, y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleSend(s)}
                      className="rounded-lg border border-border/50 bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground hover:glow-primary"
                    >
                      {s}
                    </motion.button>
                  ))}
                </motion.div>
              </div>
            </motion.div>
          ) : (
            /* Conversation messages */
            <motion.div
              key="messages"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 overflow-hidden flex flex-col"
            >
              <ScrollArea ref={scrollAreaRef} className="flex-1 px-4 py-6">
                <div className="space-y-1">
                  {messages.map((msg, i) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i > messages.length - 3 ? 0.05 : 0, duration: 0.25 }}
                    >
                      <ChatMessage message={msg} agentEmoji={displayEmoji} />
                    </motion.div>
                  ))}
                  
                  {/* Thinking Animation */}
                  {isGenerating && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-4 px-4 py-4"
                    >
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm animate-pulse shadow-[0_0_15px_rgba(var(--primary),0.2)]">
                        {displayEmoji}
                      </div>
                      <div className="flex flex-col gap-1 mt-1.5">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.3s]" />
                          <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.15s]" />
                          <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" />
                        </div>
                        <span className="text-[10px] font-bold text-primary/40 uppercase tracking-widest mt-1">
                          Thinking...
                        </span>
                      </div>
                    </motion.div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat input bar — disabled state prevents double-sending during generation */}
        <ChatInput 
          onSend={handleSend} 
          onAgentSwitch={handleAgentSwitch} 
          disabled={isGenerating} 
          selectedModelId={selectedModelId}
          onModelChange={setSelectedModelId}
          availableModels={availableModels}
        />
      </div>

      {/* Topic search dialog (Cmd+K style) */}
      <TopicSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        conversations={conversations}
        onSelect={(id) => {
          setActiveConversation(id);
          setSearchOpen(false);
        }}
      />

      {/* Ensemble AI Assistant settings — 6-tab config dialog */}
      <AssistantSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        config={assistantConfig}
        onConfigChange={setAssistantConfig}
      />
    </div>
  );
}
