import { useState, useEffect } from "react";
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
import { getNotifications, markNotificationRead } from "@/lib/api";
import { useCompanyContext } from "@/lib/company-context";
import { scopedStorageKey } from "@/lib/storage-scope";

export default function Inbox() {
  const { currentCompany } = useCompanyContext();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const companyId = currentCompany?.id || localStorage.getItem(scopedStorageKey("ensemble_current_company")) || undefined;
      const data = await getNotifications(companyId || undefined);
      // Map backend fields to UI fields
      const mapped = (data || []).map((n: any) => ({
        id: n.id,
        unread: !!n.is_unread,
        from: n.from_name || "System",
        fromAvatar: n.from_avatar || "🤖",
        title: n.title,
        preview: n.preview,
        content: n.content,
        time: n.timestamp ? new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now",
        timestamp: n.timestamp,
        category: n.category
      }));
      setNotifications(mapped);
    } catch (e) {
      console.error("Failed to load notifications:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    const selected = notifications.find(n => n.id === id);
    if (selected && selected.unread) {
      // Optimistic update
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, unread: false } : n));
      await markNotificationRead(id);
    }
  };

  const selectedNotification = notifications.find(n => n.id === selectedId);

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto h-full flex flex-col bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--background))_100%)] text-foreground">
       <div className="flex items-center justify-between">
          <div>
             <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
             <p className="text-sm text-foreground/70 mt-1 font-medium">Coordinate with your agents and team members</p>
          </div>
             <Button variant="outline" size="sm" onClick={loadNotifications} className="rounded-xl border-border/60 bg-background/80 text-foreground/75 text-xs h-8 px-3">
             <Clock className="h-3.5 w-3.5 mr-2" /> Refresh
          </Button>
       </div>

       <div className="flex-1 flex gap-6 overflow-hidden">
          {/* List */}
          <div className="w-full lg:w-[450px] flex flex-col gap-3 overflow-y-auto pr-2 scrollbar-none">
             {loading && notifications.length === 0 ? (
                <div className="flex-1 flex items-center justify-center opacity-20">
                   <p className="text-sm font-bold uppercase tracking-widest">Scanning network...</p>
                </div>
             ) : notifications.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4 opacity-30">
                   <div className="h-20 w-20 rounded-full bg-card/80 border border-border/60 flex items-center justify-center shadow-sm">
                      <Sparkles className="h-10 w-10 text-primary" />
                   </div>
                   <p className="text-sm font-bold uppercase tracking-widest">Zero items in queue</p>
                   <p className="text-xs max-w-[200px]">Your inbox is empty. New notifications from agents will appear here.</p>
                </div>
             ) : (
                notifications.map((n) => (
                   <Card 
                     key={n.id}
                     className={`p-5 bg-card/80 backdrop-blur-sm border border-border/60 rounded-2xl hover:border-border hover:bg-card transition-all cursor-pointer relative overflow-hidden group shadow-[0_12px_40px_rgba(15,23,42,0.06)] ${selectedId === n.id ? 'border-border ring-1 ring-border/70' : ''}`}
                     onClick={() => handleSelect(n.id)}
                   >
                      {n.unread && <div className="absolute top-5 right-5 h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]" />}
                      <div className="flex items-start gap-4">
                         <div className="h-10 w-10 rounded-2xl bg-muted/70 border border-border/60 flex items-center justify-center text-sm font-bold shadow-inner group-hover:bg-muted transition-colors">
                            {n.fromAvatar || n.from?.charAt(0)}
                         </div>
                         <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                               <span className="text-sm font-bold text-foreground/90 transition-colors group-hover:text-primary">{n.from}</span>
                               <span className="text-[10px] text-foreground/55 font-bold uppercase tracking-widest">{n.time}</span>
                            </div>
                            <h4 className={`text-sm font-bold mt-1 truncate tracking-tight ${n.unread ? 'text-foreground' : 'text-foreground/75'}`}>{n.title}</h4>
                            <p className="text-xs text-foreground/65 mt-1 line-clamp-2 italic leading-relaxed">{n.preview}</p>
                         </div>
                      </div>
                   </Card>
                ))
             )}
          </div>

          {/* Detailed */}
          <div className="hidden lg:flex flex-1 rounded-[2.5rem] bg-card/75 border border-border/60 backdrop-blur-md flex-col p-8 overflow-y-auto shadow-[0_18px_60px_rgba(15,23,42,0.08)] relative group">
             {selectedNotification ? (
                <div className="space-y-6">
                   <div className="flex items-center justify-between border-b border-border/60 pb-6 mb-8">
                      <div className="flex items-center gap-4">
                         <div className="h-12 w-12 rounded-2xl bg-muted/70 border border-border/60 flex items-center justify-center text-xl font-bold shadow-inner">
                            {selectedNotification.fromAvatar || selectedNotification.from?.charAt(0)}
                         </div>
                         <div>
                            <h3 className="text-xl font-bold tracking-tight">{selectedNotification.from}</h3>
                            <p className="text-sm text-primary/75 font-medium">To: Team Esemble</p>
                         </div>
                      </div>
                      <div className="flex items-center gap-2">
                         <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 hover:bg-muted/70"><Reply className="h-4 w-4" /></Button>
                         <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 hover:bg-muted/70"><Archive className="h-4 w-4" /></Button>
                         <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 hover:bg-muted/70"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                   </div>
                   <h2 className="text-2xl font-bold tracking-tight mb-6">{selectedNotification.title}</h2>
                   <div className="space-y-6 text-sm text-foreground/75 leading-relaxed max-w-3xl whitespace-pre-wrap">
                      {selectedNotification.content || selectedNotification.preview}
                   </div>
                </div>
             ) : (
                <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-20">
                   <div className="h-20 w-20 rounded-full bg-card/80 flex items-center justify-center border border-border/60">
                      <MailOpen className="h-10 w-10" />
                   </div>
                   <p className="text-sm font-bold uppercase tracking-[0.2em]">Select an notification to read</p>
                </div>
             )}
          </div>
       </div>
    </div>
  );
}
