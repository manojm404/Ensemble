/**
 * ProjectCreatorDialog — "Initiative Launcher" for creating new projects.
 * Fields: Name, Description, Repo URL, Local Path, Status, Goal, Target Date.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderOpen, Rocket } from "lucide-react";

interface ProjectCreatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_OPTIONS = [
  { value: "planning", label: "Planning", color: "bg-[hsl(var(--badge-blue))]" },
  { value: "active", label: "Active", color: "bg-[hsl(var(--badge-green))]" },
  { value: "paused", label: "Paused", color: "bg-[hsl(var(--badge-orange))]" },
  { value: "completed", label: "Completed", color: "bg-[hsl(var(--badge-purple))]" },
];

const GOAL_OPTIONS = [
  { value: "mvp", label: "MVP" },
  { value: "iteration", label: "Iteration" },
  { value: "maintenance", label: "Maintenance" },
  { value: "research", label: "Research" },
];

export function ProjectCreatorDialog({ open, onOpenChange }: ProjectCreatorDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [status, setStatus] = useState("planning");
  const [goal, setGoal] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const reset = () => {
    setName(""); setDescription(""); setRepoUrl(""); setLocalPath("");
    setStatus("planning"); setGoal(""); setTargetDate("");
  };

  const handleCreate = () => {
    console.log("Project:", { name, description, repoUrl, localPath, status, goal, targetDate });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="glass border-border/40 sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/20">
          <DialogTitle className="text-base flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" /> Launch Initiative
          </DialogTitle>
          <DialogDescription className="text-xs">Create a new project workspace for your agents.</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-3 max-h-[400px] overflow-y-auto">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Project Name <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project Alpha" className="h-9 bg-background/50 text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the initiative..." className="min-h-[60px] bg-background/50 text-sm resize-none" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Repository URL</Label>
            <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/org/repo" className="h-9 bg-background/50 font-mono text-xs" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Local Filesystem Path</Label>
            <div className="flex gap-2">
              <Input value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="/home/user/projects/alpha" className="h-9 bg-background/50 font-mono text-xs flex-1" />
              <Button variant="outline" size="sm" className="h-9 px-3 shrink-0 gap-1.5 text-xs">
                <FolderOpen className="h-3.5 w-3.5" /> Browse
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 bg-background/50 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${opt.color}`} />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Goal</Label>
              <Select value={goal} onValueChange={setGoal}>
                <SelectTrigger className="h-9 bg-background/50 text-sm">
                  <SelectValue placeholder="Select goal" />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Target Date</Label>
            <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="h-9 bg-background/50 text-sm" />
          </div>
        </div>

        <div className="px-6 pb-5 pt-3 border-t border-border/20">
          <Button onClick={handleCreate} disabled={!name.trim()} className="w-full gap-1.5 text-xs">
            <Rocket className="h-3.5 w-3.5" /> Launch Initiative
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Alias for Index.tsx — wraps props to match InitiativeLauncher interface */
export function InitiativeLauncher({ open, onClose, onLaunched }: { open: boolean; onClose: () => void; onLaunched: (data: any) => void }) {
  return <ProjectCreatorDialog open={open} onOpenChange={(v) => { if (!v) onClose(); }} />;
}
