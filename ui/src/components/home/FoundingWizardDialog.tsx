/**
 * FoundingWizardDialog — "The Founding" multi-step company/org creator.
 * Step 1: Details (Name, Mission/Goal)
 * Step 2: Agent Nucleus (Agent ID, Model, Adapter)
 * Step 3: First Directive (Task Title, Description)
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
import { Building2, Bot, Zap, ChevronRight, ChevronLeft, Check } from "lucide-react";

interface FoundingWizardDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const STEPS = [
    { label: "Details", icon: Building2 },
    { label: "Agent Nucleus", icon: Bot },
    { label: "First Directive", icon: Zap },
];

export function FoundingWizardDialog({ open, onOpenChange }: FoundingWizardDialogProps) {
    const [step, setStep] = useState(0);
    const [companyName, setCompanyName] = useState("");
    const [mission, setMission] = useState("");
    const [agentId, setAgentId] = useState("");
    const [model, setModel] = useState("");
    const [adapter, setAdapter] = useState("");
    const [taskTitle, setTaskTitle] = useState("");
    const [taskDesc, setTaskDesc] = useState("");

    const reset = () => {
        setStep(0);
        setCompanyName("");
        setMission("");
        setAgentId("");
        setModel("");
        setAdapter("");
        setTaskTitle("");
        setTaskDesc("");
    };

    const handleCreate = () => {
        // MOCKED: Would POST to backend
        console.log("Founding:", { companyName, mission, agentId, model, adapter, taskTitle, taskDesc });
        reset();
        onOpenChange(false);
    };

    const canNext = () => {
        if (step === 0) return companyName.trim().length > 0;
        if (step === 1) return agentId.trim().length > 0 && model.length > 0;
        if (step === 2) return taskTitle.trim().length > 0;
        return false;
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
            <DialogContent className="glass border-border/40 sm:max-w-lg p-0 gap-0 overflow-hidden">
                {/* Step indicator */}
                <div className="flex items-center gap-0 border-b border-border/20 px-6 pt-5 pb-4">
                    {STEPS.map((s, i) => {
                        const Icon = s.icon;
                        const isActive = i === step;
                        const isDone = i < step;
                        return (
                            <div key={s.label} className="flex items-center gap-2 flex-1">
                                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-mono transition-colors ${isDone ? "bg-primary text-primary-foreground" :
                                        isActive ? "border-2 border-primary text-primary" :
                                            "border border-border/40 text-muted-foreground"
                                    }`}>
                                    {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                                </div>
                                <span className={`text-xs font-medium hidden sm:block ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                                    {s.label}
                                </span>
                                {i < STEPS.length - 1 && (
                                    <div className={`flex-1 h-px mx-2 ${isDone ? "bg-primary" : "bg-border/30"}`} />
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="px-6 py-5 space-y-4 min-h-[220px]">
                    {step === 0 && (
                        <>
                            <DialogHeader className="space-y-1 p-0">
                                <DialogTitle className="text-base">The Founding</DialogTitle>
                                <DialogDescription className="text-xs">Define your organization's identity and mission.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 pt-1">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Organization Name <span className="text-destructive">*</span></Label>
                                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corp" className="h-9 bg-background/50 font-mono text-sm" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Mission / Goal</Label>
                                    <Textarea value={mission} onChange={(e) => setMission(e.target.value)} placeholder="Build intelligent automation pipelines..." className="min-h-[80px] bg-background/50 text-sm resize-none" />
                                </div>
                            </div>
                        </>
                    )}

                    {step === 1 && (
                        <>
                            <DialogHeader className="space-y-1 p-0">
                                <DialogTitle className="text-base">Agent Nucleus</DialogTitle>
                                <DialogDescription className="text-xs">Configure the first sentinel for your organization.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 pt-1">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Agent ID <span className="text-destructive">*</span></Label>
                                    <Input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="sentinel-alpha-01" className="h-9 bg-background/50 font-mono text-sm" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Model <span className="text-destructive">*</span></Label>
                                    <Select value={model} onValueChange={setModel}>
                                        <SelectTrigger className="h-9 bg-background/50 text-sm">
                                            <SelectValue placeholder="Select model" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                                            <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                                            <SelectItem value="claude-3.5-sonnet">Claude 3.5 Sonnet</SelectItem>
                                            <SelectItem value="claude-3-haiku">Claude 3 Haiku</SelectItem>
                                            <SelectItem value="gemini-pro">Gemini Pro</SelectItem>
                                            <SelectItem value="llama-3.1-70b">Llama 3.1 70B</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Adapter Type</Label>
                                    <Select value={adapter} onValueChange={setAdapter}>
                                        <SelectTrigger className="h-9 bg-background/50 text-sm">
                                            <SelectValue placeholder="Select adapter" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="direct">Direct API</SelectItem>
                                            <SelectItem value="langchain">LangChain</SelectItem>
                                            <SelectItem value="autogen">AutoGen</SelectItem>
                                            <SelectItem value="crewai">CrewAI</SelectItem>
                                            <SelectItem value="custom">Custom</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <DialogHeader className="space-y-1 p-0">
                                <DialogTitle className="text-base">First Directive</DialogTitle>
                                <DialogDescription className="text-xs">Define the inaugural task for your sentinel.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 pt-1">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Directive Title <span className="text-destructive">*</span></Label>
                                    <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Initialize codebase review" className="h-9 bg-background/50 text-sm" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Description</Label>
                                    <Textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="Scan repository for code quality issues..." className="min-h-[80px] bg-background/50 text-sm resize-none" />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 pb-5 flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)} disabled={step === 0} className="gap-1 text-xs">
                        <ChevronLeft className="h-3.5 w-3.5" /> Back
                    </Button>
                    {step < 2 ? (
                        <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={!canNext()} className="gap-1 text-xs">
                            Next <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    ) : (
                        <Button size="sm" onClick={handleCreate} disabled={!canNext()} className="gap-1 text-xs">
                            <Zap className="h-3.5 w-3.5" /> Found Organization
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Alias for Index.tsx — wraps props to match FoundationWizard interface */
export function FoundationWizard({ open, onClose, onFounded }: { open: boolean; onClose: () => void; onFounded: (data: any) => void }) {
    return <FoundingWizardDialog open={open} onOpenChange={(v) => { if (!v) onClose(); }} />;
}
