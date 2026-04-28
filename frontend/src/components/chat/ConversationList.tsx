import { useState } from "react";
import { Plus, Search, Trash2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Conversation } from "./ChatView";
import { availableAgents, type AgentInfo } from "@/lib/agents";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onSearchOpen: () => void;
  onNewChat: (agent?: AgentInfo) => void;
  onDelete: (id: string) => void;
  availableAgents: AgentInfo[];
}

export function ConversationList({ 
  conversations, 
  activeId, 
  onSelect, 
  onSearchOpen, 
  onNewChat, 
  onDelete,
  availableAgents 
}: Props) {
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);

  return (
    <div className="w-64 border-r border-border/50 flex flex-col shrink-0 bg-card/30">
      <div className="p-3 flex items-center justify-between border-b border-border/50">
        <span className="text-sm font-medium text-foreground">Topics</span>
      </div>

      <div className="p-2 flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onSearchOpen}
        >
          <Search className="h-4 w-4" />
        </Button>

        <Popover open={agentPickerOpen} onOpenChange={setAgentPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground hover:text-primary ml-auto gap-1 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              New Topic
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" className="w-64 p-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
              Select an agent
            </p>
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
                        onNewChat(agent);
                        setAgentPickerOpen(false);
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
          </PopoverContent>
        </Popover>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-2 space-y-0.5">
          <AnimatePresence>
            {conversations.map((conv) => (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(conv.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        onSelect(conv.id);
                    }
                  }}
                  className={`w-full text-left rounded-lg px-3 py-2.5 transition-all duration-200 group relative cursor-pointer ${
                    activeId === conv.id
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-secondary/50 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{conv.agentEmoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {conv.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {conv.lastMessage}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(conv.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}
