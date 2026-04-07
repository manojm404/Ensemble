import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mail, 
  Search, 
  Star, 
  Archive, 
  Trash2, 
  Reply, 
  MoreHorizontal,
  ChevronRight,
  TrendingDown,
  MailOpen,
  Briefcase,
  AlertCircle,
  Clock,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const MOCK_EMAILS = [
    { id: "e1", from: "Sarah Kim", fromAvatar: "SK", title: "New deployment approved", preview: "The staging environment is now live with the latest authentication changes...", time: "2m ago", unread: true, starred: true },
    { id: "e2", from: "System Alert", fromAvatar: "🤖", title: "Resource limit reached", preview: "Agent 'Engineer-01' has reached 80% of its monthly token grant...", time: "15m ago", unread: true, starred: false },
    { id: "e3", from: "Alex Chen", fromAvatar: "AC", title: "Weekly report prepared", preview: "I've synthesized the logs for last week. We saw a 12% increase in agent efficiency...", time: "1h ago", unread: false, starred: false },
    { id: "e4", from: "Marketing Bot", fromAvatar: "MB", title: "New leads generated", preview: "The outbound pipeline has surfaced 42 qualified prospects for review...", time: "3h ago", unread: false, starred: true },
];

export default function Inbox() {
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto h-full flex flex-col">
       <div>
          <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">Coordinate with your agents and team members</p>
       </div>

       <div className="flex-1 flex gap-6 overflow-hidden">
          {/* List */}
          <div className="w-full lg:w-[450px] flex flex-col gap-3 overflow-y-auto pr-2 scrollbar-none">
             {MOCK_EMAILS.map((email) => (
               <Card 
                 key={email.id}
                 className={`p-5 bg-card/40 backdrop-blur-sm border-border/40 rounded-2xl hover:border-primary/20 hover:bg-card/60 transition-all cursor-pointer relative overflow-hidden group shadow-lg ${selectedEmail === email.id ? 'border-primary/50' : ''}`}
                 onClick={() => setSelectedEmail(email.id)}
               >
                  <div className="flex items-start gap-4">
                     <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-sm font-bold shadow-inner group-hover:bg-primary/20 transition-colors">
                        {email.fromAvatar}
                     </div>
                     <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                           <span className="text-sm font-bold text-foreground/90 transition-colors group-hover:text-primary">{email.from}</span>
                           <span className="text-[10px] text-muted-foreground/30 font-bold uppercase tracking-widest">{email.time}</span>
                        </div>
                        <h4 className="text-sm font-bold text-foreground/80 mt-1 truncate tracking-tight">{email.title}</h4>
                        <p className="text-xs text-muted-foreground/40 mt-1 line-clamp-2 italic leading-relaxed">{email.preview}</p>
                     </div>
                  </div>
               </Card>
             ))}
          </div>

          {/* Detailed (Matches the visual pattern of screenshots) */}
          <div className="hidden lg:flex flex-1 rounded-[2.5rem] bg-card/20 border border-white/5 backdrop-blur-md flex-col p-8 overflow-y-auto shadow-2xl relative group">
             {selectedEmail ? (
                <div className="space-y-6">
                   <div className="flex items-center justify-between border-b border-white/5 pb-6 mb-8">
                      <div className="flex items-center gap-4">
                         <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center text-xl font-bold shadow-inner">
                            {MOCK_EMAILS.find(e => e.id === selectedEmail)?.fromAvatar}
                         </div>
                         <div>
                            <h3 className="text-xl font-bold tracking-tight">{MOCK_EMAILS.find(e => e.id === selectedEmail)?.from}</h3>
                            <p className="text-sm text-primary/60 font-medium">To: Team Ensemble</p>
                         </div>
                      </div>
                      <div className="flex items-center gap-2">
                         <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 hover:bg-white/5"><Reply className="h-4 w-4" /></Button>
                         <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 hover:bg-white/5"><Archive className="h-4 w-4" /></Button>
                         <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 hover:bg-white/5"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                   </div>
                   <h2 className="text-2xl font-bold tracking-tight mb-6">{MOCK_EMAILS.find(e => e.id === selectedEmail)?.title}</h2>
                   <div className="space-y-6 text-sm text-foreground/70 leading-relaxed max-w-3xl">
                      <p>Hello team,</p>
                      <p>{MOCK_EMAILS.find(e => e.id === selectedEmail)?.preview} This reflects our latest commitment to platform stability and agentic orchestration.</p>
                      <p>We've observed significant improvements in throughput across the ensemble, particularly in the engineering cluster. The next phase will involve a full-scale audit of the memory systems.</p>
                      <p>Best regards,<br/><span className="text-primary font-bold">{MOCK_EMAILS.find(e => e.id === selectedEmail)?.from}</span></p>
                   </div>
                </div>
             ) : (
                <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-20">
                   <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                      <MailOpen className="h-10 w-10" />
                   </div>
                   <p className="text-sm font-bold uppercase tracking-[0.2em]">Select an email to read</p>
                </div>
             )}
          </div>
       </div>
    </div>
  );
}
