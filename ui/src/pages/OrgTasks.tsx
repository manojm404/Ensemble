import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  PauseCircle,
  ChevronRight,
  Target,
  MoreVertical,
  Activity,
  Briefcase,
  X,
  Save,
  Loader2,
  Play,
  FileText,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getOrgById,
  getTasksByOrg,
  getAgentsByOrg,
  getDepartmentsByOrg,
  createTask,
  addActivityEvent
} from "@/lib/org-data";
import { runTask } from "@/lib/task-executor";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.4 }
  }
};

export default function OrgTasks() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const org = getOrgById(id || "");
  const tasks = getTasksByOrg(id || "");
  const agents = getAgentsByOrg(id || "");
  const departments = getDepartmentsByOrg(id || "");

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [taskOpen, setTaskOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [outputExpanded, setOutputExpanded] = useState<string | null>(null);

  // Task form state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [taskAgent, setTaskAgent] = useState("");
  const [taskSchedule, setTaskSchedule] = useState("now");

  const resetForm = () => {
    setTaskTitle("");
    setTaskDesc("");
    setTaskPriority("medium");
    setTaskAgent("");
    setTaskSchedule("now");
  };

  // Auto-refresh every 3s
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setRefreshKey(k => k + 1), 3000);
    return () => clearInterval(interval);
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = task.title.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = activeTab === "all" || task.status === activeTab;
      return matchesSearch && matchesStatus;
    });
  }, [tasks, search, activeTab, refreshKey]);

  const handleCreateTask = async () => {
    if (!taskTitle.trim()) {
      toast.error("Task title is required");
      return;
    }
    if (!taskAgent) {
      toast.error("Please assign an agent");
      return;
    }
    setLoading(true);
    try {
      const agent = agents.find(a => a.id === taskAgent);
      // Task inherits agent's department automatically
      const newTask = createTask(id || "", {
        title: taskTitle,
        description: taskDesc,
        priority: taskPriority,
        agentId: taskAgent,
        departmentId: agent?.departmentId || "",
        emoji: "🎯",
      });

      addActivityEvent(id || "", "task", `📋 New task: "${taskTitle}" → ${agent?.name}`);

      // If schedule is "now", execute immediately
      if (taskSchedule === "now") {
        setExecutingId(newTask.id);
        const result = await runTask(id || "", newTask.id, taskAgent, taskTitle, taskDesc);
        setExecutingId(null);
        
        if (result.success) {
          toast.success(`Task completed: "${taskTitle}"`);
        } else {
          toast.error(`Task failed: "${taskTitle}"`);
        }
      } else {
        toast.success(`Task scheduled: "${taskTitle}"`);
      }

      setTaskOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Failed to create task");
    } finally {
      setLoading(false);
    }
  };

  const handleRunTask = async (task: any) => {
    setExecutingId(task.id);
    try {
      const result = await runTask(id || "", task.id, task.agentId, task.title, task.description);
      if (result.success) {
        toast.success(`Task completed: "${task.title}"`);
      } else {
        toast.error(`Task failed: "${task.title}"`);
      }
    } catch (err: any) {
      toast.error(err.message || "Task execution failed");
    } finally {
      setExecutingId(null);
    }
  };

  if (!org) return <div className="flex items-center justify-center h-full text-muted-foreground">Organization not found</div>;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 space-y-8 flex flex-col">
      {/* HEADER */}
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/org/${id}`)}
            className="w-fit p-0 h-6 text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 mr-1 group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
          </Button>
          <h1 className="text-2xl font-bold tracking-tight mt-2">Task Board</h1>
          <p className="text-sm text-muted-foreground font-medium uppercase tracking-widest text-[10px] opacity-60">
             {tasks.length} total tasks · {tasks.filter(t => t.status === 'in_progress').length} in progress
          </p>
        </div>
        <Button variant="default" size="lg" className="rounded-2xl h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-bold uppercase tracking-widest text-[11px] gap-2 shadow-xl border border-primary/20" onClick={() => { resetForm(); setTaskOpen(true); }}>
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </header>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <Target className="h-12 w-12 text-muted-foreground/30" />
          <div className="text-center">
            <p className="text-sm text-muted-foreground">No tasks yet. Click "New Task" to assign work to your agents.</p>
          </div>
        </div>
      ) : (
        <>
          {/* TOOLBAR */}
          <div className="flex items-center justify-between gap-6 px-1">
            <div className="relative flex-1 max-w-lg group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search tasks..."
                className="h-12 pl-12 bg-card/40 backdrop-blur-sm border-border/40 rounded-2xl focus-visible:ring-primary/20 font-medium text-sm transition-all focus:bg-card/60"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
              <StatusFilterItem label="All" count={tasks.length} active={activeTab === "all"} onClick={() => setActiveTab("all")} />
              <StatusFilterItem label="In Progress" count={tasks.filter(t => t.status === 'in_progress').length} active={activeTab === "in_progress"} onClick={() => setActiveTab("in_progress")} />
              <StatusFilterItem label="Queued" count={tasks.filter(t => t.status === 'queued').length} active={activeTab === "queued"} onClick={() => setActiveTab("queued")} />
              <StatusFilterItem label="Completed" count={tasks.filter(t => t.status === 'completed').length} active={activeTab === "completed"} onClick={() => setActiveTab("completed")} />
              <StatusFilterItem label="Failed" count={tasks.filter(t => t.status === 'failed').length} active={activeTab === "failed"} onClick={() => setActiveTab("failed")} />
            </div>
          </div>

          {/* TASK LIST */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-3 pb-20"
          >
            {filteredTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onRun={handleRunTask}
                isExecuting={executingId === task.id}
                outputExpanded={outputExpanded === task.id}
                onToggleOutput={() => setOutputExpanded(outputExpanded === task.id ? null : task.id)}
              />
            ))}
          </motion.div>
        </>
      )}

      {/* New Task Dialog */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto glass border-border/40">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Create New Task</DialogTitle>
            <DialogDescription className="text-xs">Assign work to an agent and optionally schedule execution</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-xs"><span className="text-destructive">*</span> Task Title</Label>
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="e.g., Write unit tests for auth module" className="h-9" />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="Provide details about what needs to be done..." className="min-h-[70px]" />
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={taskPriority} onValueChange={(v) => setTaskPriority(v as any)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low — When time permits</SelectItem>
                  <SelectItem value="medium">Medium — Normal priority</SelectItem>
                  <SelectItem value="high">High — Important</SelectItem>
                  <SelectItem value="critical">Critical — Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Agent */}
            <div className="space-y-1.5">
              <Label className="text-xs"><span className="text-destructive">*</span> Assign Agent</Label>
              <Select value={taskAgent} onValueChange={setTaskAgent}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select agent" /></SelectTrigger>
                <SelectContent>
                  {agents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.emoji} {agent.name} — {agent.role}
                      {agent.departmentName && agent.departmentName !== "General" && (
                        <span className="text-muted-foreground/60 ml-1">({agent.departmentName})</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Schedule */}
            <div className="space-y-1.5">
              <Label className="text-xs">When to Execute</Label>
              <Select value={taskSchedule} onValueChange={setTaskSchedule}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="now">Run Now (execute immediately)</SelectItem>
                  <SelectItem value="queued">Queue (run manually later)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setTaskOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button className="flex-1 gap-1.5" onClick={handleCreateTask} disabled={loading || !taskTitle.trim() || !taskAgent}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                ) : taskSchedule === "now" ? (
                  <><Play className="h-4 w-4" /> Create & Run</>
                ) : (
                  <><Save className="h-4 w-4" /> Create Task</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Modern Task Output Document ─── */
function TaskOutputDocument({ task }: { task: any }) {
  // Simple markdown parser that renders to JSX
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeContent: string[] = [];
    let codeLang = '';
    let listItems: string[] = [];
    let listType: 'ul' | 'ol' | null = null;

    const flushList = () => {
      if (listItems.length > 0 && listType) {
        const Tag = listType;
        elements.push(
          <Tag key={`list-${elements.length}`} className={`ml-6 my-2 space-y-1 ${listType === 'ol' ? 'list-decimal' : 'list-disc'}`}>
            {listItems.map((item, i) => <li key={i} className="text-sm text-gray-700 dark:text-muted-foreground leading-relaxed">{renderInline(item)}</li>)}
          </Tag>
        );
        listItems = [];
        listType = null;
      }
    };

    const renderInline = (text: string): React.ReactNode => {
      // Bold
      if (/\*\*(.*?)\*\*/g.test(text)) {
        const parts: React.ReactNode[] = [];
        let remaining = text;
        let key = 0;
        while (/\*\*(.*?)\*\*/g.test(remaining)) {
          const match = remaining.match(/\*\*(.*?)\*\*/);
          if (match) {
            const idx = remaining.indexOf(match[0]);
            if (idx > 0) parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>);
            parts.push(<strong key={key++} className="font-semibold text-gray-900 dark:text-foreground">{match[1]}</strong>);
            remaining = remaining.slice(idx + match[0].length);
          } else break;
        }
        if (remaining) parts.push(<span key={key++}>{remaining}</span>);
        return <>{parts}</>;
      }
      // Inline code
      if (/`([^`]+)`/g.test(text)) {
        const parts: React.ReactNode[] = [];
        let remaining = text;
        let key = 0;
        while (/`([^`]+)`/g.test(remaining)) {
          const match = remaining.match(/`([^`]+)`/);
          if (match) {
            const idx = remaining.indexOf(match[0]);
            if (idx > 0) parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>);
            parts.push(<code key={key++} className="bg-blue-50 dark:bg-primary/10 px-1.5 py-0.5 rounded text-xs font-mono text-blue-700 dark:text-primary">{match[1]}</code>);
            remaining = remaining.slice(idx + match[0].length);
          } else break;
        }
        if (remaining) parts.push(<span key={key++}>{remaining}</span>);
        return <>{parts}</>;
      }
      return text;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code block
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          flushList();
          elements.push(
            <pre key={`code-${elements.length}`} className="bg-gray-50 dark:bg-secondary/80 border border-gray-200 dark:border-border/50 rounded-lg p-4 my-3 overflow-x-auto">
              <code className="text-xs font-mono text-gray-700 dark:text-primary leading-relaxed">{codeContent.join('\n')}</code>
            </pre>
          );
          codeContent = [];
          codeLang = '';
          inCodeBlock = false;
        } else {
          flushList();
          inCodeBlock = true;
          codeLang = line.slice(3).trim();
        }
        continue;
      }
      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }

      // Headings
      if (line.startsWith('### ')) {
        flushList();
        elements.push(<h4 key={elements.length} className="text-base font-bold text-gray-900 dark:text-foreground mt-5 mb-2">{renderInline(line.slice(4))}</h4>);
        continue;
      }
      if (line.startsWith('## ')) {
        flushList();
        elements.push(<h3 key={elements.length} className="text-lg font-bold text-gray-900 dark:text-foreground mt-6 mb-3 pb-1 border-b border-gray-200 dark:border-border/20">{renderInline(line.slice(3))}</h3>);
        continue;
      }
      if (line.startsWith('# ')) {
        flushList();
        elements.push(<h2 key={elements.length} className="text-xl font-bold text-gray-900 dark:text-foreground mt-4 mb-3">{renderInline(line.slice(2))}</h2>);
        continue;
      }

      // Horizontal rule
      if (line.startsWith('---') || line.startsWith('***')) {
        flushList();
        elements.push(<hr key={elements.length} className="my-4 border-gray-200 dark:border-border/20" />);
        continue;
      }

      // Unordered list
      if (/^\s*[-*•] /.test(line)) {
        listType = listType || 'ul';
        listItems.push(line.replace(/^\s*[-*•] /, ''));
        continue;
      }

      // Ordered list
      if (/^\s*\d+[\.\)] /.test(line)) {
        listType = listType || 'ol';
        listItems.push(line.replace(/^\s*\d+[\.\)] /, ''));
        continue;
      }

      flushList();

      // Bold line (standalone)
      if (/^\*\*.*\*\*$/.test(line.trim())) {
        elements.push(<p key={elements.length} className="text-sm font-semibold text-gray-800 dark:text-foreground/90 my-2">{renderInline(line.replace(/^\*\*(.*?)\*\*$/, '$1'))}</p>);
        continue;
      }

      // Empty line
      if (line.trim() === '') {
        elements.push(<div key={elements.length} className="h-3" />);
        continue;
      }

      // Regular paragraph
      elements.push(<p key={elements.length} className="text-sm text-gray-700 dark:text-muted-foreground leading-relaxed my-1">{renderInline(line)}</p>);
    }
    flushList();
    return elements;
  };

  return (
    <div className="border-t border-gray-200 dark:border-border/20 overflow-hidden">
      {/* Document Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50 dark:from-primary/5 to-white dark:to-card border-b border-gray-200 dark:border-border/20">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-100 dark:bg-primary/10 flex items-center justify-center">
            <FileText className="h-4 w-4 text-blue-600 dark:text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-foreground truncate">{task.title}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-gray-500 dark:text-muted-foreground">{task.agentEmoji} {task.agentName}</span>
              <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-muted-foreground/30" />
              <span className="text-[11px] text-gray-500 dark:text-muted-foreground font-mono">{task.created}</span>
              <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-muted-foreground/30" />
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${getPriorityColor(task.priority)}`}>{task.priority}</Badge>
            </div>
          </div>
          <Badge variant="secondary" className={`text-[9px] px-2 py-0.5 ${
            task.status === 'completed' ? 'bg-emerald-400/10 text-emerald-400' :
            task.status === 'failed' ? 'bg-red-400/10 text-red-400' :
            'bg-amber-400/10 text-amber-400'
          }`}>
            {task.status === 'completed' ? '✓ Complete' : task.status === 'failed' ? '✗ Failed' : '⏳ Running'}
          </Badge>
        </div>
      </div>

      {/* Document Content */}
      <div className="p-5 bg-white dark:bg-card max-h-[500px] overflow-y-auto">
        <div className="space-y-0">
          {renderMarkdown(task.output)}
        </div>
      </div>
    </div>
  );
}

