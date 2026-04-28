/**
 * ChatInput.tsx — Rich Chat Input Component
 * 
 * The main message input bar for the chat workspace. Supports:
 * - File & image attachments (opens native file picker)
 * - Emoji insertion (random from curated set)
 * - Web search toggle (shows toast, MOCKED — no real search)
 * - Expand/Collapse textarea
 * - Quick Phrases (⚡ button — inserts pre-built prompts)
 * - Knowledge Base (📖 button — MOCKED, shows toast)
 * - `/` slash commands to switch AI agents
 * - `@` at-commands to switch LLM models
 * 
 * MOCKED:
 * - File/image attachments only show toast, no actual upload
 * - Knowledge base attachment only shows toast
 * - Quick phrases are hardcoded (should come from Settings)
 * - Model switching is local state only
 * 
 * DO NOT CHANGE:
 * - The popup menu animation pattern (AnimatePresence + motion.div)
 * - Keyboard navigation logic (ArrowUp/Down/Enter/Tab/Escape)
 * - Button icon sizing (h-7 w-7 for toolbar, h-8 w-8 for send)
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Send, AtSign, Loader2, Paperclip, Image as ImageIcon, Search, Zap, BookOpen, Globe, Wand2, Expand, Shrink, X, FileText, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { API_BASE_URL } from "@/lib/api";
import { availableAgents, type AgentInfo } from "@/lib/agents";
import { motion, AnimatePresence } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { type ModelInfo } from "@/lib/api";

/**
 * MOCKED — Available LLM models for the @model selector.
 * TO INTEGRATE: Fetch from user's configured providers in Settings → Model Provider.
 */
const MODEL_PROVIDERS = [
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", emoji: "🟢" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", emoji: "🟢" },
  { id: "claude-4-sonnet", name: "Claude 4 Sonnet", provider: "Anthropic", emoji: "🟠" },
  { id: "claude-4-opus", name: "Claude 4 Opus", provider: "Anthropic", emoji: "🟠" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", emoji: "🔵" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", emoji: "🔵" },
  { id: "llama-4", name: "Llama 4", provider: "Meta", emoji: "🟣" },
  { id: "deepseek-r2", name: "DeepSeek R2", provider: "DeepSeek", emoji: "⚪" },
];

/**
 * MOCKED — Quick phrase shortcuts.
 * TO INTEGRATE: Load from Settings → Quick Phrases (user-configurable).
 */
const QUICK_PHRASES = [
  { label: "Explain this", text: "Can you explain this in simple terms?" },
  { label: "Summarize", text: "Please summarize the key points." },
  { label: "Fix bugs", text: "Can you help me identify and fix bugs in this code?" },
  { label: "Write tests", text: "Generate comprehensive unit tests for this." },
  { label: "Improve perf", text: "How can I optimize this for better performance?" },
  { label: "Refactor", text: "Refactor this code to follow best practices." },
  { label: "Translate", text: "Translate this content to a professional tone." },
  { label: "Pros & Cons", text: "List the pros and cons of this approach." },
];

/**
 * MOCKED — Knowledge base entries.
 * TO INTEGRATE: Load from database. Each KB should contain indexed documents
 * that get injected into the LLM context (RAG pattern).
 */
const KNOWLEDGE_BASES = [
  { id: "docs", name: "Project Docs", icon: "📄", files: 12 },
  { id: "codebase", name: "Codebase Context", icon: "💻", files: 47 },
  { id: "notes", name: "Meeting Notes", icon: "📋", files: 8 },
  { id: "research", name: "Research Papers", icon: "🔬", files: 5 },
  { id: "designs", name: "Design Specs", icon: "🎨", files: 3 },
];

/** Which popup menu is currently open (only one at a time) */
type PopupMenu = "slash" | "model" | "phrases" | "knowledge" | null;

interface Props {
  onSend: (content: string, attachments?: any[]) => void;
  onAgentSwitch?: (agent: AgentInfo) => void;
  disabled?: boolean;
  selectedModelId: string;
  onModelChange: (id: string) => void;
  availableModels: ModelInfo[];
}

