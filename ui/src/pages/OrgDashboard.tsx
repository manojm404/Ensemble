import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Users,
  Cpu,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Activity,
  BarChart3,
  Settings,
  ChevronRight,
  Zap,
  Play,
  RotateCcw,
  Loader2,
  Send,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getOrgById,
  getDepartmentsByOrg,
  getActivityByOrg,
  getTasksByOrg,
  getAgentsByOrg,
  createTask,
  updateTaskStatus,
  addActivityEvent,
  type OrgTask,
  type Agent,
  type Department
} from "@/lib/org-data";
import { runTask } from "@/lib/task-executor";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35 }
  }
};

export default function OrgDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [org, setOrg] = useState(getOrgById(id || ""));
  const [departments, setDepartments] = useState<Department[]>(getDepartmentsByOrg(id || ""));
  const [activities, setActivities] = useState(getActivityByOrg(id || ""));
  const [tasks, setTasks] = useState<OrgTask[]>(getTasksByOrg(id || ""));
  const [agents, setAgents] = useState<Agent[]>(getAgentsByOrg(id || ""));

  // Quick task creation state
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [quickTaskDept, setQuickTaskDept] = useState("");
  const [quickTaskAgent, setQuickTaskAgent] = useState("");
  const [quickTaskPriority, setQuickTaskPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [creatingTask, setCreatingTask] = useState(false);
  const [runAfterCreate, setRunAfterCreate] = useState(true);

  // Task execution state
  const [executingTasks, setExecutingTasks] = useState<Set<string>>(new Set());
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<OrgTask | null>(null);

  // Refresh data periodically
  useEffect(() => {
    const refresh = () => {
      setOrg(getOrgById(id || ""));
      setDepartments(getDepartmentsByOrg(id || ""));
      setActivities(getActivityByOrg(id || ""));
      setTasks(getTasksByOrg(id || ""));
      setAgents(getAgentsByOrg(id || ""));
    };
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [id]);

  if (!org) return <div className="flex items-center justify-center h-full text-muted-foreground">Organization not found</div>;

  const hasDepartments = departments.length > 0;
  const hasAgents = agents.length > 0;
  const activeTasks = tasks.filter(t => t.status === 'in_progress');
  const queuedTasks = tasks.filter(t => t.status === 'queued');

  // Get available agents for a department
  const getDeptAgents = (deptId: string) => agents.filter(a => a.departmentId === deptId);

  // Quick task creation
  const handleQuickCreateTask = async () => {
    if (!id || !quickTaskTitle.trim() || !quickTaskAgent) {
      toast.error("Please fill task title and select an agent");
      return;
    }
    setCreatingTask(true);
    try {
      const selectedAgent = agents.find(a => a.id === quickTaskAgent);
      const selectedDept = departments.find(d => d.id === selectedAgent?.departmentId);

      const newTask = createTask(id, {
        title: quickTaskTitle,
        description: "Quick task from dashboard",
        status: "queued",
        priority: quickTaskPriority,
        agentId: quickTaskAgent,
        departmentId: selectedDept?.id || "",
      });
      addActivityEvent(id, "task", `🎯 Quick task "${quickTaskTitle}" created → ${selectedAgent?.emoji} ${selectedAgent?.name}`);

      // Auto-run if toggle is on
      if (runAfterCreate) {
        setTimeout(() => handleRunTask(newTask), 500);
      }

      setQuickTaskTitle("");
      setQuickTaskDept("");
      setQuickTaskAgent("");
      setQuickTaskPriority("medium");
      setQuickTaskOpen(false);
      toast.success(runAfterCreate ? `Task "${quickTaskTitle}" created & running!` : `Task "${quickTaskTitle}" created!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create task");
    } finally {
      setCreatingTask(false);
    }
  };

  // Task execution
  const handleRunTask = async (task: OrgTask) => {
    if (!id) return;
    setExecutingTasks(prev => new Set(prev).add(task.id));
    try {
      const result = await runTask(id, task.id, task.agentId, task.title, task.description);
      if (result.success) {
        toast.success(`✅ "${task.title}" completed`);
      } else {
        toast.error(`❌ "${task.title}" failed`);
      }
    } catch (err: any) {
      toast.error(err.message || "Task execution failed");
    } finally {
      setExecutingTasks(prev => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const handleReRunTask = async (task: OrgTask) => {
    if (!id) return;
    updateTaskStatus(id, task.id, "queued");
    await handleRunTask(task);
  };

  const handleViewTask = (task: OrgTask) => {
    setSelectedTask(task);
    setTaskDetailOpen(true);
  };

  const filteredAgents = quickTaskDept ? getDeptAgents(quickTaskDept) : agents;

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* HEADER */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-5">
             <div className="h-14 w-14 bg-card/60 rounded-2xl flex items-center justify-center border border-white/5 shadow-2xl">
               <Building2 className="h-7 w-7 text-primary/80" />
             </div>
             <div>
               <h1 className="text-2xl font-bold tracking-tight text-foreground">{org.name}</h1>
               <p className="text-sm text-muted-foreground mt-0.5">{org.description}</p>
             </div>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="default" 
              size="lg" 
              className="gap-2 h-10 px-5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20"
              onClick={() => setQuickTaskOpen(true)}
              disabled={!hasAgents}
            >
              <Plus className="h-4 w-4" /> Quick Task
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-white/5">
               <Settings className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* STATS */}
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard count={departments.length} label="Departments" icon={<Layers className="h-4 w-4 text-blue-400" />} onClick={() => navigate(`/org/${id}/departments`)} />
          <StatCard count={agents.length} label="Total Agents" icon={<Cpu className="h-4 w-4 text-emerald-400" />} onClick={() => navigate(`/org/${id}/agents`)} />
          <StatCard count={agents.filter(a => a.status === 'running').length} label="Active" icon={<CheckCircle2 className="h-4 w-4 text-green-400" />} />
          <StatCard count={activeTasks.length} label="In Progress" icon={<Clock className="h-4 w-4 text-amber-400" />} onClick={() => navigate(`/org/${id}/tasks`)} />
          <StatCard count={tasks.filter(t => t.status === 'completed').length} label="Completed" icon={<CheckCircle2 className="h-4 w-4 text-primary" />} />
          <StatCard count={tasks.filter(t => t.status === 'failed').length} label="Failed" icon={<AlertCircle className="h-4 w-4 text-rose-400" />} />
        </motion.div>

        {/* MAIN CONTENT: 3-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT: Departments & Agents */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/50">Departments</h3>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary/60 hover:text-primary" onClick={() => navigate(`/org/${id}/departments`)}>
                Manage <ChevronRight className="h-3 w-3 inline ml-0.5" />
              </Button>
            </div>

            <div className="space-y-3">
              {departments.length === 0 && (
                <Card className="p-6 bg-card/20 backdrop-blur-sm border-dashed border-border/50 rounded-2xl text-center">
                  <Layers className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No departments yet</p>
                  <Button size="sm" className="mt-2" onClick={() => navigate(`/org/${id}/departments`)}>Create Department</Button>
                </Card>
              )}
              {departments.map(dept => {
                const deptAgents = getDeptAgents(dept.id);
                const deptTasks = tasks.filter(t => t.departmentId === dept.id);
                const runningAgents = deptAgents.filter(a => a.status === 'running').length;

                return (
                  <Card key={dept.id} className="p-4 bg-card/40 backdrop-blur-sm border-border/40 rounded-2xl hover:border-primary/20 transition-all group cursor-pointer" onClick={() => navigate(`/org/${id}/departments/${dept.id}`)}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center text-lg border border-white/5">
                        {dept.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">{dept.name}</h4>
                        <p className="text-[10px] text-muted-foreground/60">{deptAgents.length} agents • {deptTasks.length} tasks</p>
                      </div>
                    </div>
                    {/* Live agent dots */}
                    {deptAgents.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {deptAgents.slice(0, 6).map(agent => (
                          <div key={agent.id} className="group/agent relative">
                            <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] border ${
                              agent.status === 'running' ? 'bg-emerald-400/20 border-emerald-400/30' : 
                              agent.status === 'idle' ? 'bg-amber-400/20 border-amber-400/30' : 
                              'bg-muted/20 border-muted/30'
                            }`}>
                              {agent.emoji}
                            </div>
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-foreground text-background text-[9px] rounded whitespace-nowrap opacity-0 group-hover/agent:opacity-100 pointer-events-none z-50">
                              {agent.name} ({agent.status})
                            </div>
                          </div>
                        ))}
                        {deptAgents.length > 6 && (
                          <span className="text-[9px] text-muted-foreground">+{deptAgents.length - 6}</span>
                        )}
                        <span className="text-[9px] text-muted-foreground/40 ml-auto">{runningAgents} running</span>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>

          {/* CENTER: Active & Queued Tasks */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/50">Tasks</h3>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary/60 hover:text-primary" onClick={() => navigate(`/org/${id}/tasks`)}>
                View All <ChevronRight className="h-3 w-3 inline ml-0.5" />
              </Button>
            </div>

            <div className="space-y-2">
              {/* Running tasks */}
              {activeTasks.slice(0, 3).map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  isExecuting={executingTasks.has(task.id)}
                  onView={() => handleViewTask(task)}
                  onStop={() => {
                    if (!id) return;
                    updateTaskStatus(id, task.id, "blocked");
                    toast.info(`"${task.title}" stopped`);
                  }}
                />
              ))}

              {/* Queued tasks with Run button */}
              {queuedTasks.slice(0, 3).map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task}
                  isExecuting={executingTasks.has(task.id)}
                  onView={() => handleViewTask(task)}
                  onRun={() => handleRunTask(task)}
                />
              ))}

              {/* Recent completed/failed */}
              {tasks.filter(t => t.status === 'completed' || t.status === 'failed').slice(0, 2).map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task}
                  isExecuting={executingTasks.has(task.id)}
                  onView={() => handleViewTask(task)}
                  onReRun={() => handleReRunTask(task)}
                />
              ))}

              {tasks.length === 0 && (
                <Card className="p-8 bg-card/20 backdrop-blur-sm border-dashed border-border/50 rounded-2xl text-center">
                  <Zap className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No tasks yet</p>
                  <Button size="sm" className="mt-2" onClick={() => setQuickTaskOpen(true)}>Create Task</Button>
                </Card>
              )}
            </div>
          </div>

          {/* RIGHT: Activity Feed */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/50">Activity</h3>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary/60 hover:text-primary" onClick={() => navigate(`/org/${id}/activity`)}>
                Full Feed <ChevronRight className="h-3 w-3 inline ml-0.5" />
              </Button>
            </div>

            <Card className="p-2 bg-card/30 backdrop-blur-sm border-border/40 rounded-2xl max-h-[600px] overflow-y-auto">
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No activity yet</p>
              ) : (
                <div className="space-y-1">
                  {activities.slice(0, 10).map(activity => (
                    <div key={activity.id} className="p-3 flex items-start gap-3 hover:bg-white/5 rounded-xl transition-colors group cursor-pointer">
                      <div className="h-7 w-7 min-w-[28px] rounded-lg bg-white/5 flex items-center justify-center text-sm border border-white/5">
                        {getEmojiIcon(activity.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground/90 truncate">{activity.action}</p>
                        <p className="text-[9px] text-muted-foreground/40 mt-0.5">{activity.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* QUICK TASK DIALOG */}
      <Dialog open={quickTaskOpen} onOpenChange={setQuickTaskOpen}>
        <DialogContent className="max-w-md glass border-border/40">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" /> Quick Task
            </DialogTitle>
            <DialogDescription className="text-xs">Create and optionally run a task instantly</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            {/* Task Title */}
            <div className="space-y-1.5">
              <Label className="text-xs"><span className="text-destructive">*</span> What needs to be done?</Label>
              <Input 
                value={quickTaskTitle} 
                onChange={(e) => setQuickTaskTitle(e.target.value)} 
                placeholder="e.g., Review the latest PR" 
                className="h-10"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleQuickCreateTask()}
              />
            </div>

            {/* Department (optional filter) */}
            {departments.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Department (optional)</Label>
                <Select value={quickTaskDept} onValueChange={setQuickTaskDept}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="All departments" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All departments</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.emoji} {dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Agent Selection */}
            <div className="space-y-1.5">
              <Label className="text-xs"><span className="text-destructive">*</span> Assign To</Label>
              <Select value={quickTaskAgent} onValueChange={setQuickTaskAgent}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select an agent" /></SelectTrigger>
                <SelectContent>
                  {filteredAgents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.emoji} {agent.name} — {agent.departmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <div className="flex gap-2">
                {(["low", "medium", "high", "critical"] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setQuickTaskPriority(p)}
                    className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${
                      quickTaskPriority === p 
                        ? p === 'critical' ? 'bg-red-400/20 text-red-400 border border-red-400/30'
                          : p === 'high' ? 'bg-amber-400/20 text-amber-400 border border-amber-400/30'
                          : p === 'medium' ? 'bg-primary/20 text-primary border border-primary/30'
                          : 'bg-muted/20 text-muted-foreground border border-border/30'
                        : 'bg-white/5 text-muted-foreground/40 border border-border/20 hover:bg-white/10'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Run after create toggle */}
            <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
              <input
                type="checkbox"
                id="runAfterCreate"
                checked={runAfterCreate}
                onChange={(e) => setRunAfterCreate(e.target.checked)}
                className="h-4 w-4 rounded border-border/30 text-primary focus:ring-primary"
              />
              <Label htmlFor="runAfterCreate" className="text-xs cursor-pointer">Run task immediately after creation</Label>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setQuickTaskOpen(false)} disabled={creatingTask}>
                Cancel
              </Button>
              <Button className="flex-1 gap-2" onClick={handleQuickCreateTask} disabled={creatingTask || !quickTaskTitle.trim() || !quickTaskAgent}>
                {creatingTask ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                ) : runAfterCreate ? (
                  <><Send className="h-4 w-4" /> Create & Run</>
                ) : (
                  <><Plus className="h-4 w-4" /> Create Task</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* TASK DETAIL DIALOG */}
      <Dialog open={taskDetailOpen} onOpenChange={setTaskDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto glass border-border/40">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              {getTaskIcon(selectedTask?.status || "queued")}
              {selectedTask?.title}
            </DialogTitle>
            <DialogDescription className="text-xs">Task execution details</DialogDescription>
          </DialogHeader>

          {selectedTask && (
            <div className="space-y-4 pt-4">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${getStatusBadgeColor(selectedTask.status)}`}>
                  {selectedTask.status.replace('_', ' ')}
                </Badge>
                <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${getPriorityColor(selectedTask.priority)}`}>
                  {selectedTask.priority}
                </Badge>
                <span className="text-xs text-muted-foreground">{selectedTask.agentEmoji} {selectedTask.agentName}</span>
              </div>

              {selectedTask.output ? (
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Output</h4>
                  <div className="text-sm text-foreground bg-white/5 p-4 rounded-lg border border-border/20 whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {selectedTask.output}
                  </div>
                </div>
              ) : selectedTask.status === "in_progress" ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-primary" />
                  <p className="text-sm">Task is running...</p>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No output yet</p>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-border/20">
                {selectedTask.status === "queued" && (
                  <Button className="flex-1 gap-2" onClick={() => { handleRunTask(selectedTask); setTaskDetailOpen(false); }}>
                    <Play className="h-4 w-4" /> Run
                  </Button>
                )}
                {(selectedTask.status === "completed" || selectedTask.status === "failed") && (
                  <Button className="flex-1 gap-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400" onClick={() => { handleReRunTask(selectedTask); setTaskDetailOpen(false); }}>
                    <RotateCcw className="h-4 w-4" /> Re-run
                  </Button>
                )}
                <Button variant="outline" className="px-4" onClick={() => setTaskDetailOpen(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({ count, label, icon, onClick }: { count: number, label: string, icon: any, onClick?: () => void }) {
  return (
    <Card 
      className={`p-4 bg-card/40 backdrop-blur-sm border-border/40 rounded-2xl hover:border-primary/20 hover:bg-card/60 transition-all group ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
       <div className="h-8 w-8 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 mb-2 group-hover:bg-primary/5 transition-colors">
         {icon}
       </div>
       <p className="text-xl font-black text-foreground tracking-tighter">{count}</p>
       <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground mt-0.5 opacity-50">{label}</p>
    </Card>
  );
}

/* ─── Task Card ─── */
function TaskCard({ task, isExecuting, onView, onRun, onReRun, onStop }: {
  task: OrgTask;
  isExecuting: boolean;
  onView: () => void;
  onRun?: () => void;
  onReRun?: () => void;
  onStop?: () => void;
}) {
  return (
    <Card className="p-3 bg-card/40 backdrop-blur-sm border-border/40 rounded-xl hover:border-primary/20 transition-all group">
      <div className="flex items-start gap-3">
        <div className="h-7 w-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
          {getTaskIcon(task.status)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-foreground truncate">{task.title}</p>
            {isExecuting && <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />}
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{task.agentEmoji} {task.agentName}</p>
          
          {/* Actions */}
          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[9px]" onClick={onView}>
              <Eye className="h-2.5 w-2.5 mr-0.5" /> View
            </Button>
            {task.status === "queued" && onRun && (
              <Button variant="default" size="sm" className="h-5 px-1.5 text-[9px] bg-primary/20 hover:bg-primary/30 text-primary" onClick={onRun} disabled={isExecuting}>
                {isExecuting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5 mr-0.5" />} Run
              </Button>
            )}
            {(task.status === "completed" || task.status === "failed") && onReRun && (
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[9px] text-amber-400 hover:text-amber-400" onClick={onReRun}>
                <RotateCcw className="h-2.5 w-2.5 mr-0.5" /> Re-run
              </Button>
            )}
            {task.status === "in_progress" && onStop && (
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[9px] text-red-400 hover:text-red-400" onClick={onStop}>
                Stop
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${getStatusBadgeColor(task.status)}`}>
            {task.status.replace('_', ' ')}
          </Badge>
          <span className="text-[9px] text-muted-foreground/40">{task.created}</span>
        </div>
      </div>
    </Card>
  );
}

/* ─── Helpers ─── */
function getTaskIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    case "in_progress": return <Clock className="h-3.5 w-3.5 text-primary animate-pulse" />;
    case "failed": return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
    default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function getStatusBadgeColor(status: string) {
  switch (status) {
    case "completed": return "bg-emerald-400/10 text-emerald-400 border-emerald-400/20";
    case "in_progress": return "bg-blue-400/10 text-blue-400 border-blue-400/20";
    case "failed": return "bg-red-400/10 text-red-400 border-red-400/20";
    case "queued": return "bg-amber-400/10 text-amber-400 border-amber-400/20";
    case "blocked": return "bg-muted/10 text-muted-foreground border-muted/20";
    default: return "bg-white/5 text-muted-foreground/40 border-white/10";
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "critical": return "bg-red-400/10 text-red-400 border border-red-400/20";
    case "high": return "bg-amber-400/10 text-amber-400 border border-amber-400/20";
    case "medium": return "bg-primary/10 text-primary border border-primary/20";
    default: return "bg-white/5 text-muted-foreground/40 border-white/10";
  }
}

function getEmojiIcon(type: string) {
    if (type === 'agent') return '🤖';
    if (type === 'task') return '🎯';
    if (type === 'alert') return '🔔';
    if (type === 'member') return '👤';
    if (type === 'system') return '⚡';
    if (type === 'deploy') return '🚀';
    return '📋';
}
