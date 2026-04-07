import { Bot, User, Copy, RotateCcw, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { Message } from "./ChatView";
import { API_BASE_URL } from "@/lib/api";

interface Props {
  message: Message;
  agentEmoji?: string;
}

export function ChatMessage({ message, agentEmoji }: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`group flex gap-3 py-4 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          {agentEmoji ? <span className="text-sm">{agentEmoji}</span> : <Bot className="h-4 w-4 text-primary" />}
        </div>
      )}
      <div className={`max-w-[70%] space-y-1.5 ${isUser ? "order-first" : ""}`}>
        <div
          className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground ml-auto shadow-sm"
              : "bg-card border border-border/50 text-foreground shadow-sm"
          }`}
        >
          {message.attachments && message.attachments.length > 0 && (
            <div className={`flex flex-wrap gap-2 mb-3 ${isUser ? "justify-end" : ""}`}>
              {message.attachments.map((att: any) => (
                <div key={att.id} className="relative group/att">
                  {att.type?.startsWith("image/") ? (
                    <img 
                      src={`${API_BASE_URL}${att.url}`} 
                      alt={att.name} 
                      className="max-w-[240px] max-h-[240px] rounded-lg border border-white/10 hover:brightness-110 transition-all cursor-zoom-in"
                    />
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-lg border border-border/50 text-[12px]">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="truncate max-w-[140px]">{att.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
        {!isUser && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3 text-badge-green" /> : <Copy className="h-3 w-3" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
          <User className="h-4 w-4 text-foreground" />
        </div>
      )}
    </div>
  );
}