export function ChatInput({ onSend, onAgentSwitch, disabled, selectedModelId, onModelChange, availableModels }: Props) {
  const [value, setValue] = useState("");
  /** MOCKED — Web search toggle. When true, responses should include web results. */
  const [webSearch, setWebSearch] = useState(false);
  /** Controls textarea height — expanded mode for long-form input */
  const [expanded, setExpanded] = useState(false);
  const [activeMenu, setActiveMenu] = useState<PopupMenu>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  const selectedModel = availableModels.find(m => m.id === selectedModelId) || { id: selectedModelId, name: selectedModelId, provider: "Unknown" };
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Hidden file inputs — triggered by toolbar buttons */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  /**
   * Slash & At command detection.
   * - `/` at start of input → opens agent switcher
   * - `@` anywhere → opens model selector
   * Both support type-to-filter.
   */
  useEffect(() => {
    const slashMatch = value.match(/^\/(\S*)$/);
    if (slashMatch) {
      const query = slashMatch[1].toLowerCase();
      const filtered = availableAgents.filter(
        (a) => a.name.toLowerCase().includes(query) || a.id.toLowerCase().includes(query)
      );
      if (filtered.length > 0) {
        setActiveMenu("slash");
        setMenuIndex(0);
      } else {
        if (activeMenu === "slash") setActiveMenu(null);
      }
      return;
    }

    const atMatch = value.match(/@(\S*)$/);
    if (atMatch) {
      setActiveMenu("model");
      setMenuIndex(0);
      return;
    }

    if (activeMenu === "slash" || activeMenu === "model") setActiveMenu(null);
  }, [value]);

  const getFilteredAgents = () => {
    const match = value.match(/^\/(\S*)$/);
    const query = match ? match[1].toLowerCase() : "";
    return availableAgents.filter(
      (a) => a.name.toLowerCase().includes(query) || a.id.toLowerCase().includes(query)
    ).slice(0, 6);
  };

  const getFilteredModels = () => {
    const match = value.match(/@(\S*)$/);
    const query = match ? match[1].toLowerCase() : "";
    return availableModels.filter(
      (m) => m.name.toLowerCase().includes(query) || m.provider.toLowerCase().includes(query)
    );
  };

  /** Send message — clears input and collapses if expanded */
  const handleSend = () => {
    if ((!value.trim() && attachments.length === 0) || activeMenu) return;
    onSend(value.trim(), attachments);
    setValue("");
    setAttachments([]);
    setExpanded(false);
  };

  /** Agent switch — notifies parent, clears input, closes menu */
  const selectAgent = (agent: AgentInfo) => {
    onAgentSwitch?.(agent);
    setValue("");
    setActiveMenu(null);
  };

  /** Model switch — updates local state, strips @ from input, shows toast */
  const selectModel = (model: ModelInfo) => {
    onModelChange(model.id);
    setValue(value.replace(/@\S*$/, ""));
    setActiveMenu(null);
    toast.success(`Switched to ${model.name}`, { description: model.provider });
    textareaRef.current?.focus();
  };

  /** Quick phrase — appends text to current input */
  const insertPhrase = (text: string) => {
    setValue((prev) => (prev ? prev + " " + text : text));
    setActiveMenu(null);
    textareaRef.current?.focus();
  };

  /** Knowledge base attach — MOCKED: shows toast only. TO INTEGRATE: inject docs into context */
  const attachKnowledge = (kb: typeof KNOWLEDGE_BASES[0]) => {
    toast.success(`${kb.name} attached`, { description: `${kb.files} files added to context` });
    setActiveMenu(null);
    textareaRef.current?.focus();
  };

  const getMenuItems = useCallback(() => {
    if (activeMenu === "slash") return getFilteredAgents();
    if (activeMenu === "model") return getFilteredModels();
    if (activeMenu === "phrases") return QUICK_PHRASES;
    if (activeMenu === "knowledge") return KNOWLEDGE_BASES;
    return [];
  }, [activeMenu, value]);

  /**
   * Keyboard navigation for popup menus.
   * DO NOT CHANGE: ArrowUp/Down for selection, Enter/Tab to confirm, Escape to close.
   * When no menu is open, Enter sends message (Shift+Enter for newline).
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (activeMenu) {
      const items = getMenuItems();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenuIndex((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenuIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (activeMenu === "slash") selectAgent((items as AgentInfo[])[menuIndex]);
        else if (activeMenu === "model") selectModel((items as ModelInfo[])[menuIndex]);
        else if (activeMenu === "phrases") insertPhrase((items as typeof QUICK_PHRASES)[menuIndex].text);
        else if (activeMenu === "knowledge") attachKnowledge((items as typeof KNOWLEDGE_BASES)[menuIndex]);
      } else if (e.key === "Escape") {
        setActiveMenu(null);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** REAL — File/Image upload. Calls API and updates attachments list. */
  const uploadFile = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      setAttachments((prev) => [...prev, data]);
      toast.success(`Uploaded ${file.name}`);
    } catch (err) {
      console.error(err);
      toast.error(`Failed to upload ${file.name}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(uploadFile);
    e.target.value = "";
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(uploadFile);
    e.target.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  /** Inserts a random emoji at cursor position */
  const handleEmojiClick = () => {
    const emojis = ["👍", "❤️", "😊", "🎉", "🔥", "✨", "💡", "🚀"];
    setValue((prev) => prev + emojis[Math.floor(Math.random() * emojis.length)]);
    textareaRef.current?.focus();
  };

  /**
   * Renders the content for whichever popup menu is active.
   * All menus share the same container/animation — only content differs.
   * DO NOT CHANGE: The button hover/selection styling (bg-primary/10 pattern).
   */
  const renderMenuContent = () => {
    if (activeMenu === "slash") {
      const agents = getFilteredAgents();
      return (
        <>
          <div className="px-3 py-2 border-b border-border/30">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Switch agent — type to filter</p>
          </div>
            <ScrollArea className="h-[400px]">
              {Object.entries(
                availableAgents.reduce((acc, agent) => {
                  const cat = agent.category || "General";
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(agent);
                  return acc;
                }, {} as Record<string, AgentInfo[]>)
              ).map(([category, agents]) => (
                <div key={category} className="mb-2">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest bg-muted/20">
                    {category}
                  </div>
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => {
                        selectAgent(agent);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-left group"
                    >
                      <span className="text-base group-hover:scale-110 transition-transform">{agent.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">{agent.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{agent.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </ScrollArea>
        </>
      );
    }

    if (activeMenu === "model") {
      const models = getFilteredModels();
      return (
        <>
          <div className="px-3 py-2 border-b border-border/30">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Select model — type to filter</p>
          </div>
          <div className="py-1 max-h-[240px] overflow-y-auto">
            {models.map((model: any, i) => (
              <button key={model.id} onClick={() => selectModel(model)} onMouseEnter={() => setMenuIndex(i)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${i === menuIndex ? "bg-primary/10 text-foreground" : "hover:bg-muted/40 text-foreground"}`}>
                <span className="text-base">{model.emoji || "🤖"}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{model.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{model.provider}</p>
                </div>
                {/* Shows "Active" badge on the currently selected model */}
                {selectedModelId === model.id && <span className="text-[10px] text-primary font-medium">Active</span>}
              </button>
            ))}
          </div>
        </>
      );
    }

    if (activeMenu === "phrases") {
      return (
        <>
          <div className="px-3 py-2 border-b border-border/30">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quick Phrases</p>
          </div>
          <div className="py-1 max-h-[240px] overflow-y-auto">
            {QUICK_PHRASES.map((phrase, i) => (
              <button key={phrase.label} onClick={() => insertPhrase(phrase.text)} onMouseEnter={() => setMenuIndex(i)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${i === menuIndex ? "bg-primary/10 text-foreground" : "hover:bg-muted/40 text-foreground"}`}>
                <Zap className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{phrase.label}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{phrase.text}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      );
    }

    if (activeMenu === "knowledge") {
      return (
        <>
          <div className="px-3 py-2 border-b border-border/30">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Knowledge Bases</p>
          </div>
          <div className="py-1 max-h-[240px] overflow-y-auto">
            {KNOWLEDGE_BASES.map((kb, i) => (
              <button key={kb.id} onClick={() => attachKnowledge(kb)} onMouseEnter={() => setMenuIndex(i)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${i === menuIndex ? "bg-primary/10 text-foreground" : "hover:bg-muted/40 text-foreground"}`}>
                <span className="text-base">{kb.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{kb.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{kb.files} files</p>
                </div>
              </button>
            ))}
          </div>
        </>
      );
    }
    return null;
  };

  return (
    <div className="border-t border-border/50 p-4">
      <div className="mx-auto max-w-3xl relative">
        {/* Hidden file inputs — triggered programmatically by toolbar buttons */}
        <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileChange} />
        <input type="file" ref={imageInputRef} className="hidden" multiple accept="image/*" onChange={handleImageChange} />

        {/* Unified popup menu container — only one menu visible at a time */}
        <AnimatePresence>
          {activeMenu && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute bottom-full mb-2 left-0 w-72 rounded-xl border border-border/50 bg-card shadow-xl overflow-hidden z-20"
            >
              {renderMenuContent()}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active model badge — click to open model picker, or type @ in input */}
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <button
            onClick={() => { setActiveMenu(activeMenu === "model" ? null : "model"); setMenuIndex(0); }}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <span>{(selectedModel as any).emoji || "🤖"}</span>
            <span>{selectedModel.name}</span>
            <AtSign className="h-3 w-3 opacity-50" />
          </button>
        </div>

        {/* Attachment previews — displayed above input when files are present */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 px-1">
            {attachments.map((file) => (
              <div key={file.id} className="relative group flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/50 bg-secondary/30 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2">
                {file.type?.startsWith("image/") ? (
                  <img src={`${API_BASE_URL}${file.url}`} alt={file.name} className="h-6 w-6 rounded object-cover" />
                ) : (
                  <FileText className="h-4 w-4 text-primary" />
                )}
                <span className="text-[11px] font-medium max-w-[120px] truncate">{file.name}</span>
                <button onClick={() => removeAttachment(file.id)} className="h-4 w-4 flex items-center justify-center rounded-full bg-foreground/10 hover:bg-destructive shadow-sm transition-colors">
                  <X className="h-2 w-2 text-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Main input container — glassmorphic card with border glow on focus */}
        <div className={`rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm focus-within:border-primary/30 transition-all ${expanded ? "shadow-lg" : ""} ${isUploading ? "opacity-70 grayscale" : ""}`}>
          {/* Textarea — height changes based on expanded state */}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={disabled ? "Ensemble is thinking..." : "Message... ( / agents  @ models )"}
            className={`resize-none border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground ${expanded ? "min-h-[200px] max-h-[60vh]" : "min-h-[44px] max-h-[200px]"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            rows={expanded ? 8 : 1}
          />

          {/* Toolbar — DO NOT CHANGE icon sizes (h-7 w-7) or gap spacing */}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-0.5">
              {/* 📎 Attach file — opens native file picker */}
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent>Attach file</TooltipContent></Tooltip>

              {/* 🖼 Upload image — opens native image picker */}
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => imageInputRef.current?.click()}>
                  <ImageIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent>Upload image</TooltipContent></Tooltip>

              {/* 😊 Emoji — inserts random emoji at end of text */}
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handleEmojiClick}>
                  <Smile className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent>Insert emoji</TooltipContent></Tooltip>

              {/* 🌐 Web search toggle — MOCKED: just toggles state + shows toast */}
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={`h-7 w-7 ${webSearch ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => { setWebSearch(!webSearch); toast.info(webSearch ? "Web search disabled" : "Web search enabled"); }}>
                  <Globe className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent>Web search {webSearch ? "ON" : "OFF"}</TooltipContent></Tooltip>

              {/* Separator between basic tools and advanced tools */}
              <div className="w-px h-4 bg-border/50 mx-1" />

              {/* ↕ Expand/Collapse — toggles textarea between compact and full-size */}
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={`h-7 w-7 ${expanded ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setExpanded(!expanded)}>
                  {expanded ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                </Button>
              </TooltipTrigger><TooltipContent>{expanded ? "Collapse" : "Expand"}</TooltipContent></Tooltip>

              {/* ⚡ Quick phrases — opens phrase picker popup */}
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={`h-7 w-7 ${activeMenu === "phrases" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => { setActiveMenu(activeMenu === "phrases" ? null : "phrases"); setMenuIndex(0); }}>
                  <Zap className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent>Quick phrases</TooltipContent></Tooltip>

              {/* 📖 Knowledge base — opens KB picker popup (MOCKED) */}
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={`h-7 w-7 ${activeMenu === "knowledge" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => { setActiveMenu(activeMenu === "knowledge" ? null : "knowledge"); setMenuIndex(0); }}>
                  <BookOpen className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent>Knowledge base</TooltipContent></Tooltip>
            </div>

            {/* Send button — disabled when input empty, popup menu is open, or AI is generating */}
            <Button size="icon" className="h-8 w-8 rounded-lg" onClick={handleSend} disabled={!value.trim() || !!activeMenu || disabled}>
              {disabled ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
