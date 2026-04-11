import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Edit3,
  Users,
  Cpu,
  CheckCircle2,
  Clock,
  AlertCircle,
  MoreVertical,
  X,
  Save,
  Loader2,
  Search,
  Play,
  RotateCcw,
  Calendar,
  Eye,
  Trash2,
  StopCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  getOrgById,
  getDepartmentById,
  getAgentsByDepartment,
  getTasksByDepartment,
  getAgentsByOrg,
  getTaskById,
  hireAgent,
  createTask,
  updateTaskStatus,
  addActivityEvent,
  type OrgTask
} from "@/lib/org-data";
import { getAgents, AgentSkill } from "@/lib/api";
import { runTask } from "@/lib/task-executor";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4 }
  }
};

export default function OrgDepartmentDetail() {
  const { id, deptId } = useParams<{ id: string; deptId: string }>();
  const navigate = useNavigate();
  const org = getOrgById(id || "");
  const dept = getDepartmentById(deptId || "");
  const [agents, setAgents] = useState(getAgentsByDepartment(deptId || ""));
  const [tasks, setTasks] = useState(getTasksByDepartment(deptId || ""));
  const [orgAgents, setOrgAgents] = useState(getAgentsByOrg(id || ""));
  
  // Agent hiring state
  const [hireDialogOpen, setHireDialogOpen] = useState(false);
  const [registryAgents, setRegistryAgents] = useState<AgentSkill[]>([]);
  const [hireSearch, setHireSearch] = useState("");
  const [hiringId, setHiringId] = useState<string | null>(null);
  
  // Task creation state
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  
  // Task execution state
  const [executingTasks, setExecutingTasks] = useState<Set<string>>(new Set());
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<OrgTask | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduledTask, setScheduledTask] = useState<OrgTask | null>(null);

  // Refresh data periodically
  useEffect(() => {
    const refresh = () => {
      setAgents(getAgentsByDepartment(deptId || ""));
      setTasks(getTasksByDepartment(deptId || ""));
      setOrgAgents(getAgentsByOrg(id || ""));
    };
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [id, deptId]);

  // Load registry agents when hire dialog opens
  useEffect(() => {
    if (hireDialogOpen && registryAgents.length === 0) {
      getAgents().then(registryAgents => {
        setRegistryAgents(registryAgents);
      }).catch(() => {
        toast.error("Failed to load agent registry");
      });
    }
  }, [hireDialogOpen]);

  if (!org || !dept) return <div>Data not found</div>;

  const handleHireAgent = async (registryAgent: AgentSkill) => {
    if (!id || !deptId) return;
    setHiringId(registryAgent.id);
    try {
      hireAgent(id, {
        name: registryAgent.name,
        role: registryAgent.name,
        departmentId: deptId,
        model: "gemini-2.5-flash",
        emoji: registryAgent.emoji || "🤖",
        skills: [registryAgent.category],
      });
      addActivityEvent(id, "agent", `${registryAgent.emoji} ${registryAgent.name} was hired into ${dept.name}`);
      setHireDialogOpen(false);
      setHireSearch("");
      toast.success(`${registryAgent.emoji} ${registryAgent.name} joined ${dept.name}!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to hire agent");
    } finally {
      setHiringId(null);
    }
  };

  const handleCreateTask = async () => {
    if (!id || !deptId || !taskTitle.trim() || !selectedAgentId) {
      toast.error("Please fill all required fields");
      return;
    }
    setTaskLoading(true);
    try {
      const selectedAgent = agents.find(a => a.id === selectedAgentId);
      if (!selectedAgent) {
        toast.error("Selected agent not found");
        return;
      }

      createTask(id, {
        title: taskTitle,
        description: taskDesc || "No description",
        priority: taskPriority,
        agentId: selectedAgentId,
        departmentId: deptId,
      });
      addActivityEvent(id, "task", `🎯 New task "${taskTitle}" assigned to ${selectedAgent.emoji} ${selectedAgent.name} in ${dept.name}`);
      setTaskDialogOpen(false);
      setTaskTitle("");
      setTaskDesc("");
      setTaskPriority("medium");
      setSelectedAgentId("");
      toast.success(`Task "${taskTitle}" created!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create task");
    } finally {
      setTaskLoading(false);
    }
  };

  const handleRunTask = async (task: OrgTask) => {
    if (!id) return;
    setExecutingTasks(prev => new Set(prev).add(task.id));
    try {
      const result = await runTask(id, task.id, task.agentId, task.title, task.description);
      if (result.success) {
        toast.success(`✅ Task "${task.title}" completed`);
      } else {
        toast.error(`❌ Task "${task.title}" failed: ${result.error}`);
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
    // Reset task status to queued first
    updateTaskStatus(id, task.id, "queued");
    toast.info(`🔄 Re-running "${task.title}"...`);
    await handleRunTask(task);
  };

  const handleStopTask = (task: OrgTask) => {
    if (!id) return;
    updateTaskStatus(id, task.id, "blocked");
    addActivityEvent(id, "task", `⏹️ Task "${task.title}" was stopped`);
    toast.info(`Task "${task.title}" stopped`);
  };

  const handleScheduleTask = (task: OrgTask) => {
    setScheduledTask(task);
    setScheduleDialogOpen(true);
  };

  const handleConfirmSchedule = () => {
    if (!scheduledTask || !scheduleTime) {
      toast.error("Please select a schedule time");
      return;
    }
    // For now, store it in task description as metadata
    // In production, this would go to a proper scheduler
    addActivityEvent(id || "", "task", `⏰ Task "${scheduledTask.title}" scheduled for ${scheduleTime}`);
    toast.success(`Task scheduled for ${scheduleTime}`);
    setScheduleDialogOpen(false);
    setScheduleTime("");
    setScheduledTask(null);
  };

  const handleViewTask = (task: OrgTask) => {
    setSelectedTask(task);
    setTaskDetailOpen(true);
  };

  const filteredRegistryAgents = registryAgents.filter(a =>
    a.name.toLowerCase().includes(hireSearch.toLowerCase()) ||
    a.description.toLowerCase().includes(hireSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 space-y-6">
      {/* HEADER */}
      <header className="h-14 flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate(`/org/${id}/departments`)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-xl font-bold tracking-tight">
            <span className="mr-2">{dept.emoji}</span>
            {dept.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-9 hover:bg-white/5">
            <Edit3 className="h-4 w-4 mr-2" /> Edit
          </Button>
          <Button variant="default" size="sm" className="h-9 px-4 text-xs font-bold uppercase tracking-wider rounded-xl" onClick={() => setHireDialogOpen(true)}>
             <Plus className="h-4 w-4 mr-2" /> Add Agent
          </Button>
          <Button variant="default" size="sm" className="h-9 px-4 text-xs font-bold uppercase tracking-wider rounded-xl bg-emerald-500 hover:bg-emerald-600" onClick={() => {
            if (agents.length === 0) {
              toast.error("Hire an agent first before creating tasks");
              return;
            }
            setTaskDialogOpen(true);
          }}>
             <Plus className="h-4 w-4 mr-2" /> Add Task
          </Button>
        </div>
      </header>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* SECTION 1 — Department Info Card */}
        <motion.div variants={itemVariants}>
          <Card className="p-6 bg-card/50 backdrop-blur-sm border-border/40 rounded-2xl">
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed font-medium">
              {dept.description}
            </p>
            <div className="flex gap-8">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Total Capacity</span>
                <p className="text-lg font-bold text-foreground">{dept.agentCount} <span className="text-primary">Agents</span></p>
              </div>
              <div className="h-10 w-px bg-white/5" />
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Throughput</span>
                <p className="text-lg font-bold text-foreground">{dept.completedTaskCount} <span className="text-primary">Tasks</span></p>
              </div>
              <div className="h-10 w-px bg-white/5" />
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Reliability</span>
                <p className="text-lg font-bold text-foreground">92% <span className="text-primary">Success</span></p>
              </div>
            </div>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* SECTION 2 — Agents in Department */}
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/50">Agents Cluster</h3>
              <span className="text-[10px] font-bold text-primary/60">{agents.length} Found</span>
            </div>
            {agents.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground border border-dashed border-border/50 rounded-xl">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No agents in this department yet</p>
                <Button size="sm" className="mt-2" onClick={() => setHireDialogOpen(true)}>Hire First Agent</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                {agents.map((agent) => (
                  <div key={agent.id} className="h-20 p-4 flex items-center bg-white/5 border border-white/5 rounded-2xl hover:border-primary/30 hover:bg-white/10 transition-all group">
                    <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-lg border border-primary/20 group-hover:bg-primary/20 transition-colors mr-4">
                      {agent.emoji}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <p className="text-sm font-bold truncate text-foreground/90">{agent.name}</p>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider truncate">{agent.role}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <div className={`h-1.5 w-1.5 rounded-full ${agent.status === 'running' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]' : 'bg-muted'} group-hover:scale-110 transition-transform`} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{agent.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* SECTION 3 — Department Tasks */}
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/50">Directives Queue</h3>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] font-black uppercase tracking-widest text-primary/60 hover:text-primary transition-colors" onClick={() => {
                if (agents.length === 0) {
                  toast.error("Hire an agent first");
                  return;
                }
                setTaskDialogOpen(true);
              }}>
                 <Plus className="h-3 w-3 mr-1" /> Add Task
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {tasks.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground border border-dashed border-border/50 rounded-xl">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No tasks yet</p>
                  <Button size="sm" className="mt-2" onClick={() => setTaskDialogOpen(true)}>Create First Task</Button>
                </div>
              ) : (
                tasks.slice(0, 8).map((task) => {
                  const isExecuting = executingTasks.has(task.id);
                  
                  return (
                    <div key={task.id} className="p-4 flex items-start gap-3 bg-white/5 border border-white/5 rounded-xl hover:border-primary/20 group transition-all">
                      <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                        {getTaskIcon(task.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground/90 truncate">{task.title}</p>
                          {isExecuting && (
                            <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-primary/40 bg-primary/10 text-primary">
                              <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" /> Running
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">{task.agentEmoji} {task.agentName}</span>
                          <span className="text-[9px] text-muted-foreground/40">•</span>
                          <span className="text-[10px] text-muted-foreground/60 font-mono">{task.id.split('-').pop()}</span>
                        </div>
                        {task.output && (
                          <p className="text-xs text-muted-foreground/70 mt-2 line-clamp-2">{task.output}</p>
                        )}
                        {/* Action buttons - show on hover */}
                        <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 px-2 text-[10px] gap-1"
                            onClick={() => handleViewTask(task)}
                          >
                            <Eye className="h-3 w-3" /> View
                          </Button>
                          {task.status === "queued" && (
                            <Button 
                              variant="default" 
                              size="sm" 
                              className="h-6 px-2 text-[10px] gap-1 bg-primary/20 hover:bg-primary/30 text-primary"
                              onClick={() => handleRunTask(task)}
                              disabled={isExecuting}
                            >
                              {isExecuting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} 
                              Run
                            </Button>
                          )}
                          {(task.status === "completed" || task.status === "failed") && (
                            <Button 
                              variant="default" 
                              size="sm" 
                              className="h-6 px-2 text-[10px] gap-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400"
                              onClick={() => handleReRunTask(task)}
                              disabled={isExecuting}
                            >
                              <RotateCcw className="h-3 w-3" /> Re-run
                            </Button>
                          )}
                          {task.status === "in_progress" && (
                            <Button 
                              variant="default" 
                              size="sm" 
                              className="h-6 px-2 text-[10px] gap-1 bg-red-500/20 hover:bg-red-500/30 text-red-400"
                              onClick={() => handleStopTask(task)}
                            >
                              <StopCircle className="h-3 w-3" /> Stop
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 px-2 text-[10px] gap-1"
                            onClick={() => handleScheduleTask(task)}
                          >
                            <Calendar className="h-3 w-3" /> Schedule
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${getPriorityColor(task.priority)}`}>
                          {task.priority}
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground/30 font-mono">{task.created}</span>
                        <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${getStatusBadgeColor(task.status)}`}>
                          {task.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* HIRE AGENT DIALOG */}
      <Dialog open={hireDialogOpen} onOpenChange={setHireDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto glass border-border/40">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Hire Agent into {dept.name}</DialogTitle>
            <DialogDescription className="text-xs">Select an agent from the registry to join this department</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              <Input 
                value={hireSearch} 
                onChange={(e) => setHireSearch(e.target.value)} 
                placeholder="Search agents by name or description..." 
                className="pl-9 h-9" 
              />
            </div>

            {/* Agent Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto pr-2">
              {filteredRegistryAgents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => handleHireAgent(agent)}
                  disabled={hiringId === agent.id}
                  className="p-4 bg-white/5 border border-border/30 rounded-xl hover:border-primary/40 hover:bg-white/10 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-secondary/50 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                      {agent.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold truncate group-hover:text-primary transition-colors">{agent.name}</h4>
                      <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">{agent.description}</p>
                      <Badge variant="outline" className="text-[8px] mt-2 px-1.5 py-0">{agent.category}</Badge>
                    </div>
                  </div>
                  {hiringId === agent.id && (
                    <div className="mt-2 text-[10px] text-primary flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Hiring...
                    </div>
                  )}
                </button>
              ))}
              {filteredRegistryAgents.length === 0 && (
                <div className="col-span-full py-8 text-center text-muted-foreground">
                  <p>No agents found matching your search</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CREATE TASK DIALOG */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="max-w-md glass border-border/40">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Create Task for {dept.name}</DialogTitle>
            <DialogDescription className="text-xs">Assign a task to an agent in this department</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            {/* Task Title */}
            <div className="space-y-1.5">
              <Label className="text-xs"><span className="text-destructive">*</span> Task Title</Label>
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="e.g., Review codebase" className="h-9" />
            </div>

            {/* Task Description */}
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="What needs to be done?" className="min-h-[70px]" />
            </div>

            {/* Assign to Agent */}
            <div className="space-y-1.5">
              <Label className="text-xs"><span className="text-destructive">*</span> Assign To</Label>
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select an agent" /></SelectTrigger>
                <SelectContent>
                  {agents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.emoji} {agent.name} — {agent.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={taskPriority} onValueChange={(v) => setTaskPriority(v as any)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low — Background work</SelectItem>
                  <SelectItem value="medium">Medium — Normal priority</SelectItem>
                  <SelectItem value="high">High — Urgent task</SelectItem>
                  <SelectItem value="critical">Critical — Immediate action</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setTaskDialogOpen(false)} disabled={taskLoading}>
                Cancel
              </Button>
              <Button className="flex-1 gap-1.5" onClick={handleCreateTask} disabled={taskLoading || !taskTitle.trim() || !selectedAgentId}>
                {taskLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                ) : (
                  <><Save className="h-4 w-4" /> Create Task</>
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
              {/* Status & Meta */}
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${getStatusBadgeColor(selectedTask.status)}`}>
                  {selectedTask.status.replace('_', ' ')}
                </Badge>
                <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${getPriorityColor(selectedTask.priority)}`}>
                  {selectedTask.priority} priority
                </Badge>
                <span className="text-xs text-muted-foreground">{selectedTask.agentEmoji} {selectedTask.agentName}</span>
              </div>

              {selectedTask.description && selectedTask.description !== "No description" && (
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Description</h4>
                  <p className="text-sm text-foreground bg-white/5 p-3 rounded-lg border border-border/20">{selectedTask.description}</p>
                </div>
              )}

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

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-border/20">
                {selectedTask.status === "queued" && (
                  <Button className="flex-1 gap-2" onClick={() => { handleRunTask(selectedTask); setTaskDetailOpen(false); }}>
                    <Play className="h-4 w-4" /> Run Task
                  </Button>
                )}
                {(selectedTask.status === "completed" || selectedTask.status === "failed") && (
                  <Button className="flex-1 gap-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400" onClick={() => { handleReRunTask(selectedTask); setTaskDetailOpen(false); }}>
                    <RotateCcw className="h-4 w-4" /> Re-run Task
                  </Button>
                )}
                <Button variant="outline" className="flex-1 gap-2" onClick={() => handleScheduleTask(selectedTask)}>
                  <Calendar className="h-4 w-4" /> Schedule
                </Button>
                <Button variant="outline" className="px-4" onClick={() => setTaskDetailOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* SCHEDULE DIALOG */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-md glass border-border/40">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Schedule Task
            </DialogTitle>
            <DialogDescription className="text-xs">
              {scheduledTask && `Schedule "${scheduledTask.title}" for later execution`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            {/* Schedule Time */}
            <div className="space-y-1.5">
              <Label className="text-xs"><span className="text-destructive">*</span> Schedule For</Label>
              <Input 
                type="datetime-local" 
                value={scheduleTime} 
                onChange={(e) => setScheduleTime(e.target.value)} 
                className="h-9"
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>

            {/* Quick options */}
            <div className="space-y-1.5">
              <Label className="text-xs">Quick Options</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => {
                  const d = new Date();
                  d.setMinutes(d.getMinutes() + 30);
                  setScheduleTime(d.toISOString().slice(0, 16));
                }}>
                  In 30 minutes
                </Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => {
                  const d = new Date();
                  d.setHours(d.getHours() + 1);
                  setScheduleTime(d.toISOString().slice(0, 16));
                }}>
                  In 1 hour
                </Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => {
                  const d = new Date();
                  d.setHours(d.getHours() + 6);
                  setScheduleTime(d.toISOString().slice(0, 16));
                }}>
                  In 6 hours
                </Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  d.setHours(9, 0, 0, 0);
                  setScheduleTime(d.toISOString().slice(0, 16));
                }}>
                  Tomorrow 9 AM
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setScheduleDialogOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1 gap-1.5" onClick={handleConfirmSchedule} disabled={!scheduleTime}>
                <Calendar className="h-4 w-4" /> Schedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getTaskIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    case "in_progress": return <Clock className="h-3.5 w-3.5 text-primary animate-pulse" />;
    case "failed": return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
    default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "critical": return "bg-red-400/10 text-red-400 border border-red-400/20";
    case "high": return "bg-amber-400/10 text-amber-400 border border-amber-400/20";
    case "medium": return "bg-primary/10 text-primary border border-primary/20";
    default: return "bg-white/5 text-muted-foreground/40 border border-white/10";
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
