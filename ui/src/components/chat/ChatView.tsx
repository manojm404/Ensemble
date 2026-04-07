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

import { useState, useCallback, useEffect } from "react";
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
const companyId = "company_alpha";

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

    /** Fetch Available Models */
    getModels().then(setAvailableModels).catch(console.error);

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

    // Setup WebSocket
    const ws = new WebSocket(`${WS_BASE_URL.replace('http', 'ws')}/ws/${companyId}`);
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        console.log("WebSocket event:", payload);
      } catch (e) {}
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    if (activeConversation) {
      fetchApi(`/api/chat/messages/${activeConversation}`)
        .then(data => {
          if (data && Array.isArray(data)) {
            const loadedMsgs = data.map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: new Date(m.timestamp)
            }));
            setMessages(loadedMsgs);
          }
        })
        .catch(console.error);
    } else {
      setMessages([]);
    }
  }, [activeConversation]);

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
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Hello, I'm ${a.name}. ${a.description}. You can start chatting with me right away!`,
        timestamp: new Date(),
      },
    ]);
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

    if (isNew) {
      topicId = Date.now().toString(); // Temporary local ID, or better use real UUID. Let's let the backend accept it.
      const newConv: Conversation = {
        id: topicId,
        title: content.slice(0, 40),
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
            title: content.slice(0, 40),
            assistant_id: currentAgent.id
          })
        });
      } catch (err) { }
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
    } catch (err) { }

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
          const conv = conversations.find((c) => c.id === id);
          if (conv) {
            setMessages([
              {
                id: "welcome",
                role: "assistant",
                content: `Hello, I'm ${conv.agentName}. You can start chatting with me right away`,
                timestamp: new Date(),
              },
            ]);
          }
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
        <div className="flex items-center justify-center px-4 py-2.5 border-b border-border/50 bg-card/30 relative">
          <button
            onClick={() => currentAgent.id === "ensemble" ? setSettingsOpen(true) : null}
            className="flex items-center gap-2 px-3 py-1 rounded-lg hover:bg-muted/40 transition-colors group"
          >
            <span className="text-base">{displayEmoji}</span>
            <h2 className="text-sm font-medium transition-all group-hover:text-primary">
              {displayName}
            </h2>
            {currentAgent.id === "ensemble" && (
              <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
          </button>

          <div className="absolute right-3 flex items-center gap-1.5">
            {/* "Back to Ensemble" — only shown when using a specialized agent */}
            {currentAgent.id !== "ensemble" && (
              <button
                onClick={() => { setCurrentAgent(defaultAgent); toast.success("Switched back to Ensemble AI Assistant"); }}
                className="text-[10px] text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full hover:bg-muted/50 transition-colors"
              >
                ← Back to Ensemble
              </button>
            )}
            {/* Settings gear — only for default Ensemble agent */}
            {currentAgent.id === "ensemble" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => openInspector("Workspace", <WorkspaceFileTree />)}
                >
                  <FolderTree className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
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
              className="flex-1 overflow-y-auto px-4 py-6 space-y-1"
            >
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