function TaskRow({ task, onRun, isExecuting, outputExpanded, onToggleOutput }: {
  task: any,
  onRun: (task: any) => void,
  isExecuting: boolean,
  outputExpanded: boolean,
  onToggleOutput: () => void
}) {
  return (
    <motion.div variants={itemVariants}>
      <Card className={`bg-card/40 backdrop-blur-md border-border/40 rounded-2xl transition-all duration-300 group shadow-lg relative overflow-hidden ${task.status === 'in_progress' ? 'border-primary/30 bg-primary/5' : ''}`}>
         <div className="p-5 flex items-center gap-5 cursor-pointer hover:border-primary/20 hover:bg-card/60" onClick={task.output ? onToggleOutput : undefined}>
            <div className={`h-11 w-11 min-w-[44px] rounded-xl flex items-center justify-center border border-white/5 transition-colors shadow-inner ${getStatusBg(task.status)} group-hover:scale-105 duration-300`}>
              {isExecuting ? <Loader2 className="h-5 w-5 text-primary animate-spin" /> : getStatusIcon(task.status)}
            </div>
            <div className="flex-1 min-w-0">
               <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/30 font-mono">TSK-{task.id.split('-').pop()}</span>
                  <Badge variant="outline" className={`text-[9px] uppercase font-black tracking-widest px-2.5 h-5 ${getPriorityColor(task.priority)}`}>
                     {task.priority}
                  </Badge>
                  <span className="text-[9px] font-bold text-muted-foreground/40 italic uppercase tracking-widest">{task.departmentName}</span>
               </div>
               <h4 className="text-[15px] font-bold tracking-tight text-foreground/90 group-hover:text-primary transition-colors mt-2 mb-1 truncate leading-none">{task.title}</h4>
               <div className="flex items-center gap-3 mt-2">
                  <span className="text-[11px] text-muted-foreground/50 font-bold group-hover:text-foreground/80 transition-colors">{task.agentEmoji} {task.agentName}</span>
                  <div className="h-1 w-1 rounded-full bg-muted-foreground/20" />
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground/30 font-bold italic font-mono transition-opacity group-hover:text-primary/40">
                     <Clock className="h-3 w-3" /> {task.created}
                  </div>
               </div>
            </div>
            <div className="flex items-center gap-3">
               {task.status === "queued" && (
                 <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); onRun(task); }}>
                   <Play className="h-4 w-4" />
                 </Button>
               )}
               {task.status === "failed" && (
                 <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); onRun(task); }}>
                   <Play className="h-4 w-4" />
                 </Button>
               )}
               {task.output && (
                 <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); onToggleOutput(); }}>
                   {outputExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                 </Button>
               )}
               <ChevronRight className="h-5 w-5 text-muted-foreground/30 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0" />
            </div>
         </div>

         {/* Output Panel */}
         <AnimatePresence>
           {task.output && outputExpanded && (
             <motion.div
               initial={{ height: 0, opacity: 0 }}
               animate={{ height: "auto", opacity: 1 }}
               exit={{ height: 0, opacity: 0 }}
               transition={{ duration: 0.2 }}
               className="overflow-hidden"
             >
               <TaskOutputDocument task={task} />
             </motion.div>
           )}
         </AnimatePresence>
      </Card>
    </motion.div>
  );
}

