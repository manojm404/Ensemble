import { Bot, User, Copy, RotateCcw, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { Message } from "./ChatView";
import { API_BASE_URL } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
    <div className={`group flex gap-3 py-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-1">
          {agentEmoji ? <span className="text-sm">{agentEmoji}</span> : <Bot className="h-4 w-4 text-primary" />}
        </div>
      )}
      <div className={`max-w-[75%] space-y-1.5 ${isUser ? "order-first" : ""}`}>
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
          {!isUser ? (
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Style code blocks
                  code: ({ className, children, ...props }: any) => {
                    const isInline = !className;
                    if (isInline) {
                      return (
                        <code className="px-1.5 py-0.5 rounded-md bg-muted/80 text-xs font-mono text-foreground" {...props}>
                          {children}
                        </code>
                      );
                    }
                    // Extract language from className
                    const match = /language-(\w+)/.exec(className);
                    return (
                      <div className="relative my-2 rounded-lg border border-border/50 overflow-hidden">
                        {match && (
                          <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                            <span>{match[1]}</span>
                          </div>
                        )}
                        <code className={`block p-3 text-xs font-mono overflow-x-auto bg-background/50 ${className || ""}`} {...props}>
                          {children}
                        </code>
                      </div>
                    );
                  },
                  // Style headings
                  h1: ({ children, ...props }: any) => (
                    <h1 className="text-lg font-bold mt-3 mb-2 first:mt-0" {...props}>{children}</h1>
                  ),
                  h2: ({ children, ...props }: any) => (
                    <h2 className="text-base font-bold mt-3 mb-2 first:mt-0" {...props}>{children}</h2>
                  ),
                  h3: ({ children, ...props }: any) => (
                    <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0" {...props}>{children}</h3>
                  ),
                  // Style lists
                  ul: ({ children, ...props }: any) => (
                    <ul className="list-disc pl-4 my-2 space-y-1" {...props}>{children}</ul>
                  ),
                  ol: ({ children, ...props }: any) => (
                    <ol className="list-decimal pl-4 my-2 space-y-1" {...props}>{children}</ol>
                  ),
                  li: ({ children, ...props }: any) => (
                    <li className="text-sm" {...props}>{children}</li>
                  ),
                  // Style blockquotes
                  blockquote: ({ children, ...props }: any) => (
                    <blockquote className="border-l-2 border-primary/50 pl-3 py-1 my-2 italic text-muted-foreground" {...props}>
                      {children}
                    </blockquote>
                  ),
                  // Style tables
                  table: ({ children, ...props }: any) => (
                    <div className="my-2 overflow-x-auto rounded-md border border-border/50">
                      <table className="w-full text-xs" {...props}>{children}</table>
                    </div>
                  ),
                  th: ({ children, ...props }: any) => (
                    <th className="px-3 py-2 text-left font-semibold bg-muted/50 border-b border-border/50" {...props}>{children}</th>
                  ),
                  td: ({ children, ...props }: any) => (
                    <td className="px-3 py-2 border-b border-border/30" {...props}>{children}</td>
                  ),
                  // Style links
                  a: ({ children, href, ...props }: any) => (
                    <a href={href} className="text-primary underline hover:text-primary/80 transition-colors" target="_blank" rel="noopener noreferrer" {...props}>
                      {children}
                    </a>
                  ),
                  // Style horizontal rules
                  hr: (props: any) => (
                    <hr className="my-3 border-border/50" {...props} />
                  ),
                  // Style paragraphs
                  p: ({ children, ...props }: any) => (
                    <p className="text-sm leading-relaxed mb-2 last:mb-0" {...props}>{children}</p>
                  ),
                  // Style strong/bold
                  strong: ({ children, ...props }: any) => (
                    <strong className="font-semibold" {...props}>{children}</strong>
                  ),
                  // Style emphasis/italic
                  em: ({ children, ...props }: any) => (
                    <em className="italic" {...props}>{children}</em>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{message.content}</div>
          )}
        </div>
        {!isUser && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
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
