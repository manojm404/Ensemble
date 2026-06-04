import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Wand2, Sparkles, Loader2, ArrowRight, Gauge, Layers3, FileText, ShieldAlert } from "lucide-react";

interface MagicWandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (prompt: string, options: { agentCount: number; mode?: string; outputType?: string; maxCycles?: number; seed?: string; manualControl?: boolean }) => void;
  isGenerating: boolean;
}

const examplePrompts = [
  "Build a code review pipeline with testing and documentation",
  "Create a marketing campaign with strategy, copy, and visuals",
  "Set up a full-stack app with architecture, code, tests, and deployment",
  "Design a data analysis workflow with insights and reporting",
];

const depthLabels: Record<number, { label: string; description: string }> = {
  1: { label: "Lean", description: "Single-agent execution with minimal orchestration." },
  2: { label: "Focused", description: "Two-step handoff for a small but reliable workflow." },
  3: { label: "Balanced", description: "Recommended for most product-grade tasks." },
  4: { label: "Granular", description: "Adds separation for design, build, and QA." },
  5: { label: "Full", description: "Maximum step separation for complex deliverables." },
};

export function MagicWandDialog({ open, onOpenChange, onGenerate, isGenerating }: MagicWandDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [agentCount, setAgentCount] = useState(3);
  const [mode, setMode] = useState("auto");
  const [outputType, setOutputType] = useState("auto");
  const [maxCycles, setMaxCycles] = useState(8);
  const [seed, setSeed] = useState("");
  const [manualControl, setManualControl] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    } else {
      setPrompt("");
    }
  }, [open]);

  const handleSubmit = () => {
    if (!prompt.trim() || isGenerating) return;
    onGenerate(prompt.trim(), { agentCount, mode, outputType, maxCycles, seed: seed.trim() || undefined, manualControl: mode === "simulation" ? manualControl : false });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
            onClick={() => !isGenerating && onOpenChange(false)}
          />

          {/* Dialog wrapper — flex centering avoids transform conflicts with framer-motion */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-3xl mx-4 rounded-[2rem] border border-border/50 bg-card shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="relative overflow-hidden px-6 py-5 border-b border-border/30 flex items-center gap-4">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.04),transparent)]" />
                <div className="relative h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/15 shadow-sm">
                  <Wand2 className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="relative min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Magic Flow</p>
                  <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">Generate a governed workflow plan</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Describe the goal, generate a draft route, then review the selected agents before applying it to the canvas.</p>
                </div>
              </div>

              {/* Prompt area */}
              <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="p-5 space-y-4">
                  <div className="relative">
                    <Textarea
                      ref={textareaRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="e.g. Simulate a chaotic supply-chain investigation with private agent messages and a final report..."
                      className="min-h-[190px] bg-secondary/30 border-border/50 text-sm resize-none pr-4 rounded-2xl"
                      disabled={isGenerating}
                    />
                    {isGenerating && (
                      <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 rounded-2xl backdrop-blur-sm">
                        <div className="flex items-center gap-2 text-primary">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span className="text-sm font-medium">Generating workflow plan...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Example prompts */}
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Try an example</p>
                    <div className="flex flex-wrap gap-1.5">
                      {examplePrompts.map((example, i) => (
                        <button
                          key={i}
                          onClick={() => setPrompt(example)}
                          disabled={isGenerating}
                          className="text-[11px] px-2.5 py-1.5 rounded-xl bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-transparent hover:border-border/50 disabled:opacity-50"
                        >
                          {example.length > 50 ? example.slice(0, 50) + "…" : example}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-border/30 bg-secondary/10 p-5 lg:border-l lg:border-t-0">
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                      <div className="flex items-center gap-2">
                        <Layers3 className="h-4 w-4 text-primary" />
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">Runtime mode</p>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {["auto", "dag", "evented", "simulation"].map((item) => (
                          <button
                            key={item}
                            type="button"
                            disabled={isGenerating}
                            onClick={() => setMode(item)}
                            className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold capitalize transition-colors ${
                              mode === item
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border/50 bg-card/60 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Automation depth</p>
                        <span className="text-[10px] text-muted-foreground">{agentCount} agent{agentCount === 1 ? "" : "s"} · {depthLabels[agentCount]?.label}</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {[1, 2, 3, 4, 5].map((count) => (
                          <button
                            key={count}
                            type="button"
                            onClick={() => setAgentCount(count)}
                            disabled={isGenerating}
                            className={`h-9 rounded-xl border text-xs font-semibold transition-colors ${
                              agentCount === count
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border/50 bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                            }`}
                          >
                            {count}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {depthLabels[agentCount]?.description}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1">
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                          <FileText className="h-3 w-3" /> Output
                        </span>
                        <select
                          value={outputType}
                          onChange={(event) => setOutputType(event.target.value)}
                          className="h-10 w-full rounded-xl border border-border/60 bg-card px-3 text-xs font-semibold text-foreground outline-none"
                          disabled={isGenerating}
                        >
                          <option value="auto">Auto</option>
                          <option value="document">Document</option>
                          <option value="web_app">Web app</option>
                          <option value="code_package">Code package</option>
                          <option value="data">Data</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                          <Gauge className="h-3 w-3" /> Cycles
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={maxCycles}
                          onChange={(event) => setMaxCycles(Math.min(20, Math.max(1, Number(event.target.value) || 8)))}
                          className="h-10 w-full rounded-xl border border-border/60 bg-card px-3 text-xs font-semibold text-foreground outline-none"
                          disabled={isGenerating}
                        />
                      </label>
                    </div>

                    <label className="space-y-1 block">
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        <ShieldAlert className="h-3 w-3" /> Seed
                      </span>
                      <input
                        value={seed}
                        onChange={(event) => setSeed(event.target.value)}
                        placeholder="Optional reproducible chaos seed"
                        className="h-10 w-full rounded-xl border border-border/60 bg-card px-3 text-xs font-semibold text-foreground outline-none"
                        disabled={isGenerating}
                      />
                    </label>

                    {mode === "simulation" && (
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={() => setManualControl((value) => !value)}
                        className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors ${
                          manualControl
                            ? "border-primary/40 bg-primary/10 text-foreground"
                            : "border-border/50 bg-card/60 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          manualControl ? "border-primary bg-primary" : "border-muted-foreground/40"
                        }`}>
                          {manualControl && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                        </span>
                        <span>
                          <span className="block text-xs font-bold">Manual stepping</span>
                          <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">
                            Start paused after each logical cycle so the Live Run Board can step through checkpoints.
                          </span>
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-border/30 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  ⌘ + Enter to generate
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    disabled={isGenerating}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!prompt.trim() || isGenerating}
                    className="h-8 gap-1.5 text-xs font-semibold"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Create Draft Route
                    {!isGenerating && <ArrowRight className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