function StatusFilterItem({ label, count, active, onClick }: { label: string, count: number, active: boolean, onClick: () => void }) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className={`h-9 rounded-xl border border-border/40 gap-2 font-bold uppercase tracking-widest text-[9px] transition-all shadow-lg min-w-fit px-4 ${active ? 'bg-primary text-primary-foreground shadow-primary/20 scale-105' : 'bg-card/40 hover:bg-card/60 text-muted-foreground'}`}
    >
      {label} <span className={`font-mono text-[10px] ${active ? 'text-primary-foreground/60' : 'text-muted-foreground/30'}`}>({count})</span>
    </Button>
  );
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
    case "in_progress": return <Clock className="h-5 w-5 text-primary animate-pulse" />;
    case "failed": return <AlertCircle className="h-5 w-5 text-red-500" />;
    case "queued": return <PauseCircle className="h-5 w-5 text-amber-500/60" />;
    default: return <Clock className="h-5 w-5 text-muted-foreground" />;
  }
}

function getStatusBg(status: string) {
  switch (status) {
    case "completed": return "bg-emerald-400/10";
    case "in_progress": return "bg-primary/10";
    case "failed": return "bg-red-400/10";
    case "queued": return "bg-amber-400/10";
    default: return "bg-white/5";
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "critical": return "bg-red-400/10 text-red-500 border-red-400/20";
    case "high": return "bg-orange-400/10 text-orange-500 border-orange-400/20";
    case "medium": return "bg-primary/10 text-primary border-primary/20";
    default: return "bg-muted text-muted-foreground border-border/10";
  }
}
